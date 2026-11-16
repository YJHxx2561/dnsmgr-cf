/**
 * 核心业务路由：用户管理、DNS 账户、域名管理、解析记录
 * 精确复刻 ThinkPHP controller 的响应格式（code: 0成功/-1失败/-3未知，列表 {total,rows}）
 */
import type { RequestContext } from '../types';
import type { Router } from '../core/router';
import { db, execute } from '../db/database';
import { configGet, configSetMany } from '../core/config';
import { checkPermission } from '../auth/middleware';
import { now, passwordHash, random, md5 } from '../utils/crypto';
import { getProviderByAccount } from '../dns/factory';
import { DNS_CONFIG, RECORD_TYPE_SUPPORT } from '../dns/meta';
import { json, fail } from '../core/response';

function ok(msg: string, data?: any) { return json({ code: 0, msg, data }); }
function err(msg: string) { return fail(msg, -1); }
function denypage() { return json({ total: 0, rows: [] }); }
function int(v: any, def = 0) { const n = parseInt(String(v ?? ''), 10); return isNaN(n) ? def : n; }

/** 从 body 或 URL 末段解析 action */
function getAct(ctx: { url: URL; body: Record<string, any> }): string {
  const parts = ctx.url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const fromPath = ['add', 'edit', 'del', 'delete', 'get', 'set', 'setactive', 'open', 'pause', 'remark', 'group'].includes(last) ? last : '';
  return String(ctx.body.act || ctx.body.action || fromPath || '');
}

/* ==================== 用户管理 ==================== */

