import type { ApiResult } from '../types';

const CORS_HEADERS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
};

/** 返回 JSON（兼容 ThinkPHP json() 的 {code,msg,data}） */
export function json(data: ApiResult | any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
    },
  });
}

/** 成功响应：原系统多数接口用 code=1 或 code=0，见各处说明 */
export function success(msg = '操作成功', data?: any): Response {
  return json({ code: 1, msg, data });
}

/** 失败响应 */
export function fail(msg = '操作失败', code = 0, extra?: Record<string, any>): Response {
  return json({ code, msg, ...extra });
}

/** 纯文本响应 */
export function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  });
}

/** HTML 响应 */
export function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS },
  });
}

/** 重定向 */
export function redirect(url: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: url, ...CORS_HEADERS },
  });
}

/** OPTIONS 预检 */
export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
