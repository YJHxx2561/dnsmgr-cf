/** Cloudflare DNS 平台客户端（完整复刻 app/lib/dns/cloudflare.php） */
import { BaseDnsProvider } from '../base';
import type { RecordListResult, DomainListResult } from '../base';
import type { Env } from '../../types';

const BASE_URL = 'https://api.cloudflare.com/client/v4';

export class CloudflareProvider extends BaseDnsProvider {
  private email: string;
  private apikey: string;
  private auth: number;
  private domainid: string;

  constructor(env: Env, config: Record<string, any>, domain = '', thirdid = '') {
    super(env, config, domain, thirdid);
    this.email = config.email || '';
    this.apikey = config.apikey || '';
    this.domainid = config.domainid || thirdid || '';
    const authRaw = config.auth;
    this.auth = authRaw !== undefined && authRaw !== ''
      ? Number(authRaw)
      : (/^[0-9a-f]+$/i.test(this.apikey) ? 0 : 1);
  }

  private extractName(fullName: string): string {
    const domainAscii = this.domain;
    if (fullName === domainAscii) return '@';
    if (fullName.endsWith('.' + domainAscii)) return fullName.substring(0, fullName.length - domainAscii.length - 1);
    return fullName;
  }

  private async sendRequest(method: string, path: string, params?: Record<string, any>): Promise<any | null> {
    let url = BASE_URL + path;
    const headers: Record<string, string> = {};
    if (this.auth === 0) {
      headers['X-Auth-Email'] = this.email;
      headers['X-Auth-Key'] = this.apikey;
    } else {
      headers['Authorization'] = 'Bearer ' + this.apikey;
    }
    let body: string | undefined;
    if (method === 'GET' || method === 'DELETE') {
      if (params && Object.keys(params).length) {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') qs.set(k, String(v));
        url += '?' + qs.toString();
      }
    } else {
      body = JSON.stringify(params || {});
      headers['Content-Type'] = 'application/json';
    }
    const text = await this.http(url, { method, headers, body });
    if (!text) return null;
    let arr: any;
    try { arr = JSON.parse(text); } catch { this.setError('返回数据解析失败'); return null; }
    if (arr?.success) return arr;
    this.setError(arr?.errors?.[0]?.message || '未知错误');
    return null;
  }

  async check(): Promise<boolean> {
    return (await this.getDomainList()) !== null;
  }

  async getDomainList(kw?: string, page = 1, pageSize = 20): Promise<DomainListResult | null> {
    const params: Record<string, any> = { page, per_page: pageSize };
    if (kw) params.name = kw;
    const data = await this.sendRequest('GET', '/zones', params);
    if (!data) return null;
    return {
      total: data.result_info?.total_count ?? data.result?.length ?? 0,
      list: data.result.map((row: any) => ({ DomainId: row.id, Domain: row.name, id: row.id, RecordCount: 0 })),
    };
  }

  async getDomainRecords(
    page = 1, limit = 20, keyword?: string, subdomain?: string,
    value?: string, type?: string, line?: string, status?: string,
    sortField?: string, sortOrder = 'asc'
  ): Promise<RecordListResult | null> {
    if (value) keyword = value;
    const params: Record<string, any> = {};
    if (type) params.type = type;
    if (keyword) params.search = keyword;
    params.page = page;
    params.per_page = limit;
    if (subdomain) params.name = subdomain === '@' ? this.domain : `${subdomain}.${this.domain}`;
    if (line !== null && line !== undefined && line !== '') params.proxied = line === '1' ? 'true' : 'false';
    const allowedSort: Record<string, string> = { Name: 'name', Type: 'type', LineName: 'proxied', Value: 'content' };
    if (sortField && allowedSort[sortField]) {
      params.order = allowedSort[sortField];
      params.direction = String(sortOrder).toLowerCase() === 'desc' ? 'desc' : 'asc';
    }
    const data = await this.sendRequest('GET', `/zones/${this.domainid}/dns_records`, params);
    if (!data) return null;
    const list = data.result.map((row: any) => this.formatRecord(row));
    return { total: data.result_info?.total_count ?? list.length, list };
  }

