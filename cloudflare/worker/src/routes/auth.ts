/**
 * 认证相关路由：安装、登录、验证码、TOTP、登出、快捷登录
 */
import type { Env, RequestContext } from '../types';
import type { Router } from '../core/router';
import { db, tableExists } from '../db/database';
import { configGet, configSet, getSysKey, isInstalled, clearConfigCache } from '../core/config';
import { authcode, md5, now, passwordHash, passwordVerify, random, timestamp } from '../utils/crypto';
import { issueUserToken, cookieHeader } from '../auth/middleware';
import { fail, json, redirect, text } from '../core/response';
import { INIT_SQL } from '../db/init-sql';

/** 简单验证码（数字加法），存 KV，替代 PHP think-captcha session */
async function generateCaptcha(env: Env): Promise<{ key: string; image: string; answer: string }> {
  const a = Math.floor(Math.random() * 10);
  const b = Math.floor(Math.random() * 10);
  const answer = String(a + b);
  const key = 'captcha:' + crypto.randomUUID();
  await env.KV.put(key, answer, { expirationTtl: 300 });
  // 返回一个简单的 SVG 验证码
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="34"><rect width="100" height="34" fill="#f7f7f7"/><text x="10" y="24" font-size="18" font-family="sans-serif" fill="#333">${a} + ${b} = ?</text></svg>`;
  return { key, image: svg, answer };
}

/** 安装页 / 安装执行 */
export async function install(ctx: RequestContext): Promise<Response> {
  const { env, request, body } = ctx;
  if (request.method === 'GET') {
    const installed = await isInstalled(env);
    if (installed) return text('当前已经安装成功，如需重新安装请清空 D1 数据库。');
    return json({ code: 1, msg: '等待安装', data: { installed: false } });
  }

  // POST：初始化 D1 表结构 + 创建管理员
  const adminUsername = String(body.admin_username || '').trim();
  const adminPassword = String(body.admin_password || '').trim();
  if (!adminUsername || !adminPassword) return fail('必填项不能为空', -1);

  // 检查是否已安装
  if (await isInstalled(env)) return fail('系统已安装', -1);

  // 按分号拆分执行建表语句（幂等：IF NOT EXISTS / OR IGNORE，不破坏已有数据）
  for (const stmt of INIT_SQL.split(';')) {
    // 去掉开头的整行注释
    const s = stmt.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').trim();
    if (!s) continue;
    await env.DB.prepare(s).run();
  }

  await configSet(env, 'sys_key', crypto.randomUUID().replace(/-/g, ''));
  await configSet(env, 'version', '1049');
  const hash = await passwordHash(adminPassword);
  await db(env, 'user').insert({
    username: adminUsername, password: hash, level: 2,
    regtime: now(), lasttime: now(), status: 1,
  });
  await clearConfigCache(env);
  return json({ code: 1, msg: '安装完成！' });
}

/** 验证码图片 */
export async function verifycode(ctx: RequestContext): Promise<Response> {
  const { key, image } = await generateCaptcha(ctx.env);
  return new Response(image, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-store',
      'Set-Cookie': cookieHeader('captcha_key', key),
    },
  });
}

/** 登录 */
export async function login(ctx: RequestContext): Promise<Response> {
  const { env, request, body } = ctx;
  if (request.method === 'GET') {
    return json({ code: 1, msg: 'login page', data: { vcode: await configGet(env, 'vcode', '1') } });
  }

  const username = String(body.username || '').trim();
  const password = String(body.password || '').trim();
  const code = String(body.code || '').trim();
  if (!username || !password) return json({ code: -1, msg: '用户名或密码不能为空' });

  // 验证码校验
  if (await configGet(env, 'vcode', '1') === '1') {
    const cookies = (await import('../auth/middleware')).parseCookies(request.headers.get('Cookie'));
    const captchaKey = cookies['captcha_key'];
    const answer = captchaKey ? await env.KV.get(captchaKey) : null;
    if (!answer || code !== answer) return json({ code: -1, msg: '验证码错误', vcode: 1 });
    if (captchaKey) await env.KV.delete(captchaKey);
  }

  // 登录失败锁定（KV 替代 runtime/@login.lock）
  const lockKey = 'login_lock:' + (request.headers.get('CF-Connecting-IP') || 'unknown');
  const lock: { count: number; time: number } = JSON.parse((await env.KV.get(lockKey)) || '{"count":0,"time":0}');
  if (lock.count >= 5 && lock.time > timestamp() - 7200) {
    return json({ code: -1, msg: '多次登录失败，暂时禁止登录', vcode: 1 });
  }

  const user = await db(env, 'user').where('username', username).find();
  if (user && await passwordVerify(password, user.password)) {
    if (user.status == 0) return json({ code: -1, msg: '此用户已被封禁', vcode: 1 });
    await env.KV.delete(lockKey);

    // TOTP 二次验证：用短期 KV token 替代 PHP session
    if (user.totp_open == 1 && user.totp_secret) {
      const preToken = crypto.randomUUID();
      await env.KV.put('pre_login:' + preToken, String(user.id), { expirationTtl: 300 });
      return json({ code: -1, msg: '需要验证动态口令', vcode: 2, pre_token: preToken });
    }

    const { token, expire } = await issueUserToken(env, 'user', user.id, user.password);
    await db(env, 'user').where('id', user.id).update({ lasttime: now() });
    await db(env, 'log').insert({ uid: user.id, action: '登录后台', domain: '', data: 'IP:' + (request.headers.get('CF-Connecting-IP') || ''), addtime: now() });
    return new Response(JSON.stringify({ code: 0 }), {
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookieHeader('user_token', token, expire) },
    });
  }

  // 登录失败
  lock.count++;
  lock.time = timestamp();
  await env.KV.put(lockKey, JSON.stringify(lock), { expirationTtl: 7200 });
  const retry = 5 - lock.count;
  return json({ code: -1, msg: retry > 0 ? `用户名或密码错误，你还可以尝试${retry}次` : '多次登录失败，暂时禁止登录', vcode: 1 });
}

/** TOTP 验证 */
export async function totp(ctx: RequestContext): Promise<Response> {
  const { env, body } = ctx;
  const preToken = String(body.pre_token || '');
  const code = String(body.code || '');
  const uid = preToken ? await env.KV.get('pre_login:' + preToken) : null;
  if (!uid) return json({ code: -1, msg: '请重新登录' });
  if (!code) return json({ code: -1, msg: '请输入动态口令' });

  const user = await db(env, 'user').where('id', parseInt(uid, 10)).find();
  if (!user) return json({ code: -1, msg: '用户不存在' });

  // TOTP 校验（RFC 6238）
  const { verifyTOTP } = await import('../utils/totp');
  if (!await verifyTOTP(user.totp_secret, code)) {
    const failKey = 'totp_fail:' + preToken;
    const n = parseInt((await env.KV.get(failKey)) || '0', 10) + 1;
    await env.KV.put(failKey, String(n), { expirationTtl: 300 });
    if (n >= 5) {
      await env.KV.delete('pre_login:' + preToken);
      return json({ code: -1, msg: '动态口令错误次数过多，请重新登录' });
    }
    return json({ code: -1, msg: '动态口令错误' });
  }

  await env.KV.delete('pre_login:' + preToken);
  const { token, expire } = await issueUserToken(env, 'user', user.id, user.password);
  return new Response(JSON.stringify({ code: 0 }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookieHeader('user_token', token, expire) },
  });
}

/** 登出 */
export async function logout(ctx: RequestContext): Promise<Response> {
  return new Response(null, {
    status: 302,
    headers: { Location: '/login', 'Set-Cookie': cookieHeader('user_token', '') },
  });
}

/** 修改密码 */
export async function setpwd(ctx: RequestContext): Promise<Response> {
  const { env, body, user } = ctx;
  if (!user || user.type !== 'user') return fail('无权操作', -1);
  const oldPwd = String(body.oldpass || body.oldpassword || '');
  const newPwd = String(body.newpass || body.newpassword || '');
  if (!newPwd) return fail('新密码不能为空', -1);
  const row = await db(env, 'user').where('id', user.id).find();
  if (!oldPwd || !await passwordVerify(oldPwd, row.password)) return fail('原密码错误', -1);
  await db(env, 'user').where('id', user.id).update({ password: await passwordHash(newPwd) });
  return json({ code: 0, msg: '密码修改成功' });
}

/** 注册路由 */
export function registerAuthRoutes(router: Router): void {
  router.any('/install', install, { authType: 'none' });
  router.get('/verifycode', verifycode, { authType: 'none' });
  router.any('/login', login, { authType: 'none' });
  router.post('/auth/totp', totp, { authType: 'none' });
  router.get('/logout', logout, { authType: 'none' });
  router.any('/setpwd', setpwd, { auth: true });
}
