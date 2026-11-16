/** 阿里云 DNS 客户端（复刻 app/lib/dns/aliyun.php + client/Aliyun.php） */
import { BaseDnsProvider } from '../base';
import type { RecordListResult, DomainListResult, DnsRecord } from '../base';
import type { Env } from '../../types';
import { aliyunSignature, percentEncode } from '../../utils/sign';
import { random } from '../../utils/crypto';

const ENDPOINT = 'alidns.aliyuncs.com';
const VERSION = '2015-01-09';

export class AliyunProvider extends BaseDnsProvider {
  private accessKeyId: string;
  private accessKeySecret: string;
  private endpoint: string;
  private version: string;

  constructor(env: Env, config: Record<string, any>, domain = '', thirdid = '', isESA = false) {
    super(env, config, domain, thirdid);
    this.accessKeyId = config.AccessKeyId || '';
    this.accessKeySecret = config.AccessKeySecret || '';
    this.endpoint = isESA ? 'alidns.aliyuncs.com' : ENDPOINT;
    this.version = VERSION;
  }

  private async request(params: Record<string, any>, method = 'POST'): Promise<any | null> {
    const data: Record<string, any> = {
      Format: 'JSON',
      Version: this.version,
      AccessKeyId: this.accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      SignatureVersion: '1.0',
      SignatureNonce: random(8),
      ...params,
    };
    data.Signature = await aliyunSignature(data, this.accessKeySecret, method);
    const base = `https://${this.endpoint}/`;
    let url = base;
    let body: string | undefined;
    if (method === 'GET') {
      url += '?' + Object.keys(data).map((k) => `${percentEncode(k)}=${percentEncode(data[k])}`).join('&');
    } else {
      body = Object.keys(data).map((k) => `${percentEncode(k)}=${percentEncode(data[k])}`).join('&');
    }
    const text = await this.http(url, {
      method,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!text) return null;
    try {
      const arr = JSON.parse(text);
      if (arr?.Message && !arr?.Code?.startsWith?.('Success')) {
        this.setError(arr.Message);
        // 部分接口成功时不含 Code，靠是否有数据判断
        if (!arr.Domains && !arr.DomainRecords && !arr.RecordId) return null;
      }
      return arr;
    } catch {
      this.setError('返回数据解析失败');
      return null;
    }
  }

  async check(): Promise<boolean> {
    return (await this.getDomainList()) !== null;
  }

  async getDomainList(kw?: string, page = 1, pageSize = 20): Promise<DomainListResult | null> {
    const data = await this.request({ Action: 'DescribeDomains', KeyWord: kw, PageNumber: page, PageSize: pageSize });
    if (!data?.Domains) return null;
    const domains = data.Domains.Domain || [];
    return {
      total: data.TotalCount ?? domains.length,
      list: domains.map((row: any) => ({ DomainId: row.DomainId, Domain: row.DomainName, id: row.DomainId, RecordCount: row.RecordCount })),
    };
  }

  async getDomainRecords(
    page = 1, limit = 20, keyword?: string, subdomain?: string,
    value?: string, type?: string, line?: string, status?: string,
    sortField?: string, sortOrder = 'asc'
  ): Promise<RecordListResult | null> {
    const params: Record<string, any> = { Action: 'DescribeDomainRecords', DomainName: this.domain, PageNumber: page, PageSize: limit };
    if (subdomain || type || line || value) {
      params.SearchMode = 'ADVANCED';
      params.RRKeyWord = subdomain;
      params.ValueKeyWord = value;
      params.Type = type;
      params.Line = line;
    } else if (keyword) {
      params.KeyWord = keyword;
    }
    const sortMap: Record<string, string> = { Name: 'RR', Type: 'Type', LineName: 'Line', Value: 'Value', UpdateTime: 'UpdateDate' };
    if (sortField && sortMap[sortField]) {
      params.OrderBy = sortMap[sortField];
      params.Direction = String(sortOrder).toLowerCase() === 'desc' ? 'desc' : 'asc';
    }
    const data = await this.request(params);
    if (!data?.DomainRecords) return null;
    const list = (data.DomainRecords.Record || []).map((row: any) => this.formatRecord(row));
    return { total: data.TotalCount ?? list.length, list };
  }

  private formatRecord(row: any): DnsRecord {
    return {
      RecordId: row.RecordId, Domain: row.DomainName, Name: row.RR, Type: row.Type,
      Value: row.Value, Line: row.Line, TTL: row.TTL, MX: row.Priority ?? null,
      Status: row.Status === 'ENABLE' ? '1' : '0', Weight: row.Weight ?? null,
      Remark: row.Remark ?? null,
      UpdateTime: row.UpdateTimestamp ? new Date(Number(row.UpdateTimestamp)).toISOString().replace('T', ' ').slice(0, 19) : null,
    };
  }

  async addDomainRecord(name: string, type: string, value: string, line: string, ttl: number, mx: number, weight: number, remark?: string): Promise<string | null> {
    const params: Record<string, any> = {
      Action: 'AddDomainRecord', DomainName: this.domain, RR: name, Type: type,
      Value: value, Line: this.convertLine(line), TTL: Number(ttl),
    };
    if (type === 'MX') params.Priority = Number(mx);
    if (weight) params.Weight = Number(weight);
    if (remark) params.Remark = remark;
    const data = await this.request(params);
    return data?.RecordId ?? null;
  }

  async updateDomainRecord(recordId: string, name: string, type: string, value: string, line: string, ttl: number, mx: number, weight: number, remark?: string): Promise<string | null> {
    const params: Record<string, any> = {
      Action: 'UpdateDomainRecord', RecordId: recordId, RR: name, Type: type,
      Value: value, Line: this.convertLine(line), TTL: Number(ttl),
    };
    if (type === 'MX') params.Priority = Number(mx);
    if (weight) params.Weight = Number(weight);
    if (remark) params.Remark = remark;
    const data = await this.request(params);
    return data?.RecordId ?? null;
  }

  async updateDomainRecordRemark(recordId: string, remark: string | null): Promise<boolean> {
    const data = await this.request({ Action: 'UpdateDomainRecordRemark', RecordId: recordId, Remark: remark || '' });
    return !!data;
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    const data = await this.request({ Action: 'DeleteDomainRecord', RecordId: recordId });
    return !!data?.RecordId;
  }

  async setDomainRecordStatus(recordId: string, status: string): Promise<boolean> {
    const data = await this.request({ Action: 'SetDomainRecordStatus', RecordId: recordId, Status: status });
    return !!data?.Status;
  }

  async getDomainRecordLog(page = 1, limit = 20, keyword?: string, startDate?: string, endDate?: string): Promise<RecordListResult | null> {
    const data = await this.request({ Action: 'DescribeRecordLogs', DomainName: this.domain, PageNumber: page, PageSize: limit, KeyWord: keyword, StartDate: startDate, EndDate: endDate, Lang: 'zh' });
    if (!data?.RecordLogs) return null;
    return { total: data.TotalCount ?? 0, list: (data.RecordLogs.RecordLog || []).map((r: any) => ({ ...r, RecordId: r.RecordId || '' })) };
  }

  async changeRecordGroup(ids: string[], groupId: string): Promise<boolean> {
    const data = await this.request({ Action: 'ChangeRecordGroup', DomainName: this.domain, RecordIdList: JSON.stringify(ids), GroupId: groupId });
    return !!data;
  }

  async addDomain(domain: string): Promise<{ name: string; id: string } | null> {
    const data = await this.request({ Action: 'AddDomain', DomainName: domain });
    if (!data?.DomainId) return null;
    return { id: String(data.DomainId), name: data.DomainName || domain };
  }

  private convertLine(line: string): string {
    const map: Record<string, string> = { DEF: 'default', default: 'default', CT: 'telecom', CU: 'unicom', CM: 'mobile', AB: 'oversea' };
    return map[line] || line || 'default';
  }
}
