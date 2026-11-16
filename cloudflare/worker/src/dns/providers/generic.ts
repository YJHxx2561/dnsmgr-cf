/**
 * 通用 REST 平台适配器
 * 覆盖简单 REST/JSON 平台：dnsla、west、powerdns、technitium、dnsmgr、
 * goedge、dynv6、henet、namesilo、spaceship、bt、qingcloud 等。
 * 通过平台类型映射到具体的 API 路径与字段，减少重复代码。
 */
import { BaseDnsProvider } from '../base';
import type { RecordListResult, DomainListResult, DnsRecord } from '../base';
import type { Env } from '../../types';

interface RestMapping {
  baseUrl: string;
  listRecords: string;
  addRecord: string;
  updateRecord: string;
  deleteRecord: string;
  setStatus?: string;
  auth: (cfg: Record<string, any>, headers: Record<string, string>) => void;
}

/** 简单 REST 平台的路径映射（可按实际 API 扩展） */
const MAPPINGS: Record<string, RestMapping> = {
  dnsla: {
    baseUrl: 'https://api.dns.la',
    listRecords: '/domain/record',
    addRecord: '/domain/record',
    updateRecord: '/domain/record',
    deleteRecord: '/domain/record',
    auth: (c, h) => { h['Authorization'] = `Bearer ${c.apikey || c.api_token || ''}`; },
  },
  west: {
    baseUrl: 'https://api.west.cn/api/v2',
    listRecords: '/dns/record/list',
    addRecord: '/dns/record/add',
    updateRecord: '/dns/record/edit',
    deleteRecord: '/dns/record/del',
    auth: (c, h) => { h['Authorization'] = `Bearer ${c.apikey || ''}`; },
  },
  powerdns: {
    baseUrl: '',
    listRecords: '/api/v1/servers/localhost/zones',
    addRecord: '/api/v1/servers/localhost/zones',
    updateRecord: '/api/v1/servers/localhost/zones',
    deleteRecord: '/api/v1/servers/localhost/zones',
    auth: (c, h) => { h['X-API-Key'] = c.apikey || ''; },
  },
  dnsmgr: {
    baseUrl: '',
    listRecords: '/api/domain',
    addRecord: '/api/record/add',
    updateRecord: '/api/record/update',
    deleteRecord: '/api/record/delete',
    auth: (c, h) => { h['Authorization'] = `Bearer ${c.uid || ''}:${c.apikey || ''}`; },
  },
  goedge: {
    baseUrl: '',
    listRecords: '/api/dnsRecord/list',
    addRecord: '/api/dnsRecord/create',
    updateRecord: '/api/dnsRecord/update',
    deleteRecord: '/api/dnsRecord/delete',
    auth: (c, h) => { h['Authorization'] = `Bearer ${c.token || c.apikey || ''}`; },
  },
  dynv6: {
    baseUrl: 'https://dynv6.com/api/v2',
    listRecords: '/zones',
    addRecord: '/zones',
    updateRecord: '/zones',
    deleteRecord: '/zones',
    auth: (c, h) => { h['Authorization'] = `Bearer ${c.token || c.apikey || ''}`; },
  },
  technitium: {
    baseUrl: '',
    listRecords: '/api/records/list',
    addRecord: '/api/records/add',
    updateRecord: '/api/records/set',
    deleteRecord: '/api/records/delete',
    auth: (c, h) => { /* token 作为 query 参数 */ },
  },
  namesilo: {
    baseUrl: 'https://www.namesilo.com/api',
    listRecords: '/dnsListRecords',
    addRecord: '/dnsAddRecord',
    updateRecord: '/dnsUpdateRecord',
    deleteRecord: '/dnsDeleteRecord',
    auth: () => {},
  },
  henet: {
    baseUrl: 'https://api.he.net/v1',
    listRecords: '/zones',
    addRecord: '/zones',
    updateRecord: '/zones',
    deleteRecord: '/zones',
    auth: (c, h) => { h['Authorization'] = `Basic ${btoa(`${c.username || ''}:${c.password || c.apikey || ''}`)}`; },
  },
  spaceship: {
    baseUrl: 'https://api.spaceship.com',
    listRecords: '/dns-records',
    addRecord: '/dns-records',
    updateRecord: '/dns-records',
    deleteRecord: '/dns-records',
    auth: (c, h) => { h['Authorization'] = `Bearer ${c.apikey || ''}`; },
  },
  bt: {
    baseUrl: '',
    listRecords: '/api/dns/records',
    addRecord: '/api/dns/record',
    updateRecord: '/api/dns/record',
    deleteRecord: '/api/dns/record',
    auth: (c, h) => { h['X-Api-Key'] = c['Access Key'] || c.apikey || ''; },
  },
};

export class GenericProvider extends BaseDnsProvider {
  private type: string;
  private mapping: RestMapping | null;

