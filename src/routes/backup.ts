/**
 * 数据库备份与恢复
 * - 导出：把 D1 全部 17 张表导出为 SQLite 兼容 .sql（INSERT OR REPLACE）
 * - 导入：解析上传的 .sql 逐条执行，重建数据
 * - 兼容历史 MySQL mysqldump：把 MySQL DDL/DML 转成 SQLite 语法
 */
import type { RequestContext } from '../types';
import type { Router } from '../core/router';
import { dbFull, PREFIX, query } from '../db/database';
import { checkPermission } from '../auth/middleware';
import { json, fail } from '../core/response';

/** 全部业务表（顺序考虑外键无依赖，SQLite 无强制外键） */
const TABLES = [
  'config', 'account', 'domain', 'user', 'permission', 'log', 'dmtask', 'dmlog',
  'optimizeip', 'cert_account', 'cert_order', 'cert_domain', 'cert_deploy',
  'cert_cname', 'sctask', 'domain_alias', 'domain_category',
];

function sqlLiteral(v: any): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

/** 导出 SQLite dump */
export async function exportBackup(ctx: RequestContext): Promise<Response> {
  if (!checkPermission(ctx.user, 2)) return fail('无权限', -1);
  const { env } = ctx;
  const lines: string[] = [];
  lines.push('-- dnsmgr D1 backup');
  lines.push('-- generated: ' + new Date().toISOString());
  lines.push('BEGIN TRANSACTION;');

  for (const table of TABLES) {
    const full = PREFIX + table;
    let rows: any[] = [];
    try {
      rows = await query(env.DB, `SELECT * FROM \`${full}\``);
    } catch {
      continue; // 表不存在则跳过
    }
    lines.push(`\n-- Table: ${full}`);
    for (const row of rows) {
      const cols = Object.keys(row).map((c) => `\`${c}\``).join(',');
      const vals = Object.values(row).map(sqlLiteral).join(',');
      lines.push(`INSERT OR REPLACE INTO \`${full}\` (${cols}) VALUES (${vals});`);
    }
  }
  lines.push('\nCOMMIT;');
  const dump = lines.join('\n');
  return new Response(dump, {
    headers: {
      'Content-Type': 'application/octet-stream; charset=utf-8',
      'Content-Disposition': `attachment; filename="dnsmgr-backup-${new Date().toISOString().slice(0, 10)}.sql"`,
    },
  });
}

/**
 * 把历史 MySQL mysqldump / install.sql 语句转换为 SQLite：
 *  - 去反引号保留（SQLite 支持）
 *  - DROP/CREATE TABLE：替换 ENGINE/CHARSET、int(11) unsigned、auto_increment、KEY 定义
 *  - REPLACE INTO -> INSERT OR REPLACE
 *  - NOW() -> CURRENT_TIMESTAMP
 *  - INTERVAL 表达式 -> datetime('now', '+N days') 简化处理
 */
