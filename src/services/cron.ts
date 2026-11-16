/**
 * 定时任务服务（替代原 crontab certtask + Swoole dmtask 常驻进程）
 * 由 Cloudflare Cron Trigger 每分钟触发，也支持 /cron?key= 手动/URL 触发。
 * 任务节流沿用原设计：config 表时间戳。
 */
import type { Env } from '../types';
import { db, dbFull } from '../db/database';
import { configGet, configSet, loadConfigs } from '../core/config';
import { getProviderByAccount } from '../dns/factory';
import { timestamp, now, getDnsType } from '../utils/crypto';
import { sendNotice } from '../notify/notice';

/** 定时任务主入口 */
export async function runCronTasks(env: Env): Promise<string[]> {
  const logs: string[] = [];
  const configs = await loadConfigs(env);
  const nowSec = timestamp();

  // 1. 容灾检测（原 dmtask 常驻 -> 分钟轮询）
  logs.push(await runDmonitor(env));

  // 2. 定时切换解析（schedule_time，默认 5 分钟）
  const scheduleTime = Number(await configGet(env, 'schedule_time', 0, configs));
  if (nowSec - scheduleTime >= 60) {
    await configSet(env, 'schedule_time', nowSec);
    logs.push(await runSchedule(env));
  }

  // 3. CF 优选 IP（optimize_ip_time，默认 30 分钟）
  const optTime = Number(await configGet(env, 'optimize_ip_time', 0, configs));
  const optInterval = Number(await configGet(env, 'optimize_ip_interval', 30, configs)) * 60;
  if (nowSec - optTime >= optInterval) {
    await configSet(env, 'optimize_ip_time', nowSec);
    logs.push(await runOptimizeIp(env));
  }

  // 4. SSL 证书续签/部署（certtask_time，默认 10 分钟）
  const certTime = Number(await configGet(env, 'certtask_time', 0, configs));
  if (nowSec - certTime >= 600) {
    await configSet(env, 'certtask_time', nowSec);
    logs.push(await runCertTasks(env));
  }

  // 5. 域名到期提醒（domain_expire_time，默认 1 天）
  const expireTime = Number(await configGet(env, 'domain_expire_time', 0, configs));
  if (nowSec - expireTime >= 86400) {
    await configSet(env, 'domain_expire_time', nowSec);
    logs.push(await runExpireNotice(env));
  }

  return logs.filter(Boolean);
}

/** 容灾检测：HTTP(S) 探测（替代 ping/tcp；ping/tcp 统一用 HTTP 健康检查） */
async function runDmonitor(env: Env): Promise<string> {
  let checked = 0, switched = 0;
  const tasks = await db(env, 'dmtask').where('active', 1).where('status', 0).limit(0, 50).select();
  for (const row of tasks) {
    if (Number(row.checknexttime) > timestamp()) continue;
    checked++;
    const result = await healthCheck(row);
    const cycle = Number(row.cycle) || 1;
    let action = 0;
    if (result.ok && Number(row.status) === 1) {
      if (cycle <= 1 || Number(row.errcount) >= cycle) {
        await db(env, 'dmtask').where('id', row.id).update({ status: 0, errcount: 0, switchtime: timestamp() });
        action = 2; // 恢复正常
      } else {
        await env.DB.prepare('UPDATE dnsmgr_dmtask SET errcount = errcount + 1 WHERE id = ?').bind(row.id).run();
      }
    } else if (!result.ok && Number(row.status) === 0) {
      if (cycle <= 1 || Number(row.errcount) >= cycle) {
        await db(env, 'dmtask').where('id', row.id).update({ status: 1, errcount: 0, switchtime: timestamp() });
        action = 1; // 切换到备用
      } else {
        await env.DB.prepare('UPDATE dnsmgr_dmtask SET errcount = errcount + 1 WHERE id = ?').bind(row.id).run();
      }
    }
    // 更新下次检查时间
    await db(env, 'dmtask').where('id', row.id).update({ checktime: timestamp(), checknexttime: timestamp() + (Number(row.frequency) || 1) * 60 });

    if (action > 0) {
      const drow = await db(env, 'domain').where('id', row.did).find();
      if (!drow) continue;
      const provider = await getProviderByAccount(env, drow.aid, drow.name, drow.thirdid);
      if (provider) {
        let recordinfo: any = {};
        try { recordinfo = JSON.parse(row.recordinfo || '{}'); } catch {}
        if (action === 1) {
          if (Number(row.type) === 2) {
            await provider.updateDomainRecord(row.recordid, row.rr, getDnsType(row.backup_value), row.backup_value, recordinfo.Line || 'default', recordinfo.TTL || 600, recordinfo.MX || 1, recordinfo.Weight || 0);
          } else {
            await provider.setDomainRecordStatus(row.recordid, '0');
          }
        } else {
          if (Number(row.type) === 2) {
            await provider.updateDomainRecord(row.recordid, row.rr, getDnsType(row.main_value), row.main_value, recordinfo.Line || 'default', recordinfo.TTL || 600, recordinfo.MX || 1, recordinfo.Weight || 0);
          } else {
            await provider.setDomainRecordStatus(row.recordid, '1');
          }
        }
      }
      await db(env, 'dmlog').insert({ taskid: row.id, action, errmsg: result.ok ? null : result.msg, date: now() });
      await sendNotice(env, action, { ...row, domain: `${row.rr}.${drow.name}` }, result);
      switched++;
    }
  }
  return `容灾检测：检查${checked}项，切换${switched}次`;
}

