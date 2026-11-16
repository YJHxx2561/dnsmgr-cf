/**
 * 元数据接口：把各平台/证书/部署类型的动态表单配置暴露给前端，
 * 让前端能按原 PHP 项目的方式生成"添加账户"等动态表单。
 * 数据源均从 PHP 原项目自动提取，保持单一数据源。
 */
import type { RequestContext } from '../types';
import { json } from '../core/response';
import { DNS_CONFIG, LINE_NAME, RECORD_TYPE_SUPPORT } from '../dns/meta';
import { CERT_CONFIG, DEPLOY_CONFIG } from '../dns/cert-meta';

/** 精简字段定义，去掉前端不需要的内部标记，保留表单渲染所需 */
function simplify(cfg: any): any {
  const out: any = {};
  for (const [key, item] of Object.entries<any>(cfg || {})) {
    const meta: any = { name: item.name };
    if (item.icon) meta.icon = item.icon;
    if (item.note) meta.note = item.note;
    if (item.class !== undefined) meta.class = item.class;
    if (item.wildcard !== undefined) meta.wildcard = item.wildcard;
    if (item.max_domains !== undefined) meta.max_domains = item.max_domains;
    if (item.cname !== undefined) meta.cname = item.cname;
    // 输入字段
    const fields: any = {};
    for (const [fk, fv] of Object.entries<any>(item.inputs || item.config || {})) {
      fields[fk] = {
        name: fv.name,
        type: fv.type || 'input',
        required: !!fv.required,
        ...(fv.placeholder !== undefined ? { placeholder: fv.placeholder } : {}),
        ...(fv.options !== undefined ? { options: fv.options } : {}),
        ...(fv.value !== undefined ? { value: fv.value } : {}),
        ...(fv.show !== undefined ? { show: fv.show } : {}),
        ...(fv.note !== undefined ? { note: fv.note } : {}),
      };
    }
    meta.fields = fields;
    // 部署任务的 taskinputs
    if (item.taskinputs) meta.taskinputs = item.taskinputs;
    out[key] = meta;
  }
  return out;
}

/** 全部元数据（DNS平台 + 证书类型 + 部署目标） */
export async function getMeta(_ctx: RequestContext): Promise<Response> {
  return json({
    code: 0,
    data: {
      dns: simplify(DNS_CONFIG),
      cert: simplify(CERT_CONFIG),
      deploy: simplify(DEPLOY_CONFIG),
      lineName: LINE_NAME,
      recordTypeSupport: RECORD_TYPE_SUPPORT,
    },
  });
}
