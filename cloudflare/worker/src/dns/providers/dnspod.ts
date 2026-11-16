/** 腾讯云 DNSPod 客户端（复刻 app/lib/dns/dnspod.php，TC3-HMAC-SHA256 签名） */
import { BaseDnsProvider } from '../base';
import type { RecordListResult, DomainListResult, DnsRecord } from '../base';
import type { Env } from '../../types';
import { tc3Signature } from '../../utils/sign';

const ENDPOINT = 'dnspod.tencentcloudapi.com';
const SERVICE = 'dnspod';
const VERSION = '2021-03-23';

export class DnspodProvider extends BaseDnsProvider {
  private secretId: string;
  private secretKey: string;
  private endpoint: string;
  private service: string;
  private version: string;

  constructor(env: Env, config: Record<string, any>, domain = '', thirdid = '', isEO = false) {
    super(env, config, domain, thirdid);
    this.secretId = config.SecretId || '';
    this.secretKey = config.SecretKey || '';
    this.endpoint = isEO ? 'teo.tencentcloudapi.com' : ENDPOINT;
    this.service = isEO ? 'teo' : SERVICE;
    this.version = isEO ? '2022-09-01' : VERSION;
  }

  private async sendRequest(action: string, params: Record<string, any>): Promise<any | null> {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) clean[k] = v;
    const payload = JSON.stringify(Object.keys(clean).length ? clean : {});
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = await tc3Signature(this.secretId, this.secretKey, this.service, this.endpoint, payload, timestamp, action);
    const text = await this.http(`https://${this.endpoint}/`, { method: 'POST', headers, body: payload });
    if (!text) return null;
    try {
      const arr = JSON.parse(text);
      const resp = arr.Response;
      if (!resp) { this.setError(arr?.Response?.Error?.Message || '返回数据解析失败'); return null; }
      if (resp.Error) { this.setError(resp.Error.Message || '接口错误'); return null; }
      return resp;
    } catch {
      this.setError('返回数据解析失败');
      return null;
    }
  }

  async check(): Promise<boolean> {
    return (await this.getDomainList()) !== null;
  }

  async getDomainList(kw?: string, page = 1, pageSize = 20): Promise<DomainListResult | null> {
    const data = await this.sendRequest('DescribeDomainList', { Offset: (page - 1) * pageSize, Limit: pageSize, Keyword: kw });
    if (!data?.DomainList) return null;
    return {
      total: data.DomainCountInfo?.DomainTotal ?? data.DomainList.length,
      list: data.DomainList.map((row: any) => ({ DomainId: row.DomainId, Domain: row.Name, id: String(row.DomainId), RecordCount: row.RecordCount })),
    };
  }

  async getDomainRecords(
    page = 1, limit = 20, keyword?: string, subdomain?: string,
    value?: string, type?: string, line?: string, status?: string,
    sortField?: string, sortOrder = 'asc'
  ): Promise<RecordListResult | null> {
    const params: Record<string, any> = {
      Domain: this.domain, Offset: (page - 1) * limit, Limit: limit,
    };
    if (subdomain) params.SubDomain = subdomain;
    if (keyword) params.Keyword = keyword;
    if (type) params.Type = type;
    if (line) params.Line = line;
    if (value) params.Value = value;
    const data = await this.sendRequest('DescribeRecords', params);
    if (!data?.RecordList) return null;
    const list = data.RecordList.map((row: any) => this.formatRecord(row));
    return { total: data.TotalCount ?? list.length, list };
  }

  private formatRecord(row: any): DnsRecord {
    return {
      RecordId: String(row.RecordId), Domain: row.Domain, Name: row.Name, Type: row.Type,
      Value: row.Value, Line: row.Line, LineName: row.LineName, TTL: row.TTL,
      MX: row.MX ?? null, Status: String(row.Status), Weight: row.Weight ?? null,
      Remark: row.Remark ?? null, UpdateTime: row.UpdatedOn ?? null,
    };
  }

  async addDomainRecord(name: string, type: string, value: string, line: string, ttl: number, mx: number, weight: number, remark?: string): Promise<string | null> {
    const params: Record<string, any> = { Domain: this.domain, SubDomain: name, RecordType: type, RecordValue: value, RecordLine: line || '默认', TTL: Number(ttl) };
    if (type === 'MX') params.MX = Number(mx);
    if (weight) params.Weight = Number(weight);
    if (remark) params.Remark = remark;
    const data = await this.sendRequest('CreateRecord', params);
    return data?.RecordId ? String(data.RecordId) : null;
  }

  async updateDomainRecord(recordId: string, name: string, type: string, value: string, line: string, ttl: number, mx: number, weight: number, remark?: string): Promise<string | null> {
    const params: Record<string, any> = { RecordId: Number(recordId), SubDomain: name, RecordType: type, RecordValue: value, RecordLine: line || '默认', TTL: Number(ttl) };
    if (type === 'MX') params.MX = Number(mx);
    if (weight) params.Weight = Number(weight);
    if (remark) params.Remark = remark;
    const data = await this.sendRequest('ModifyRecord', params);
    return data?.RecordId ? String(data.RecordId) : null;
  }

  async updateDomainRecordRemark(recordId: string, remark: string | null): Promise<boolean> {
    const data = await this.sendRequest('ModifyRecordRemark', { RecordId: Number(recordId), Remark: remark || '' });
    return !!data;
  }

  async deleteDomainRecord(recordId: string): Promise<boolean> {
    const data = await this.sendRequest('DeleteRecord', { RecordId: Number(recordId) });
    return !!data;
  }

  async setDomainRecordStatus(recordId: string, status: string): Promise<boolean> {
    const action = status === '1' ? 'ResumeRecord' : 'PauseRecord';
    const data = await this.sendRequest(action, { RecordId: Number(recordId) });
    return !!data;
  }

  async getDomainRecordLog(page = 1, limit = 20, keyword?: string, startDate?: string, endDate?: string): Promise<RecordListResult | null> {
    const data = await this.sendRequest('DescribeRecordLogs', { Domain: this.domain, Offset: (page - 1) * limit, Limit: limit });
    if (!data?.RecordLog) return null;
    return { total: data.TotalCount ?? 0, list: data.RecordLog.map((r: any) => ({ ...r, RecordId: String(r.RecordId || '') })) };
  }

  async changeRecordGroup(ids: string[], groupId: string): Promise<boolean> {
    const data = await this.sendRequest('ChangeRecordGroup', { RecordIds: ids.map(Number), GroupId: Number(groupId) });
    return !!data;
  }

  async addDomain(domain: string): Promise<{ name: string; id: string } | null> {
    const data = await this.sendRequest('CreateDomain', { Domain: domain });
    if (!data?.DomainId) return null;
    return { id: String(data.DomainId), name: data.DomainName || domain };
  }
}
