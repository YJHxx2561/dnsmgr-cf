/**
 * 鉴权中间件
 * 兼容原系统的三种鉴权：
 *   1. Web 后台：无状态 cookie user_token（authcode 加密，与 PHP 完全一致）
 *   2. API：uid + timestamp + md5(uid.timestamp.apikey) 签名
 *   3. MCP：Authorization: Bearer <uid>:<apikey>
 */

import type { AuthUser, Env, RequestContext } from '../types';
import { authcode, md5 } from '../utils/crypto';
import { db } from '../db/database';
import { getSysKey, loadConfigs } from '../core/config';
import { fail } from '../core/response';

/** 解析 cookie 头 */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.substring(0, idx).trim();
    const v = part.substring(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

/** 签发登录 cookie（与 PHP loginUser/loginDomain 一致） */
export async function issueUserToken(env: Env, type: 'user' | 'domain', id: number, credential: string, expireSeconds = 2562000): Promise<{ token: string; expire: number }> {
  const sysKey = await getSysKey(env);
  const sid = md5(`${id}${credential}`);
  const expire = Math.floor(Date.now() / 1000) + expireSeconds;
  const plain = `${type}\t${id}\t${sid}\t${expire}`;
  const token = authcode(plain, 'ENCODE', sysKey);
  return { token, expire };
}

/** 构造 Set-Cookie 头 */
export function cookieHeader(name: string, value: string, expire?: number): string {
  const maxAge = expire ? `; Max-Age=${expire - Math.floor(Date.now() / 1000)}` : '';
  const expires = expire ? `; Expires=${new Date(expire * 1000).toUTCString()}` : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${maxAge}${expires}`;
}

/** 从请求解析 Web 登录用户 */
export async function resolveWebUser(request: Request, env: Env): Promise<AuthUser | null> {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const token = cookies['user_token'];
  if (!token) return null;
  const sysKey = await getSysKey(env);
  const plain = authcode(token, 'DECODE', sysKey);
  if (!plain) return null;
  const parts = plain.split('\t');
  if (parts.length < 4) return null;
  const [type, idStr, sid, expireStr] = parts;
  const id = parseInt(idStr, 10);
  const expire = parseInt(expireStr, 10);
  if (!id || !expire || expire < Math.floor(Date.now() / 1000)) return null;

  if (type === 'user') {
    const user = await db(env, 'user').where('id', id).find();
    if (!user || user.status != 1) return null;
    const expectedSid = md5(`${user.id}${user.password}`);
    if (sid !== expectedSid) return null;
    const perms = await db(env, 'permission').where('uid', id).column('domain');
    return {
      type: 'user', id: user.id, username: user.username, level: user.level,
      is_api: user.is_api, apikey: user.apikey, status: user.status,
      totp_open: user.totp_open, totp_secret: user.totp_secret,
      permissions: perms as string[], regtime: user.regtime, lasttime: user.lasttime,
    };
  }

  if (type === 'domain') {
    const domain = await db(env, 'domain').where('id', id).find();
    if (!domain) return null;
    const expectedSid = md5(`${domain.id}${domain.name}`);
    if (sid !== expectedSid) return null;
    return {
      type: 'domain', id: domain.id, username: domain.name, level: -1,
      is_api: 0, apikey: null, status: 1, totp_open: 0, totp_secret: null,
      permissions: [domain.name], regtime: null, lasttime: null,
    };
  }

  return null;
}

/** 校验 API 签名（对应 AuthApi 中间件） */
export async function resolveApiUser(request: Request, url: URL, env: Env): Promise<AuthUser | null> {
  const uid = parseInt(url.searchParams.get('uid') || (await readBody(request)).uid || '', 10);
  const timestamp = parseInt(url.searchParams.get('timestamp') || (await readBody(request)).timestamp || '', 10);
  const sign = url.searchParams.get('sign') || (await readBody(request)).sign || '';
  if (!uid || !timestamp || !sign) return null;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return null;
  const user = await db(env, 'user').where('id', uid).find();
  if (!user || !user.apikey || user.status != 1) return null;
  const expected = md5(`${uid}${timestamp}${user.apikey}`);
  if (expected !== sign) return null;
  const perms = await db(env, 'permission').where('uid', uid).column('domain');
  return {
    type: 'user', id: user.id, username: user.username, level: user.level,
    is_api: user.is_api, apikey: user.apikey, status: user.status,
    totp_open: user.totp_open, totp_secret: user.totp_secret,
    permissions: perms as string[], regtime: user.regtime, lasttime: user.lasttime,
  };
}

/** 校验 MCP Bearer（对应 AuthMcp 中间件） */
export async function resolveMcpUser(request: Request, env: Env): Promise<AuthUser | null> {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const credential = auth.substring(7).trim();
  const [uidStr, apikey] = credential.split(':');
  const uid = parseInt(uidStr, 10);
  if (!uid || !apikey) return null;
  const user = await db(env, 'user').where('id', uid).find();
  if (!user || !user.apikey || user.status != 1) return null;
  if (user.apikey !== apikey) return null;
  const perms = await db(env, 'permission').where('uid', uid).column('domain');
  return {
    type: 'user', id: user.id, username: user.username, level: user.level,
    is_api: user.is_api, apikey: user.apikey, status: user.status,
    totp_open: user.totp_open, totp_secret: user.totp_secret,
    permissions: perms as string[], regtime: user.regtime, lasttime: user.lasttime,
  };
}

/** 读取请求体（缓存到 request 上避免重复读） */
export async function readBody(request: Request): Promise<Record<string, any>> {
  const cache = (request as any).__bodyCache;
  if (cache) return cache;
  let body: Record<string, any> = {};
  try {
    const ct = request.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      body = await request.json();
    } else if (ct.includes('application/x-www-form-urlencoded') || request.method === 'POST') {
      const form = await request.formData() as any;
      const entries = typeof form.entries === 'function' ? form.entries() : [];
      for (const [k, v] of entries) body[k] = typeof v === 'string' ? v : (v as File).name;
    }
  } catch {
    // 忽略解析失败
  }
  (request as any).__bodyCache = body;
  return body;
}

/** 权限检查（对应 checkPermission） */
export function checkPermission(user: AuthUser | null, type: number, domain?: string): boolean {
  if (!user) return false;
  if (user.level === 2) return true;
  if (type === 1 && user.level === 1 || type === 0 && user.level >= 0) {
    if (!domain) return true;
    return user.permissions.includes(domain);
  }
  return false;
}
