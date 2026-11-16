/**
 * MCP Server（JSON-RPC 2.0 over HTTP POST，Streamable HTTP）
 * 复刻 app/lib/mcp/*，通过工具调用核心业务逻辑。
 */
import type { RequestContext } from '../types';
import { json } from '../core/response';
import { db } from '../db/database';
import { getProviderByAccount } from '../dns/factory';
import { getDnsType, now } from '../utils/crypto';

const SERVER_INFO = { name: 'dnsmgr', version: '1.0.0' };

/** 工具定义 */
const TOOLS = [
  {
    name: 'list_domains',
    description: '列出当前用户可管理的域名',
    inputSchema: { type: 'object', properties: { keyword: { type: 'string' } } },
  },
  {
    name: 'get_domain',
    description: '获取域名详情',
    inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
  },
  {
    name: 'list_records',
    description: '列出域名的解析记录（实时从DNS平台拉取）',
    inputSchema: { type: 'object', properties: { domain_id: { type: 'number' }, keyword: { type: 'string' } }, required: ['domain_id'] },
  },
  {
    name: 'add_record',
    description: '添加解析记录',
    inputSchema: {
      type: 'object',
      properties: {
        domain_id: { type: 'number' }, name: { type: 'string' }, type: { type: 'string' },
        value: { type: 'string' }, line: { type: 'string' }, ttl: { type: 'number' },
      },
      required: ['domain_id', 'name', 'type', 'value'],
    },
  },
  {
    name: 'update_record',
    description: '修改解析记录',
    inputSchema: {
      type: 'object',
      properties: {
        domain_id: { type: 'number' }, record_id: { type: 'string' }, name: { type: 'string' },
        type: { type: 'string' }, value: { type: 'string' }, line: { type: 'string' }, ttl: { type: 'number' },
      },
      required: ['domain_id', 'record_id', 'name', 'type', 'value'],
    },
  },
  {
    name: 'delete_record',
    description: '删除解析记录',
    inputSchema: { type: 'object', properties: { domain_id: { type: 'number' }, record_id: { type: 'string' } }, required: ['domain_id', 'record_id'] },
  },
  {
    name: 'set_record_status',
    description: '启用/暂停解析记录',
    inputSchema: { type: 'object', properties: { domain_id: { type: 'number' }, record_id: { type: 'string' }, status: { type: 'string' } }, required: ['domain_id', 'record_id', 'status'] },
  },
  {
    name: 'list_cert_orders',
    description: '列出SSL证书订单',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_dmonitor_tasks',
    description: '列出容灾切换任务',
    inputSchema: { type: 'object', properties: {} },
  },
];

/** MCP 主处理 */
export async function handleMcp(ctx: RequestContext): Promise<Response> {
  const { body, user } = ctx;
  const id = body.id ?? null;

  // 通知类请求（无 id）返回 202
  if (body.method?.startsWith('notifications/')) {
    return new Response(null, { status: 202 });
  }

  let result: any;
  switch (body.method) {
    case 'initialize':
      result = {
        protocolVersion: body.params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      };
      break;
    case 'tools/list':
      result = { tools: TOOLS };
      break;
    case 'tools/call':
      result = await callTool(ctx, body.params?.name, body.params?.arguments || {});
      break;
    case 'ping':
      result = {};
      break;
    default:
      return json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }
  return json({ jsonrpc: '2.0', id, result });
}

async function callTool(ctx: RequestContext, name: string, args: any): Promise<any> {
  try {
    const data = await executeTool(ctx, name, args);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: '错误：' + (e?.message || '执行失败') }], isError: true };
  }
}

async function executeTool(ctx: RequestContext, name: string, args: any): Promise<any> {
  const { env, user } = ctx;
  const getDomain = async (id: number) => {
    const row = await db(env, 'domain').where('id', id).find();
    if (!row) throw new Error('域名不存在');
    if (user!.level !== 2 && !user!.permissions.includes(row.name)) throw new Error('无权限访问该域名');
    return row;
  };

  switch (name) {
    case 'list_domains': {
      const q = db(env, 'domain');
      if (user!.level !== 2) {
        if (!user!.permissions.length) return [];
        q.whereIn('name', user!.permissions);
      }
      if (args.keyword) q.whereRaw('name LIKE ?', `%${args.keyword}%`);
      return q.limit(0, 100).select();
    }
    case 'get_domain':
      return getDomain(Number(args.domain_id || args.id));
    case 'list_records': {
      const d = await getDomain(Number(args.domain_id));
      const p = await getProviderByAccount(env, d.aid, d.name, d.thirdid);
      if (!p) throw new Error('获取DNS平台失败');
      const r = await p.getDomainRecords(1, 100, args.keyword);
      return r ? r.list : [];
    }
    case 'add_record': {
      const d = await getDomain(Number(args.domain_id));
      const p = await getProviderByAccount(env, d.aid, d.name, d.thirdid);
      if (!p) throw new Error('获取DNS平台失败');
      const id = await p.addDomainRecord(args.name, args.type, args.value, args.line || 'default', args.ttl || 600, 1, 0);
      if (!id) throw new Error(p.getError());
      await db(env, 'log').insert({ uid: user!.id, domain: d.name, action: 'MCP添加解析', data: `${args.name} [${args.type}] ${args.value}`, addtime: now() });
      return { success: true, record_id: id };
    }
    case 'update_record': {
      const d = await getDomain(Number(args.domain_id));
      const p = await getProviderByAccount(env, d.aid, d.name, d.thirdid);
      if (!p) throw new Error('获取DNS平台失败');
      const id = await p.updateDomainRecord(args.record_id, args.name, args.type, args.value, args.line || 'default', args.ttl || 600, 1, 0);
      return { success: !!id };
    }
    case 'delete_record': {
      const d = await getDomain(Number(args.domain_id));
      const p = await getProviderByAccount(env, d.aid, d.name, d.thirdid);
      if (!p) throw new Error('获取DNS平台失败');
      return { success: await p.deleteDomainRecord(args.record_id) };
    }
    case 'set_record_status': {
      const d = await getDomain(Number(args.domain_id));
      const p = await getProviderByAccount(env, d.aid, d.name, d.thirdid);
      if (!p) throw new Error('获取DNS平台失败');
      return { success: await p.setDomainRecordStatus(args.record_id, String(args.status)) };
    }
    case 'list_cert_orders':
      return db(env, 'cert_order').limit(0, 100).select();
    case 'list_dmonitor_tasks':
      return db(env, 'dmtask').limit(0, 100).select();
    default:
      throw new Error('未知工具：' + name);
  }
}
