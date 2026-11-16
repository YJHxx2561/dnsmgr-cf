/**
 * 系统配置层
 * 替代原 config_get/config_set + 文件缓存：
 *   - 数据源：dnsmgr_config 表（D1）
 *   - 缓存：KV（key=configs），写入时主动失效，修复原系统 config_set 不清缓存的隐患
 */

import { db } from '../db/database';
import type { Env } from '../types';
import { isNullOrEmpty } from '../utils/crypto';

const CACHE_KEY = 'configs';

/** 加载全部配置到 Map（带 KV 缓存） */
export async function loadConfigs(env: Env): Promise<Map<string, string>> {
  // 先查 KV 缓存
  try {
    const cached = await env.KV.get(CACHE_KEY, 'json');
    if (cached && typeof cached === 'object') {
      return new Map(Object.entries(cached as Record<string, string>));
    }
  } catch {
    // 缓存读取失败，回退到 D1
  }

  const rows = await db(env, 'config').select();
  const map = new Map<string, string>();
  for (const row of rows) map.set(row.key, row.value ?? '');

  // 写回 KV 缓存（TTL 5 分钟兜底）
  try {
    await env.KV.put(CACHE_KEY, JSON.stringify(Object.fromEntries(map)), { expirationTtl: 300 });
  } catch {
    // 忽略缓存写入失败
  }
  return map;
}

/** 读取单个配置 */
export async function configGet(env: Env, key: string, defaultValue: any = null, configs?: Map<string, string>): Promise<any> {
  const map = configs ?? (await loadConfigs(env));
  const value = map.get(key);
  return isNullOrEmpty(value) ? defaultValue : value;
}

/** 写入配置（UPSERT + 清缓存） */
export async function configSet(env: Env, key: string, value: any): Promise<boolean> {
  const ok = await db(env, 'config').upsert({ key, value: String(value) }, ['key']);
  try {
    await env.KV.delete(CACHE_KEY);
  } catch {
    // 忽略
  }
  return ok;
}

/** 批量写入配置 */
export async function configSetMany(env: Env, values: Record<string, any>): Promise<boolean> {
  for (const [k, v] of Object.entries(values)) {
    await db(env, 'config').upsert({ key: k, value: String(v) }, ['key']);
  }
  try {
    await env.KV.delete(CACHE_KEY);
  } catch {
    // 忽略
  }
  return true;
}

/** 清除配置缓存 */
export async function clearConfigCache(env: Env): Promise<void> {
  try {
    await env.KV.delete(CACHE_KEY);
  } catch {
    // 忽略
  }
}

/** 判断系统是否已安装（config 表存在且有 sys_key） */
export async function isInstalled(env: Env): Promise<boolean> {
  try {
    const row = await db(env, 'config').where('key', 'sys_key').find();
    return !!row;
  } catch {
    return false;
  }
}

/** 获取/生成系统密钥 */
export async function getSysKey(env: Env): Promise<string> {
  const configured = env.SYS_KEY;
  if (configured) return configured;
  let key = await configGet(env, 'sys_key');
  if (!key) {
    key = crypto.randomUUID().replace(/-/g, '');
    await configSet(env, 'sys_key', key);
  }
  return key;
}
