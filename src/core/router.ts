/**
 * 轻量路由框架
 * 支持 :id 动态参数、方法匹配、鉴权中间件。
 */

import type { Env, RequestContext, Route, RouteHandler } from '../types';
import { fail, preflight } from './response';
import { readBody, resolveApiUser, resolveMcpUser, resolveWebUser } from '../auth/middleware';

export class Router {
  private routes: Route[] = [];

  add(method: string | string[], pattern: string, handler: RouteHandler, options: Partial<Route> = {}): void {
    this.routes.push({ method, pattern, handler, ...options });
  }

  get(pattern: string, handler: RouteHandler, options?: Partial<Route>): void {
    this.add('GET', pattern, handler, options);
  }

  post(pattern: string, handler: RouteHandler, options?: Partial<Route>): void {
    this.add('POST', pattern, handler, options);
  }

  any(pattern: string, handler: RouteHandler, options?: Partial<Route>): void {
    this.add(['GET', 'POST', 'PUT', 'DELETE'], pattern, handler, options);
  }

  /** 匹配路径 -> 提取参数 */
  private matchRoute(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
    for (const route of this.routes) {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      if (!methods.includes(method) && !methods.includes('ANY')) continue;
      const params = this.matchPath(route.pattern, pathname);
      if (params) return { route, params };
    }
    return null;
  }

  private matchPath(pattern: string, pathname: string): Record<string, string> | null {
    const pParts = pattern.split('/').filter(Boolean);
    const uParts = pathname.split('/').filter(Boolean);
    if (pParts.length !== uParts.length) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < pParts.length; i++) {
      const p = pParts[i];
      const u = uParts[i];
      if (p.startsWith(':')) {
        params[p.substring(1)] = decodeURIComponent(u);
      } else if (p !== u) {
        return null;
      }
    }
    return params;
  }

  /** 处理请求 */
  async handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') return preflight();

    const url = new URL(request.url);
    const matched = this.matchRoute(request.method, url.pathname);
    if (!matched) return fail('404 Not Found', 404);

    const { route, params } = matched;
    const body = await readBody(request);

    const context: RequestContext = {
      request, env, ctx, url, params, body, user: null,
    };

    // 鉴权
    const authType = route.authType ?? (route.auth ? 'user' : 'none');
    if (authType !== 'none') {
      let user = null;
      if (authType === 'user') user = await resolveWebUser(request, env);
      else if (authType === 'api') user = await resolveApiUser(request, url, env);
      else if (authType === 'mcp') user = await resolveMcpUser(request, env);

      if (!user) return fail('未登录或登录已失效，请先登录', -1);
      context.user = user;
    }

    try {
      return await route.handler(context);
    } catch (e: any) {
      if (env.APP_DEBUG === 'true') {
        return fail(e?.message || '服务器错误', 500, { stack: e?.stack });
      }
      return fail('服务器错误：' + (e?.message || '未知错误'), 500);
    }
  }
}