  private formatRecord(row: any) {
    let name = this.extractName(row.name);
    let status = name.endsWith('_pause') ? '0' : '1';
    name = name === '__root__' ? '@' : name;
    if (status === '0') name = name.substring(0, name.length - 6);
    let content = row.content;
    if (row.type === 'SRV' && row.priority !== undefined) content = `${row.priority} ${row.content}`;
    return {
      RecordId: row.id, Domain: this.domain, Name: name, Type: row.type,
      Value: content, Line: row.proxied ? '1' : '0', TTL: row.ttl,
      MX: row.priority ?? null, Status: status, Weight: null,
      Remark: row.comment, UpdateTime: row.modified_on,
    };
  }

  private async getRecordInfo(recordId: string): Promise<any | null> {
    const data = await this.sendRequest('GET', `/zones/${this.domainid}/dns_records/${recordId}`);
    if (!data) return null;
    return this.formatRecord(data.result);
  }

  private convertType(type: string): string {
    const dict: Record<string, string> = { REDIRECT_URL: 'URI', FORWARD_URL: 'URI' };
    return dict[type] ?? type;
  }

  private convertValue(value: string, type: string): any {
    const arr = String(value).split(' ');
    if (type === 'SRV') {
      if (arr.length > 3) return { priority: +arr[0], weight: +arr[1], port: +arr[2], target: arr[3] };
      return { weight: +arr[0], port: +arr[1], target: arr[2] };
    }
    if (type === 'CAA') return { flags: +arr[0], tag: arr[1], value: String(arr[2] || '').replace(/^"|"$/g, '') };
    return value;
  }

  private buildRecordParams(name: string, type: string, value: string, line: string, ttl: number, mx: number, remark?: string) {
    const params: Record<string, any> = {
      name, type: this.convertType(type), content: value,
      proxied: line === '1', ttl: Number(ttl), comment: remark,
    };
    if (type === 'MX') params.priority = Number(mx);
    if (type === 'CAA' || type === 'SRV') { delete params.content; params.data = this.convertValue(value, type); }
    return params;
  }

  async addDomainRecord(name: string, type: string, value: string, line: string, ttl: number, mx: number, weight: number, remark?: string): Promise<string | null> {
    const data = await this.sendRequest('POST', `/zones/${this.domainid}/dns_records`, this.buildRecordParams(name, type, value, line, ttl, mx, remark));
    return data?.result?.id ?? null;
  }

  async updateDomainRecord(recordId: string, name: string, type: string, value: string, line: string, ttl: number, mx: number, weight: number, remark?: string): Promise<string | null> {
    const data = await this.sendRequest('PATCH', `/zones/${this.domainid}/dns_records/${recordId}`, this.buildRecordParams(name, type, value, line, ttl, mx, remark));
    return data ? recordId : null;
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    const data = await this.sendRequest('DELETE', `/zones/${this.domainid}/dns_records/${recordId}`);
    return !!data;
  }

  async setDomainRecordStatus(recordId: string, status: string): Promise<boolean> {
    const info = await this.getRecordInfo(recordId);
    if (!info) return false;
    let name = status === '1' ? String(info.Name).replace(/_pause/g, '') : `${info.Name}_pause`;
    if (name === '__root__') name = '@';
    else if (name === '@_pause') name = '__root___pause';
    return !!(await this.updateDomainRecord(recordId, name, info.Type, info.Value, info.Line, info.TTL, info.MX, info.Weight, info.Remark));
  }

  async addDomain(domain: string): Promise<{ name: string; id: string } | null> {
    const data = await this.sendRequest('POST', '/zones', { name: domain });
    if (!data) return null;
    return { id: data.result.id, name: data.result.name };
  }
}