function convertMysqlStatement(sql: string): string {
  let s = sql.trim();
  // 反复去掉开头的行注释（-- xxx ... 直到换行）与块注释
  let changed = true;
  while (changed) {
    changed = false;
    if (/^--[^\n]*(\n|$)/.test(s)) { s = s.replace(/^--[^\n]*(\n|$)/, '').trim(); changed = true; }
    else if (/^#[^\n]*(\n|$)/.test(s)) { s = s.replace(/^#[^\n]*(\n|$)/, '').trim(); changed = true; }
    else if (/^\/\*[\s\S]*?\*\//.test(s)) { s = s.replace(/^\/\*[\s\S]*?\*\//, '').trim(); changed = true; }
  }
  if (!s) return '';
  // 事务语句、SET、LOCK 忽略（D1 batch 不支持显式事务）
  if (/^(SET |LOCK TABLES|UNLOCK|BEGIN|COMMIT|START TRANSACTION|ROLLBACK)/i.test(s)) return '';
  // DROP TABLE IF EXISTS `x`
  s = s.replace(/DROP TABLE IF EXISTS\s+`?(\w+)`?/gi, 'DROP TABLE IF EXISTS `$1`');
  // CREATE TABLE
  if (/^CREATE TABLE/i.test(s)) {
    s = s.replace(/\)\s*ENGINE=\w+\s+DEFAULT CHARSET=\w+/gi, ')');
    s = s.replace(/\)\s*AUTO_INCREMENT=\d+/gi, ')');
    // 自增列统一转 INTEGER；SQLite 中 "id INTEGER PRIMARY KEY" 即自动自增
    s = s.replace(/int\(\d+\)\s*unsigned\s+NOT NULL\s+auto_increment/gi, 'INTEGER');
    s = s.replace(/int\(\d+\)\s*unsigned\s+NOT NULL\s+AUTO_INCREMENT/gi, 'INTEGER');
    s = s.replace(/int\(\d+\)\s*unsigned/gi, 'INTEGER');
    s = s.replace(/int\(\d+\)/gi, 'INTEGER');
    s = s.replace(/tinyint\(\d+\)/gi, 'INTEGER');
    s = s.replace(/varchar\(\d+\)/gi, 'TEXT');
    s = s.replace(/\bauto_increment\b/gi, '');
    // 去掉行内 KEY `x` (`col`) 二级索引定义（SQLite 建表内不支持，可用 CREATE INDEX 补）
    s = s.replace(/,\s*KEY\s+`?\w+`?\s*\([^)]*\)/gi, '');
    s = s.replace(/DEFAULT\s+'?(\d+)'?/gi, 'DEFAULT $1');
  }
  // ALTER TABLE ADD KEY -> CREATE INDEX（简化：跳过）
  if (/^ALTER TABLE/i.test(s) && /ADD\s+(KEY|INDEX)/i.test(s)) return '';
  // 只转换独立的 REPLACE INTO（此前已是 INSERT OR REPLACE 的保持不变）
  s = s.replace(/\bREPLACE\s+INTO/gi, (m, offset) => {
    const before = s.slice(0, offset).trim().toUpperCase();
    return before.endsWith('INSERT OR') ? m : 'INSERT OR REPLACE INTO';
  });
  s = s.replace(/NOW\(\)/gi, "datetime('now')");
  s = s.replace(/\/\*!50001\s*\w+\s*\*\//gi, '');
  return s;
}

/** 去除注释行（保留字符串内的 -- / #），再拆分 SQL（考虑字符串内的分号） */
function splitSql(sql: string): string[] {
  // 逐行去除以 -- 或 # 开头的整行注释
  const cleaned = sql.split('\n').filter((line) => {
    const t = line.trim();
    return t !== '' && !t.startsWith('--') && !t.startsWith('#') && !t.startsWith('/*');
  }).join('\n');

  const out: string[] = [];
  let cur = '', inStr = false, quote = '';
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i], n = cleaned[i + 1];
    if (inStr) {
      cur += c;
      if (c === '\\' && n) { cur += n; i++; continue; }
      if (c === quote) inStr = false;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { inStr = true; quote = c; cur += c; continue; }
    if (c === ';') { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** 导入备份（支持新格式与历史 MySQL dump） */
export async function importBackup(ctx: RequestContext): Promise<Response> {
  if (!checkPermission(ctx.user, 2)) return fail('无权限', -1);
  const { env, body, request } = ctx;
  let sql = '';

  // 支持 JSON body {sql} 或 multipart 文件上传
  if (body.sql) sql = String(body.sql);
  else if (request.headers.get('Content-Type')?.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (file && typeof file !== 'string') sql = await (file as File).text();
  }
  if (!sql.trim()) return fail('备份文件为空', -1);

  const statements = splitSql(sql);
  let success = 0, failed = 0;
  const errors: string[] = [];

  // 分批执行，每批 50 条，避免超出 D1 batch 限制
  const batchSize = 50;
  for (let i = 0; i < statements.length; i += batchSize) {
    const chunk = statements.slice(i, i + batchSize);
    const prepared: D1PreparedStatement[] = [];
    for (const raw of chunk) {
      const converted = convertMysqlStatement(raw);
      if (!converted) { success++; continue; }
      try { prepared.push(env.DB.prepare(converted)); }
      catch (e: any) { failed++; if (errors.length < 10) errors.push(e.message); }
    }
    if (prepared.length) {
      try {
        await env.DB.batch(prepared);
        success += prepared.length;
      } catch (e: any) {
        // 整批失败时逐条执行以定位错误
        for (const stmt of prepared) {
          try { await stmt.run(); success++; }
          catch (e2: any) { failed++; if (errors.length < 10) errors.push(e2.message); }
        }
      }
    }
  }

  // 恢复后清配置缓存
  try { await env.KV.delete('configs'); } catch {}

  return json({
    code: failed ? -1 : 0,
    msg: `恢复完成：成功${success}条，失败${failed}条`,
    data: { success, failed, errors },
  });
}

export function registerBackupRoutes(router: Router): void {
  router.get('/system/backup/export', exportBackup, { auth: true });
  router.post('/system/backup/import', importBackup, { auth: true });
}