export async function userData(ctx: RequestContext): Promise<Response> {
  if (!checkPermission(ctx.user, 2)) return denypage();
  const { body, env } = ctx;
  const kw = String(body.kw || '').trim();
  const offset = int(body.offset), limit = int(body.limit, 10);
  const q = db(env, 'user');
  if (kw) q.whereLike('id|username', kw);
  const total = await q.count();
  const allowed: Record<string, string> = { id: 'id', username: 'username', level: 'level', is_api: 'is_api', regtime: 'regtime', lasttime: 'lasttime', status: 'status' };
  const sort = allowed[body.sortName];
  if (sort) q.order(sort, String(body.sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC');
  else q.order('id', 'DESC');
  const rows = await q.field('id,username,is_api,apikey,level,regtime,lasttime,totp_open,status').limit(offset, limit).select();
  return json({ total, rows });
}

export async function userOp(ctx: RequestContext): Promise<Response> {
  if (!checkPermission(ctx.user, 2)) return err('无权限');
  const { body, env, user } = ctx;
  const act = getAct(ctx);
  const id = int(body.id);

  if (act === 'get') {
    const row = await db(env, 'user').where('id', id).find();
    if (!row) return err('用户不存在');
    delete row.password; delete row.totp_secret;
    row.permission = await db(env, 'permission').where('uid', id).column('domain');
    return json({ code: 0, data: row });
  }

  if (act === 'add') {
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const isApi = int(body.is_api);
    const apikey = String(body.apikey || '');
    const level = int(body.level);
    if (!username || !password) return err('用户名或密码不能为空');
    if (isApi === 1 && !apikey) return err('API密钥不能为空');
    if (await db(env, 'user').where('username', username).find()) return err('用户名已存在');
    const uid = await db(env, 'user').insertGetId({
      username, password: await passwordHash(password), is_api: isApi, apikey,
      level, regtime: now(), status: 1,
    });
    if (level === 1 && uid) {
      const perms: string[] = Array.isArray(body.permission) ? body.permission : body.permission ? [body.permission] : [];
      for (const domain of perms) await db(env, 'permission').insert({ uid, domain, sub: null });
    }
    return ok('添加用户成功！');
  }

  if (act === 'edit') {
    const row = await db(env, 'user').where('id', id).find();
    if (!row) return err('用户不存在');
    let level = int(body.level);
    if (level === 1 && (id === 1000 || id === user!.id)) level = 2;
    const data: Record<string, any> = {
      username: String(body.username || '').trim(), is_api: int(body.is_api),
      apikey: String(body.apikey || ''), level,
    };
    if (body.repwd) data.password = await passwordHash(String(body.repwd));
    await db(env, 'user').where('id', id).update(data);
    await db(env, 'permission').where('uid', id).delete();
    if (level === 1) {
      const perms: string[] = Array.isArray(body.permission) ? body.permission : body.permission ? [body.permission] : [];
      for (const domain of perms) await db(env, 'permission').insert({ uid: id, domain, sub: null });
    }
    return ok('修改用户成功！');
  }

  if (act === 'set') {
    if (id === 1000) return err('此用户无法修改状态');
    if (id === user!.id) return err('当前登录用户无法修改状态');
    await db(env, 'user').where('id', id).update({ status: int(body.status) });
    return ok('操作成功');
  }

  if (act === 'del') {
    if (id === 1000) return err('此用户无法删除');
    if (id === user!.id) return err('当前登录用户无法删除');
    await db(env, 'user').where('id', id).delete();
    await db(env, 'permission').where('uid', id).delete();
    return ok('删除成功');
  }

  return json({ code: -3 });
}

export async function logData(ctx: RequestContext): Promise<Response> {
  const { body, env, user } = ctx;
  const q = db(env, 'log');
  if (user!.type === 'domain') q.where('domain', user!.username);
  else if (user!.level === 1) q.where('uid', user!.id);
  else if (body.uid) q.where('uid', int(body.uid));
  if (body.kw) q.whereRaw('(action LIKE ? OR data LIKE ?)', `%${body.kw}%`, `%${body.kw}%`);
  if (body.domain) q.where('domain', body.domain);
  const total = await q.count();
  const rows = await q.order('id', 'DESC').limit(int(body.offset), int(body.limit, 10)).select();
  return json({ total, rows });
}

/* ==================== DNS 账户管理 ==================== */

export async function accountData(ctx: RequestContext): Promise<Response> {
  if (!checkPermission(ctx.user, 2)) return denypage();
  const { body, env } = ctx;
  const kw = String(body.kw || '').trim();
  const q = db(env, 'account');
  if (kw) q.whereRaw('(name LIKE ? OR remark LIKE ?)', `%${kw}%`, `%${kw}%`);
  const total = await q.count();
  const allowed: Record<string, string> = { id: 'id', type: 'type', name: 'name', remark: 'remark', addtime: 'addtime' };
  const sort = allowed[body.sortName];
  if (sort) q.order(sort, String(body.sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC'); else q.order('id', 'DESC');
  const rows = await q.limit(int(body.offset), int(body.limit, 10)).select();
  for (const row of rows) {
    const meta = DNS_CONFIG[row.type];
    row.typename = meta?.name || row.type || '未知';
    row.icon = meta?.icon || '';
  }
  return json({ total, rows });
}

export async function accountOp(ctx: RequestContext): Promise<Response> {
  if (!checkPermission(ctx.user, 2)) return err('无权限');
  const { body, env } = ctx;
  const act = getAct(ctx);
  const id = int(body.id);

  if (act === 'add' || act === 'edit') {
    const type = String(body.type || '');
    const name = String(body.name || '').trim();
    const config = String(body.config || '').trim();
    const remark = String(body.remark || '').trim();
    if (!name || !config) return err('必填参数不能为空');
    if (!DNS_CONFIG[type]) return err(`DNS模块(${type})不存在`);
    // 唯一性校验
    const exists = await db(env, 'account').where('type', type).where('name', name).find();
    if (act === 'add' && exists) return err('域名账户已存在');
    if (act === 'edit' && exists && exists.id !== id) return err('域名账户已存在');
    let cfgObj: Record<string, any> = {};
    try { cfgObj = JSON.parse(config); } catch { return err('配置格式错误'); }

    // 验证密钥有效性（可跳过：Workers 网络环境可能受限）
    if (String(body.skipCheck || '') !== '1') {
      const { createProvider } = await import('../dns/factory');
      const p = createProvider(env, type, cfgObj);
      if (p && !await p.check()) return err('验证域名账户失败：' + p.getError() + '（如确认配置无误，可勾选"跳过密钥验证"重试）');
    }

    if (act === 'add') {
      await db(env, 'account').insert({ type, name, config, remark, addtime: now() });
      return ok('添加域名账户成功！');
    }
    await db(env, 'account').where('id', id).update({ type, name, config, remark });
    return ok('修改域名账户成功！');
  }

  if (act === 'del') {
    const count = await db(env, 'domain').where('aid', id).count();
    if (count > 0) return err('该域名账户下存在域名，无法删除');
    await db(env, 'account').where('id', id).delete();
    return ok('删除成功');
  }

  return json({ code: -3 });
}

/* ==================== 域名管理 ==================== */

export async function domainData(ctx: RequestContext): Promise<Response> {
  if (!checkPermission(ctx.user, 1)) return denypage();
  const { body, env, user } = ctx;
  const q = db(env, 'domain');
  q.join('account', 'dnsmgr_domain.aid = dnsmgr_account.id', 'INNER');
  if (body.id) q.where('dnsmgr_domain.id', int(body.id));
  else {
    if (body.kw) q.whereRaw('(dnsmgr_domain.name LIKE ? OR dnsmgr_domain.remark LIKE ?)', `%${body.kw}%`, `%${body.kw}%`);
    if (body.type) q.whereRaw('dnsmgr_account.type LIKE ?', `%${body.type}%`);
    if (body.aid) q.where('dnsmgr_domain.aid', int(body.aid));
    if (body.cid !== undefined && body.cid !== '') q.where('dnsmgr_domain.cid', int(body.cid));
    if (body.status == 2) q.whereRaw("dnsmgr_domain.expiretime <= datetime('now')");
    else if (body.status == 1) q.whereRaw("dnsmgr_domain.expiretime > datetime('now') AND dnsmgr_domain.expiretime <= datetime('now','+30 days')");
  }
  if (user!.level === 1) {
    q.where('dnsmgr_domain.is_hide', 0);
    if (user!.permissions.length) q.whereIn('dnsmgr_domain.name', user!.permissions);
    else q.whereRaw('0 = 1');
  }
  const total = await q.count();
  const allowed: Record<string, string> = {
    id: 'dnsmgr_domain.id', name: 'dnsmgr_domain.name', recordcount: 'dnsmgr_domain.recordcount',
    addtime: 'dnsmgr_domain.addtime', regtime: 'dnsmgr_domain.regtime', expiretime: 'dnsmgr_domain.expiretime',
    is_notice: 'dnsmgr_domain.is_notice', is_hide: 'dnsmgr_domain.is_hide', is_sso: 'dnsmgr_domain.is_sso',
    typename: 'dnsmgr_account.type', category_name: 'dnsmgr_domain.cid', remark: 'dnsmgr_domain.remark',
  };
  const sort = allowed[body.sortName];
  if (sort) q.orderRaw(`${sort} ${String(body.sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC'}`);
  else q.orderRaw('dnsmgr_domain.id DESC');
  const rows = await q.field('dnsmgr_domain.*, dnsmgr_account.type, dnsmgr_account.remark aremark').limit(int(body.offset), int(body.limit, 10)).select();
  const cats = new Map((await db(env, 'domain_category').select()).map((c: any) => [c.id, c.name]));
  for (const row of rows) {
    const meta = DNS_CONFIG[row.type];
    row.typename = meta?.name || row.type || '未知';
    row.icon = meta?.icon || '';
    row.category_name = cats.get(row.cid) || '';
  }
  return json({ total, rows });
}

export async function domainOp(ctx: RequestContext): Promise<Response> {
  const { body, env, user } = ctx;
  const act = getAct(ctx);
  const id = int(body.id);

  if (act === 'get') {
    const row = await db(env, 'domain').where('id', id).find();
    if (!row) return err('域名不存在');
    if (!checkPermission(user, 0, row.name)) return err('无权限');
    return json({ code: 0, data: row });
  }

  if (!checkPermission(user, 2)) return err('无权限');

  if (act === 'add') {
    const aid = int(body.aid);
    const method = int(body.method);
    let name = String(body.name || '').trim();
    let thirdid = String(body.thirdid || '').trim();
    const recordcount = int(body.recordcount);
    if ((method === 1 && !name) || (method === 0 && (!name || !thirdid))) return err('参数不能为空');
    if (await db(env, 'domain').where('aid', aid).where('name', name).find()) return err('域名已存在');
    if (method === 1) {
      const provider = await getProviderByAccount(env, aid, name, '');
      if (!provider) return err('获取DNS平台失败');
      const result = await provider.addDomain(name);
      if (!result) return err('添加域名失败，' + provider.getError());
      name = result.name; thirdid = result.id;
    }
    await db(env, 'domain').insert({ aid, name, thirdid, addtime: now(), is_hide: 0, is_sso: 1, recordcount });
    return ok('添加域名成功！');
  }

  if (act === 'edit') {
    const data: Record<string, any> = {
      is_hide: int(body.is_hide), is_sso: int(body.is_sso), is_notice: int(body.is_notice),
      cid: int(body.cid), remark: body.remark || null, expiretime: body.expiretime || null,
    };
    await db(env, 'domain').where('id', id).update(data);
    return ok('修改域名配置成功！');
  }

  if (act === 'del' || act === 'batchdel') {
    const ids: number[] = act === 'del' ? [id] : (Array.isArray(body.ids) ? body.ids.map(Number) : []);
    for (const did of ids) {
      await db(env, 'domain').where('id', did).delete();
      await db(env, 'domain_alias').where('did', did).delete();
      await db(env, 'dmtask').where('did', did).delete();
      await db(env, 'optimizeip').where('did', did).delete();
      await db(env, 'sctask').where('did', did).delete();
    }
    return ok(act === 'del' ? '删除成功' : `成功删除${ids.length}个域名！`);
  }

  if (act === 'batchadd') {
    const aid = int(body.aid);
    const domains: any[] = Array.isArray(body.domains) ? body.domains : [];
    for (const d of domains) {
      await db(env, 'domain').insert({ aid, name: d.name, thirdid: d.id || '', addtime: now(), is_hide: 0, is_sso: 1, recordcount: int(d.recordcount) });
    }
    return ok(`成功添加${domains.length}个域名！`);
  }

  if (act === 'batchedit') {
    const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    for (const did of ids) await db(env, 'domain').where('id', did).update({ remark: body.remark || null });
    return ok(`成功修改${ids.length}个域名！`);
  }

  if (act === 'batchsetnotice') {
    const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    for (const did of ids) await db(env, 'domain').where('id', did).update({ is_notice: int(body.is_notice) });
    return ok(`成功修改${ids.length}个域名！`);
  }

  if (act === 'updateexpire') {
    const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    for (const did of ids) await db(env, 'domain').where('id', did).update({ checkstatus: 0 });
    return ok(`已提交${ids.length}个域名，约${Math.ceil(ids.length / 5)}分钟后刷新完成。`);
  }

  return json({ code: -3 });
}

export async function domainList(ctx: RequestContext): Promise<Response> {
  if (!checkPermission(ctx.user, 2)) return err('无权限');
  const { body, env } = ctx;
  const provider = await getProviderByAccount(env, int(body.aid), '', '');
  if (!provider) return err('获取DNS平台失败');
  const result = await provider.getDomainList(String(body.kw || ''), int(body.page, 1), int(body.pagesize, 10));
  if (!result) return err('获取域名列表失败，' + provider.getError());
  for (const row of result.list) {
    row.disabled = !!(await db(env, 'domain').where('aid', int(body.aid)).where('name', row.Domain).find());
  }
  return json({ code: 0, data: { total: result.total, list: result.list } });
}

/* ==================== 解析记录（实时从平台拉取，不存本地库） ==================== */

async function getDomainForRecord(ctx: RequestContext, id: number) {
  const row = await db(ctx.env, 'domain').where('id', id).find();
  if (!row || !checkPermission(ctx.user, 0, row.name)) return null;
  return row;
}

export async function recordData(ctx: RequestContext): Promise<Response> {
  const id = int(ctx.params.id || ctx.body.id);
  const drow = await getDomainForRecord(ctx, id);
  if (!drow) return denypage();
  const { body, env } = ctx;
  const provider = await getProviderByAccount(env, drow.aid, drow.name, drow.thirdid);
  if (!provider) return denypage();
  const result = await provider.getDomainRecords(
    int(body.offset, 0) / int(body.limit, 10) + 1, int(body.limit, 10),
    body.keyword, body.subdomain, body.value, body.type, body.line, body.status,
    body.sortName, body.sortOrder || 'asc'
  );
  if (!result) return denypage();
  // 无筛选时同步 recordcount
  if (!body.keyword && !body.subdomain && !body.type && !body.line && !body.status && !body.value && result.total != drow.recordcount) {
    await db(env, 'domain').where('id', id).update({ recordcount: result.total });
  }
  // 元数据显示 page=true 的平台直接返回裸数组
  const meta = DNS_CONFIG[(await db(env, 'account').where('id', drow.aid).value('type')) || ''];
  if (meta?.page) return json(result.list);
  return json({ total: result.total, rows: result.list });
}

async function logAction(ctx: RequestContext, domain: string, action: string, data: string) {
  if (data.length > 500) data = data.substring(0, 500);
  await db(ctx.env, 'log').insert({ uid: ctx.user?.id ?? 0, domain, action, data, addtime: now() });
}

export async function recordAdd(ctx: RequestContext): Promise<Response> {
  const drow = await getDomainForRecord(ctx, int(ctx.params.id));
  if (!drow) return err('无权限');
  const { body, env } = ctx;
  const name = String(body.name || '').trim(), type = String(body.type || '').trim(), value = String(body.value || '').trim();
  if (!name || !type || !value) return err('参数不能为空');
  if (type === 'ALIAS' && !RECORD_TYPE_SUPPORT[(await db(env, 'account').where('id', drow.aid).value('type')) || '']?.includes('ALIAS')) {
    return err('当前DNS提供商不支持ALIAS记录');
  }
  const provider = await getProviderByAccount(env, drow.aid, drow.name, drow.thirdid);
  if (!provider) return err('获取DNS平台失败');
  const recordid = await provider.addDomainRecord(name, type, value, String(body.line || ''), int(body.ttl, 600), int(body.mx, 1), int(body.weight), body.remark);
  if (!recordid) return err('添加解析记录失败，' + provider.getError());
  await logAction(ctx, drow.name, '添加解析', `${name} [${type}] ${value} (线路:${body.line} TTL:${body.ttl})`);
  return ok('添加解析记录成功！');
}

export async function recordUpdate(ctx: RequestContext): Promise<Response> {
  const drow = await getDomainForRecord(ctx, int(ctx.params.id));
  if (!drow) return err('无权限');
  const { body, env } = ctx;
  const recordid = String(body.recordid || ''), name = String(body.name || ''), type = String(body.type || ''), value = String(body.value || '');
  if (!recordid || !name || !type || !value) return err('参数不能为空');
  const provider = await getProviderByAccount(env, drow.aid, drow.name, drow.thirdid);
  if (!provider) return err('获取DNS平台失败');
  const result = await provider.updateDomainRecord(recordid, name, type, value, String(body.line || ''), int(body.ttl, 600), int(body.mx, 1), int(body.weight), body.remark);
  if (!result) return err('修改解析记录失败，' + provider.getError());
  await logAction(ctx, drow.name, '修改解析', `${name} [${type}] ${value} (线路:${body.line} TTL:${body.ttl})`);
  return ok('修改解析记录成功！');
}

export async function recordDelete(ctx: RequestContext): Promise<Response> {
  const drow = await getDomainForRecord(ctx, int(ctx.params.id));
  if (!drow) return err('无权限');
  const recordid = String(ctx.body.recordid || '');
  if (!recordid) return err('参数不能为空');
  const provider = await getProviderByAccount(ctx.env, drow.aid, drow.name, drow.thirdid);
  if (!provider) return err('获取DNS平台失败');
  if (!await provider.deleteDomainRecord(recordid)) return err('删除解析记录失败，' + provider.getError());
  await logAction(ctx, drow.name, '删除解析', '记录ID:' + recordid);
  return ok('删除解析记录成功！');
}

export async function recordStatus(ctx: RequestContext): Promise<Response> {
  const drow = await getDomainForRecord(ctx, int(ctx.params.id));
  if (!drow) return err('无权限');
  const { body, env } = ctx;
  const recordid = String(body.recordid || ''), status = String(body.status || '0');
  if (!recordid) return err('参数不能为空');
  const provider = await getProviderByAccount(env, drow.aid, drow.name, drow.thirdid);
  if (!provider) return err('获取DNS平台失败');
  if (!await provider.setDomainRecordStatus(recordid, status)) return err('操作失败，' + provider.getError());
  await logAction(ctx, drow.name, status === '1' ? '启用解析' : '暂停解析', '记录ID:' + recordid);
  return ok('操作成功！');
}

export async function recordRemark(ctx: RequestContext): Promise<Response> {
  const drow = await getDomainForRecord(ctx, int(ctx.params.id));
  if (!drow) return err('无权限');
  const { body, env } = ctx;
  const recordid = String(body.recordid || '');
  if (!recordid) return err('参数不能为空');
  const provider = await getProviderByAccount(env, drow.aid, drow.name, drow.thirdid);
  if (!provider) return err('获取DNS平台失败');
  if (!await provider.updateDomainRecordRemark(recordid, body.remark || null)) return err('操作失败，' + provider.getError());
  return ok('操作成功！');
}

export async function recordBatch(ctx: RequestContext): Promise<Response> {
  const drow = await getDomainForRecord(ctx, int(ctx.params.id));
  if (!drow) return err('无权限');
  const { body, env } = ctx;
  const action = String(body.action || '');
  let records: any[] = [];
  try { records = JSON.parse(String(body.recordinfo || '[]')); } catch { return err('参数不能为空'); }
  if (!records.length && action !== 'group') return err('参数不能为空');
  const provider = await getProviderByAccount(env, drow.aid, drow.name, drow.thirdid);
  if (!provider) return err('获取DNS平台失败');
  let okCount = 0, failCount = 0;
  for (const r of records) {
    const rid = String(r.RecordId || '');
    let result = false;
    if (action === 'open') result = await provider.setDomainRecordStatus(rid, '1');
    else if (action === 'pause') result = await provider.setDomainRecordStatus(rid, '0');
    else if (action === 'delete') result = await provider.deleteDomainRecord(rid);
    else if (action === 'remark') result = await provider.updateDomainRecordRemark(rid, body.remark || null);
    if (result) okCount++; else failCount++;
  }
  if (action === 'group') {
    const type = await db(env, 'account').where('id', drow.aid).value('type');
    if (type !== 'aliyun' && type !== 'dnspod') return err('该DNS类型不支持分组');
    if (!await provider.changeRecordGroup(records.map((r) => String(r.RecordId)), String(body.groupid || ''))) return err('修改分组失败，' + provider.getError());
    return ok(`成功修改${records.length}条记录分组`);
  }
  const msgs: Record<string, string> = { open: '启用', pause: '暂停', delete: '删除' };
  return ok(action === 'remark' ? `批量修改备注，成功${okCount}条，失败${failCount}条` : `成功${msgs[action] || '操作'}${okCount}条解析记录`);
}
