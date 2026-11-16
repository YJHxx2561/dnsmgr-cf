/// <reference types="@cloudflare/workers-types" />

/** Worker 环境绑定 */
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ASSETS?: Fetcher;
  APP_DEBUG: string;
  DEFAULT_TIMEZONE: string;
  SYS_KEY: string;
}

/** 当前登录用户（无状态 cookie 解析后） */
export interface AuthUser {
  type: 'user' | 'domain';
  id: number;
  username: string;
  level: number;
  is_api: number;
  apikey: string | null;
  status: number;
  totp_open: number;
  totp_secret: string | null;
  permissions: string[];
  regtime: string | null;
  lasttime: string | null;
}

/** API 请求上下文 */
export interface RequestContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
  params: Record<string, string>;
  user: AuthUser | null;
  /** 请求体（已解析） */
  body: Record<string, any>;
}

/** 统一 JSON 响应结构（兼容原 ThinkPHP 前端的 code/msg/data 约定） */
export interface ApiResult {
  code: number;
  msg?: string;
  data?: any;
  [key: string]: any;
}

/** 路由处理函数 */
export type RouteHandler = (ctx: RequestContext) => Response | Promise<Response>;

/** 路由定义 */
export interface Route {
  method: string | string[];
  pattern: string;
  handler: RouteHandler;
  /** 是否需要登录 */
  auth?: boolean;
  /** 鉴权类型 */
  authType?: 'user' | 'api' | 'mcp' | 'none';
}

/** 分页参数 */
export interface PageParams {
  offset: number;
  limit: number;
  sort?: string;
  order?: string;
}
