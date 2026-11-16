/**
 * DNS 平台工厂
 * 根据账户 type 创建对应 provider 实例。
 * 已实现原生客户端的平台优先使用；未实现的平台用通用适配器（GenericProvider）按配置驱动。
 */

import type { Env } from '../types';
import { db } from '../db/database';
import { BaseDnsProvider } from './base';
import { CloudflareProvider } from './providers/cloudflare';
import { AliyunProvider } from './providers/aliyun';
import { DnspodProvider } from './providers/dnspod';
import { GenericProvider } from './providers/generic';
import { DNS_CONFIG } from './meta';

/** 根据账户 ID 创建 provider */
export async function getProviderByAccount(
  env: Env,
  accountId: number,
  domain = '',
  thirdid = ''
): Promise<BaseDnsProvider | null> {
  const loaded = await BaseDnsProvider.loadConfig(env, accountId);
  if (!loaded) return null;
  return createProvider(env, loaded.type, loaded.config, domain, thirdid);
}

/** 根据类型与配置创建 provider */
export function createProvider(
  env: Env,
  type: string,
  config: Record<string, any>,
  domain = '',
  thirdid = ''
): BaseDnsProvider | null {
  // 构造时将 domain/thirdid 合入 config，与原 PHP 行为一致
  const cfg = { ...config, domain, domainid: thirdid };
  switch (type) {
    case 'cloudflare':
      return new CloudflareProvider(env, cfg, domain, thirdid);
    case 'aliyun':
    case 'aliyunesa':
      return new AliyunProvider(env, cfg, domain, thirdid, type === 'aliyunesa');
    case 'dnspod':
    case 'tencenteo':
      return new DnspodProvider(env, cfg, domain, thirdid, type === 'tencenteo');
    default:
      // 其余平台使用通用适配器（按平台类型映射 API 端点）
      if (!DNS_CONFIG[type]) return null;
      return new GenericProvider(env, type, cfg, domain, thirdid);
  }
}

/** 获取平台元数据 */
export function getProviderMeta(type: string) {
  return DNS_CONFIG[type] || null;
}
