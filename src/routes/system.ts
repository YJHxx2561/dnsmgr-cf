/**
 * 系统设置、容灾任务、定时切换、证书、优选IP、分类等管理接口
 */
import type { RequestContext } from '../types';
import type { Router } from '../core/router';
import { db } from '../db/database';
import { configSetMany, configGet, loadConfigs, clearConfigCache } from '../core/config';
import { checkPermission } from '../auth/middleware';
import { now } from '../utils/crypto';
import { json, fail } from '../core/response';

function ok(msg: string, data?: any) { return json({ code: 0, msg, data }); }
function err(msg: string) { return fail(msg, -1); }
function denypage() { return json({ total: 0, rows: [] }); }
function int(v: any, d = 0) { const n = parseInt(String(v ?? ''), 10); return isNaN(n) ? d : n; }

/* ==================== 系统设置 ==================== */

export async function systemSet(ctx: RequestContext): Promise<Response> {
  if (!checkPermission(ctx.user, 2)) return err('无权限');
  const { body, env } = ctx;
  const params: Record<string, any> = { ...body };
  // 兼容原 System::set 的特殊规则
  if (params.mail_type && int(params.mail_type) > 0 && params.mail_name2) {
    params.mail_name = params.mail_name2;
    delete params.mail_name2;
  }
  if ('qqbot_appid' in params || 'qqbot_appsecret' in params) {
    const oldId = await configGet(env, 'qqbot_appid', '');
    const oldSecret = await configGet(env, 'qqbot_appsecret', '');
    const newId = 'qqbot_appid' in params ? String(params.qqbot_appid) : oldId;
    const newSecret = 'qqbot_appsecret' in params ? String(params.qqbot_appsecret) : oldSecret;
    if (newId !== oldId || newSecret !== oldSecret) params.qqbot_openid = '';
  }
  delete params.act; delete params.action;
  await configSetMany(env, params);
  return ok('succ');
}

export async function systemConfigs(ctx: RequestContext): Promise<Response> {
  if (!checkPermission(ctx.user, 2)) return err('无权限');
  const configs = await loadConfigs(ctx.env);
  return json({ code: 0, data: Object.fromEntries(configs) });
}

/** 系统信息（首页） */
export async function systemInfo(ctx: RequestContext): Promise<Response> {
  const { env } = ctx;
  const [domainCount, accountCount, recordcount] = await Promise.all([
    db(env, 'domain').count(),
    db(env, 'account').count(),
    db(env, 'domain').column('recordcount'),
  ]);
  return json({
    code: 0,
    data: {
      domain_count: domainCount,
      account_count: accountCount,
      record_count: (recordcount as number[]).reduce((a, b) => a + (Number(b) || 0), 0),
      version: await configGet(env, 'version', '1049'),
      db_type: 'D1 (SQLite)',
      platform: 'Cloudflare Workers',
    },
  });
}

/** 清缓存 */
export async function cleanCache(ctx: RequestContext): Promise<Response> {
  await clearConfigCache(ctx.env);
  return ok('缓存已清理');
}

/* ==================== 通用列表/操作工厂（容灾任务/定时切换/证书/优选IP） ==================== */