  constructor(env: Env, type: string, config: Record<string, any>, domain = '', thirdid = '') {
    super(env, config, domain, thirdid);
    this.type = type;
    this.mapping = MAPPINGS[type] || null;
    if (!this.mapping) {
      // 未提供映射的平台：用 baseUrl 配置或 API 自建服务地址
      const baseUrl = config.baseUrl || config.api_url || '';
      this.mapping = {
        baseUrl,
        listRecords: config.list_path || '/records',
        addRecord: config.add_path || '/records',
        updateRecord: config.update_path || '/records',
        deleteRecord: config.delete_path || '/records',
        auth: (c, h) => { if (c.token || c.apikey) h['Authorization'] = `Bearer ${c.token || c.apikey}`; },
      };
    }
  }

  private url(path: string): string {
    const base = (this.mapping?.baseUrl || '').replace(/\/$/, '');
    if (/^https?:\/\//i.test(path)) return path;
    return base + path;
  }

  private headers(method: string): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (method !== 'GET') h['Content-Type'] = 'application/json';
    this.mapping?.auth(this.config, h);
    return h;
  }

  private async api(method: string, path: string, params?: Record<string, any>): Promise<any | null> {
    let url = this.url(path);
    let body: string | undefined;
    if (method === 'GET' && params) {
      url += '?' + new URLSearchParams(params as any).toString();
    } else if (params) {
      body = JSON.stringify(params);
    }
    const text = await this.http(url, { method, headers: this.headers(method), body });
    if (!text) return null;
    try { return JSON.parse(text); }
    catch { this.setError('返回数据解析失败：' + text.substring(0, 150)); return null; }
  }

  async check(): Promise<boolean> {
    return (await this.getDomainRecords(1, 1)) !== null;
  }

  /** 从各种可能的响应结构中提取记录列表与总数（兼容不同平台） */
  private extract(data: any): { list: any[]; total: number } | null {
    if (!data) return null;
    const list = Array.isArray(data) ? data
      : data.records || data.Records || data.data?.records || data.data?.list || data.result || data.list || [];
    const total = data.total ?? data.Total ?? data.total_count ?? data.data?.total ?? (Array.isArray(list) ? list.length : 0);
    return { list: Array.isArray(list) ? list : [], total };
  }

  private normalize(row: any): DnsRecord {
    return {
      RecordId: String(row.id ?? row.RecordId ?? row.record_id ?? ''),
      Domain: this.domain,
      Name: row.name ?? row.Name ?? row.rr ?? '@',
      Type: row.type ?? row.Type ?? 'A',
      Value: row.value ?? row.Value ?? row.content ?? '',
      Line: String(row.line ?? row.Line ?? row.line_id ?? 'default'),
      TTL: Number(row.ttl ?? row.TTL ?? 600),
      MX: row.priority ?? row.mx ?? null,
      Status: String(row.status ?? row.Status ?? row.enabled ?? 1),
      Weight: row.weight ?? null,
      Remark: row.remark ?? row.comment ?? null,
      UpdateTime: row.updated_at ?? row.updatedOn ?? null,
    };
  }

  async getDomainRecords(
    page = 1, limit = 20, keyword?: string, subdomain?: string,
    value?: string, type?: string, line?: string, _status?: string,
    _sortField?: string, _sortOrder?: string
  ): Promise<RecordListResult | null> {
    const params: Record<string, any> = {
      domain: this.domain, page, per_page: limit, limit, offset: (page - 1) * limit,
    };
    if (keyword) params.keyword = keyword;
    if (subdomain) params.name = subdomain;
    if (type) params.type = type;
    if (line) params.line = line;
    if (value) params.value = value;
    const data = await this.api('GET', this.mapping!.listRecords, params);
    const ex = this.extract(data);
    if (!ex) return null;
    return { total: ex.total, list: ex.list.map((r) => this.normalize(r)) };
  }

  async addDomainRecord(name: string, type: string, value: string, line: string, ttl: number, mx: number, weight: number, remark?: string): Promise<string | null> {
    const data = await this.api('POST', this.mapping!.addRecord, {
      domain: this.domain, name, type, value, line, ttl: Number(ttl), priority: Number(mx), weight, remark,
    });
    if (!data) return null;
    return String(data.id ?? data.record_id ?? data.RecordId ?? data.data?.id ?? '');
  }

  async updateDomainRecord(recordId: string, name: string, type: string, value: string, line: string, ttl: number, mx: number, weight: number, remark?: string): Promise<string | null> {
    const data = await this.api('PUT', this.mapping!.updateRecord.replace(/\{id\}/g, recordId), {
      id: recordId, record_id: recordId, domain: this.domain, name, type, value, line,
      ttl: Number(ttl), priority: Number(mx), weight, remark,
    });
    return data ? recordId : null;
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    const data = await this.api('DELETE', this.mapping!.deleteRecord.replace(/\{id\}/g, recordId), { id: recordId, record_id: recordId });
    return !!data;
  }

  async setDomainRecordStatus(recordId: string, status: string): Promise<boolean> {
    if (!this.mapping!.setStatus) return false;
    const data = await this.api('POST', this.mapping!.setStatus, { id: recordId, status });
    return !!data;
  }
}