/** HTTP 健康检查（ping/tcp 均转为 HTTP 探测） */
async function healthCheck(row: any): Promise<{ ok: boolean; msg: string }> {
  let url = String(row.checkurl || '').trim();
  if (!url) return { ok: false, msg: '未配置检测地址' };
  // 若是 IP/域名，构造成 http 探测；若已是完整 URL 直接用
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), (Number(row.timeout) || 2) * 1000);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'dnsmgr-healthcheck' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    return { ok: resp.status >= 200 && resp.status < 500, msg: resp.status >= 500 ? `HTTP ${resp.status}` : '' };
  } catch (e: any) {
    clearTimeout(timeout);
    return { ok: false, msg: e?.name === 'AbortError' ? '超时' : (e?.message || '连接失败') };
  }
}

/** 定时切换解析 */
async function runSchedule(env: Env): Promise<string> {
  const nowSec = timestamp();
  const tasks = await db(env, 'sctask').where('active', 1).limit(0, 30).select();
  let count = 0;
  for (const row of tasks) {
    if (Number(row.nexttime) > nowSec) continue;
    const drow = await db(env, 'domain').where('id', row.did).find();
    if (!drow) continue;
    const provider = await getProviderByAccount(env, drow.aid, drow.name, drow.thirdid);
    if (!provider) continue;
    let recordinfo: any = {};
    try { recordinfo = JSON.parse(row.recordinfo || '{}'); } catch {}
    // switchtype: 0修改记录值 1启用 2暂停 3删除
    const switchType = Number(row.switchtype);
    if (switchType === 0) {
      await provider.updateDomainRecord(row.recordid, row.rr, recordinfo.Type || 'A', row.value, recordinfo.Line || 'default', recordinfo.TTL || 600, recordinfo.MX || 1, recordinfo.Weight || 0);
    } else if (switchType === 1) {
      await provider.setDomainRecordStatus(row.recordid, '1');
    } else if (switchType === 2) {
      await provider.setDomainRecordStatus(row.recordid, '0');
    } else if (switchType === 3) {
      await provider.deleteDomainRecord(row.recordid);
    }
    // 计算下次执行时间（cycle: 1每天 2每周 3每月）
    let next = nowSec + 86400;
    const cycle = Number(row.cycle);
    if (cycle === 2) next = nowSec + 7 * 86400;
    else if (cycle === 3) next = nowSec + 30 * 86400;
    await db(env, 'sctask').where('id', row.id).update({ nexttime: next, updatetime: nowSec });
    count++;
  }
  return `定时切换：执行${count}项`;
}

/** CF 优选 IP（预留接口：实际优选逻辑依赖外部 API，这里更新状态时间） */
async function runOptimizeIp(env: Env): Promise<string> {
  const tasks = await db(env, 'optimizeip').where('active', 1).limit(0, 20).select();
  let count = 0;
  for (const row of tasks) {
    // 优选 IP 的实际探测需访问 Cloudflare IP 列表，受 Worker 时长限制，
    // 这里保留任务调度框架，具体优选算法可由外部 API 提供。
    await db(env, 'optimizeip').where('id', row.id).update({ updatetime: now() });
    count++;
  }
  return `优选IP：处理${count}项`;
}

/** SSL 证书任务（检查待签发/待部署订单，调用 ACME 服务） */
async function runCertTasks(env: Env): Promise<string> {
  const { processCertOrders } = await import('./cert');
  const result = await processCertOrders(env);
  return `证书任务：${result}`;
}

/** 域名到期提醒（whois 到期检测改为通过 HTTP API，此处按已有 expiretime 字段判断） */
async function runExpireNotice(env: Env): Promise<string> {
  const maxDay = Number(await configGet(env, 'domain_expire_notice_day', 30)) || 30;
  const rows = await db(env, 'domain').where('is_notice', 1).limit(0, 20).select();
  let count = 0;
  for (const row of rows) {
    if (!row.expiretime) continue;
    const expire = new Date(String(row.expiretime).replace(' ', 'T') + 'Z').getTime();
    const daysLeft = (expire - Date.now()) / 86400000;
    if (daysLeft <= maxDay && daysLeft > 0) {
      await sendNotice(env, 3, { domain: row.name, days: Math.floor(daysLeft) }, { ok: true, msg: '' });
      count++;
    }
  }
  return `到期提醒：${count}个域名`;
}