function listHandler(table: string, searchFields: string[] = []) {
  return async (ctx: RequestContext): Promise<Response> => {
    const { body, env } = ctx;
    const q = db(env, table);
    if (body.kw && searchFields.length) {
      q.whereRaw('(' + searchFields.map((f) => `${f} LIKE ?`).join(' OR ') + ')', ...searchFields.map(() => `%${body.kw}%`));
    }
    if (body.did) q.where('did', int(body.did));
    if (body.status !== undefined && body.status !== '') q.where('status', int(body.status));
    const total = await q.count();
    const sort = body.sortName;
    if (sort) q.order(sort, String(body.sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC');
    const rows = await q.limit(int(body.offset), int(body.limit, 10)).select();
    return json({ total, rows });
  };
}

/** 通用单表 CRUD 操作
 *  options.defaults: add 时写入的固定默认值（如 int 时间戳、初始状态）
 */
function opHandler(
  table: string,
  fields: Record<string, (v: any) => any>,
  options: { defaults?: Record<string, any>; timeField?: 'int' | 'datetime' | 'none' } = {}
) {
  const defaults = options.defaults || {};
  const timeField = options.timeField ?? 'datetime';
  return async (ctx: RequestContext): Promise<Response> => {
    const { body, env } = ctx;
    // action 可能来自 body，也可能来自 URL 最后一段（如 /domain/category/add）
    const pathParts = ctx.url.pathname.split('/').filter(Boolean);
    const pathAction = pathParts[pathParts.length - 1] || '';
    const act = String(body.act || body.action || (['add', 'edit', 'del', 'delete', 'get', 'set', 'setactive'].includes(pathAction) ? pathAction : ''));
    const id = int(body.id);

    if (act === 'get') {
      const row = await db(env, table).where('id', id).find();
      return row ? json({ code: 0, data: row }) : err('记录不存在');
    }
    if (act === 'add') {
      const data: Record<string, any> = { ...defaults };
      for (const [k, fn] of Object.entries(fields)) if (k in body) data[k] = fn(body[k]);
      if (timeField === 'int' && !('addtime' in data)) data.addtime = Math.floor(Date.now() / 1000);
      else if (timeField === 'datetime' && !('addtime' in data)) data.addtime = now();
      const newId = await db(env, table).insertGetId(data);
      return newId ? ok('添加成功！', { id: newId }) : err('添加失败');
    }
    if (act === 'edit') {
      const data: Record<string, any> = {};
      for (const [k, fn] of Object.entries(fields)) if (k in body) data[k] = fn(body[k]);
      await db(env, table).where('id', id).update(data);
      return ok('修改成功！');
    }
    if (act === 'del' || act === 'delete') {
      await db(env, table).where('id', id).delete();
      return ok('删除成功');
    }
    if (act === 'set' && body.status !== undefined) {
      await db(env, table).where('id', id).update({ status: int(body.status), active: int(body.active, 1) });
      return ok('操作成功');
    }
    if (act === 'setactive') {
      await db(env, table).where('id', id).update({ active: int(body.active) });
      return ok('操作成功');
    }
    return json({ code: -3 });
  };
}

// 容灾任务
export const dmtaskData = listHandler('dmtask', ['rr', 'main_value', 'remark']);
export const dmtaskOp = opHandler('dmtask', {
  did: int, rr: String, recordid: String, type: int, main_value: String, backup_value: String,
  checktype: int, checkurl: String, tcpport: (v) => (v === '' || v === null || v === undefined ? null : int(v)),
  frequency: int, cycle: int, timeout: int, remark: String, proxy: int, cdn: int,
  recordinfo: String,
}, { defaults: { active: 1, status: 0, checktime: 0, checknexttime: 0, switchtime: 0, errcount: 0 }, timeField: 'int' });
export const dmlogData = listHandler('dmlog', ['errmsg']);

// 定时切换
export const staskData = listHandler('sctask', ['rr', 'remark']);
export const staskOp = opHandler('sctask', {
  did: int, rr: String, recordid: String, type: int, cycle: int, switchtype: int,
  switchdate: String, switchtime: String, value: String, line: String, remark: String,
  recordinfo: String,
}, { defaults: { active: 1, nexttime: 0, updatetime: 0 }, timeField: 'int' });

// 优选IP
export const optimizeipData = listHandler('optimizeip', ['rr', 'remark']);
export const optimizeipOp = opHandler('optimizeip', {
  did: int, rr: String, type: int, ip_type: String, cdn_type: int, recordnum: int,
  ttl: int, remark: String,
}, { defaults: { status: 0, active: 1, cdn_type: 1 }, timeField: 'datetime' });

/** 手动执行优选IP任务（刷新时间戳，实际优选由 cron 分步处理） */
export async function optimizeipRun(ctx: RequestContext): Promise<Response> {
  if (!checkPermission(ctx.user, 2)) return err('无权限');
  const id = int(ctx.body.id);
  if (!id) return err('参数错误');
  await db(ctx.env, 'optimizeip').where('id', id).update({ updatetime: now() });
  return ok('已提交执行，优选任务将在下一轮定时任务中处理');
}

// 域名分类
export const categoryData = listHandler('domain_category', ['name', 'remark']);
export const categoryOp = opHandler('domain_category', { name: String, remark: String, sort: int });

/* ==================== 证书管理 ==================== */

/** 证书账户列表：deploy=0 为SSL证书账户，deploy=1 为部署账户 */
export const certAccountData = async (ctx: RequestContext): Promise<Response> => {
  const { body, env } = ctx;
  const q = db(env, 'cert_account');
  if (body.kw) q.whereRaw('(name LIKE ? OR remark LIKE ?)', `%${body.kw}%`, `%${body.kw}%`);
  const deploy = body.deploy !== undefined && body.deploy !== '' ? int(body.deploy) : 0;
  q.where('deploy', deploy);
  const total = await q.count();
  const rows = await q.order('id', 'DESC').limit(int(body.offset), int(body.limit, 100)).select();
  return json({ total, rows });
};
export const certAccountOp = opHandler('cert_account', {
  type: String, name: String, config: String, ext: String, remark: String, deploy: int,
});
export const certOrderData = listHandler('cert_order', ['issuer', 'error']);
export const certDeployData = listHandler('cert_deploy', ['remark', 'error']);
export const certDeployOp = opHandler('cert_deploy', {
  aid: int, oid: int, config: String, remark: String,
}, { defaults: { status: 0, active: 1, retry: 0 } });
export const certCnameData = listHandler('cert_cname', ['domain', 'rr']);
export const certCnameOp = opHandler('cert_cname', { domain: String, did: int, rr: String });

export async function certOrderProcess(ctx: RequestContext): Promise<Response> {
  if (!checkPermission(ctx.user, 2)) return err('无权限');
  const { processCertOrders } = await import('../services/cert');
  const result = await processCertOrders(ctx.env);
  return ok(result);
}

/** 证书订单操作：add（含 cert_domain 关联）/ edit / del / setauto / get */
export async function certOrderAdd(ctx: RequestContext): Promise<Response> {
  if (!checkPermission(ctx.user, 2)) return err('无权限');
  const { body, env } = ctx;
  const act = String(body.act || body.action || 'add');
  const id = int(body.id);

  if (act === 'get') {
    const row = await db(env, 'cert_order').where('id', id).find();
    if (!row) return err('订单不存在');
    const domains = await db(env, 'cert_domain').where('oid', id).order('sort').column('domain');
    return json({ code: 0, data: { ...row, domains } });
  }
  if (act === 'del' || act === 'delete') {
    await db(env, 'cert_order').where('id', id).delete();
    await db(env, 'cert_domain').where('oid', id).delete();
    return ok('删除成功');
  }
  if (act === 'setauto') {
    await db(env, 'cert_order').where('id', id).update({ isauto: int(body.isauto) });
    return ok('操作成功');
  }
  if (act === 'edit') {
    const domains: string[] = Array.isArray(body.domains) ? body.domains : (body.domain ? [body.domain] : []);
    if (!id || !domains.length || !body.aid) return err('参数不能为空');
    await db(env, 'cert_order').where('id', id).update({
      aid: int(body.aid), keytype: body.keytype || 'RSA', keysize: body.keysize || '2048',
      isauto: int(body.isauto),
    });
    await db(env, 'cert_domain').where('oid', id).delete();
    for (let i = 0; i < domains.length; i++) await db(env, 'cert_domain').insert({ oid: id, domain: domains[i], sort: i });
    return ok('修改成功！');
  }

  // 默认 add
  const domains: string[] = Array.isArray(body.domains) ? body.domains : (body.domain ? [body.domain] : []);
  if (!domains.length || !body.aid) return err('参数不能为空');
  const oid = await db(env, 'cert_order').insertGetId({
    aid: int(body.aid), keytype: body.keytype || 'RSA', keysize: body.keysize || '2048',
    addtime: now(), status: 0, isauto: int(body.isauto),
  });
  if (!oid) return err('添加失败');
  for (let i = 0; i < domains.length; i++) {
    await db(env, 'cert_domain').insert({ oid, domain: domains[i], sort: i });
  }
  return ok('添加证书订单成功！', { id: oid });
}

/** 清容灾日志 */
export async function dmonitorClean(ctx: RequestContext): Promise<Response> {
  if (!checkPermission(ctx.user, 2)) return err('无权限');
  await db(ctx.env, 'dmlog').whereRaw('1 = 1').delete();
  return ok('清理成功');
}
