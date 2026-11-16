/**
 * DNS 平台抽象基类
 * 所有平台客户端实现此接口，控制器通过统一方法调用。
 * 与原 PHP 的 DnsInterface 保持方法签名一致，便于逐平台移植。
 */

import type { Env } from '../types';
import { db } from '../db/database';

/** 统一的解析记录结构（与各平台 getDomainRecords 返回约定一致） */
export interface DnsRecord {
  RecordId: string;
  Domain?: string;
  Name: string;
  Type: string;
  Value: any;
  Line: string;
  LineName?: string;
  TTL: number;
  MX?: number | null;
  Status: string;
  Weight?: number | null;
  Remark?: string | null;
  UpdateTime?: string | null;
  [key: string]: any;
}

export interface RecordListResult {
  total: number;
  list: DnsRecord[];
}

export interface DomainListResult {
  total: number;
  list: Array<{ Domain: string; id?: string; [key: string]: any }>;
}

/** 平台能力声明 */
export interface ProviderCapability {
  name: string;
  icon: string;
  remark: number;
  status: boolean;
  redirect: boolean;
  log: boolean;
  weight: boolean;
  page: boolean;
  add: boolean;
  sort: boolean;
}

export abstract class BaseDnsProvider {
  protected error = '';
  protected config: Record<string, any>;
  protected domain: string;
  protected thirdid: string;
  protected env: Env;

  constructor(env: Env, config: Record<string, any>, domain = '', thirdid = '') {
    this.env = env;
    this.config = config;
    this.domain = domain;
    this.thirdid = thirdid;
  }

  getError(): string {
    return this.error;
  }

  protected setError(msg: string): void {
    this.error = msg;
  }

  /** 加载账户配置（供工厂调用） */
  static async loadConfig(env: Env, accountId: number): Promise<{ type: string; config: Record<string, any> } | null> {
    const account = await db(env, 'account').where('id', accountId).find();
    if (!account) return null;
    let config: Record<string, any> = {};
    try {
      config = typeof account.config === 'string' ? JSON.parse(account.config) : account.config || {};
    } catch {
      config = {};
    }
    return { type: account.type, config };
  }

  // ---- 子类必须实现 ----
  abstract getDomainRecords(
    page: number, limit: number, keyword?: string, subdomain?: string,
    value?: string, type?: string, line?: string, status?: string,
    sortField?: string, sortOrder?: string
  ): Promise<RecordListResult | null>;

  abstract addDomainRecord(
    name: string, type: string, value: string, line: string,
    ttl: number, mx: number, weight: number, remark?: string
  ): Promise<string | null>;

  abstract updateDomainRecord(
    recordId: string, name: string, type: string, value: string,
    line: string, ttl: number, mx: number, weight: number, remark?: string
  ): Promise<string | null>;

  abstract deleteDomainRecord(recordId: string): Promise<boolean>;

  abstract setDomainRecordStatus(recordId: string, status: string): Promise<boolean>;

  // ---- 可选实现（默认返回空/不支持） ----
  async check(): Promise<boolean> {
    return true;
  }

  async getDomainList(_kw?: string, _page?: number, _pagesize?: number): Promise<DomainListResult | null> {
    return null;
  }

  async addDomain(_name: string): Promise<{ name: string; id: string } | null> {
    this.setError('当前平台不支持通过API添加域名');
    return null;
  }

  async updateDomainRecordRemark(_recordId: string, _remark: string | null): Promise<boolean> {
    this.setError('当前平台不支持修改备注');
    return false;
  }

  async getDomainRecordLog(_page: number, _limit: number): Promise<RecordListResult | null> {
    return null;
  }

  async changeRecordGroup(_ids: string[], _groupId: string): Promise<boolean> {
    this.setError('当前平台不支持分组');
    return false;
  }

  /** 通用 HTTP 请求封装（替代 PHP 的 http_request/get_curl） */
  protected async http(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string | FormData;
      timeout?: number;
    } = {}
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout ?? 15000);
    try {
      const resp = await fetch(url, {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });
      return await resp.text();
    } catch (e: any) {
      this.setError('请求失败：' + (e?.message || '网络错误'));
      return '';
    } finally {
      clearTimeout(timer);
    }
  }

  protected async httpJson(url: string, options: any = {}): Promise<any | null> {
    const text = await this.http(url, options);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      this.setError('返回数据解析失败：' + text.substring(0, 200));
      return null;
    }
  }
}
