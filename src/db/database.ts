/**
 * D1 数据库访问层
 * 提供类似 ThinkPHP Db::name() 的轻量查询构造器，方便移植原有 controller 代码。
 * 表名统一使用完整前缀 dnsmgr_，与原系统备份数据兼容。
 */

export const PREFIX = 'dnsmgr_';

/** 转义标识符（表名字段名），SQLite 用反引号或双引号 */
function quoteIdent(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`';
}

/** 把值转成 SQL 字面量并收集绑定参数 */
export class QueryBuilder {
  private wheres: string[] = [];
  private binds: any[] = [];
  private orderBy = '';
  private limitClause = '';
  private selectFields = '*';
  private joins: string[] = [];

  constructor(private db: D1Database, private table: string) {}

  where(field: string, op: any, value?: any): this {
    if (value === undefined) {
      // where('field', value) 形式
      value = op;
      op = '=';
    }
    if (value === null) {
      this.wheres.push(`${quoteIdent(field)} IS ${op === '=' ? 'NULL' : 'NOT NULL'}`);
      return this;
    }
    if (Array.isArray(value)) {
      this.wheres.push(`${quoteIdent(field)} ${op === '=' ? 'IN' : 'NOT IN'} (${value.map(() => '?').join(',')})`);
      this.binds.push(...value);
      return this;
    }
    this.wheres.push(`${quoteIdent(field)} ${op} ?`);
    this.binds.push(value);
    return this;
  }

  whereRaw(sql: string, ...binds: any[]): this {
    this.wheres.push(sql);
    this.binds.push(...binds);
    return this;
  }

  whereIn(field: string, values: any[]): this {
    if (!values.length) {
      this.wheres.push('0 = 1');
      return this;
    }
    this.wheres.push(`${quoteIdent(field)} IN (${values.map(() => '?').join(',')})`);
    this.binds.push(...values);
    return this;
  }

  /** whereLike('id|username', kw)：多字段用 OR 连接，kw 原样（调用方自行加 %） */
  whereLike(field: string, kw: string): this {
    const fields = field.split('|');
    const parts = fields.map((f) => `${quoteIdent(f.trim())} LIKE ?`);
    this.wheres.push('(' + parts.join(' OR ') + ')');
    for (let i = 0; i < fields.length; i++) this.binds.push(kw);
    return this;
  }

  order(field: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderBy = ` ORDER BY ${quoteIdent(field)} ${direction}`;
    return this;
  }

  orderRaw(sql: string): this {
    this.orderBy = ` ORDER BY ${sql}`;
    return this;
  }

  limit(offset: number, count?: number): this {
    if (count === undefined) {
      this.limitClause = ` LIMIT ${Number(offset)}`;
    } else {
      this.limitClause = ` LIMIT ${Number(count)} OFFSET ${Number(offset)}`;
    }
    return this;
  }

  field(fields: string): this {
    this.selectFields = fields;
    return this;
  }

  join(table: string, condition: string, type: 'LEFT' | 'INNER' = 'LEFT'): this {
    // 自动补全前缀（与 db() 一致），除非调用方已传完整表名
    const full = table.startsWith(PREFIX) ? table : PREFIX + table;
    this.joins.push(` ${type} JOIN ${quoteIdent(full)} ON ${condition}`);
    return this;
  }

  private whereSql(): string {
    return this.wheres.length ? ' WHERE ' + this.wheres.join(' AND ') : '';
  }

  async select(): Promise<any[]> {
    const sql = `SELECT ${this.selectFields} FROM ${quoteIdent(this.table)}${this.joins.join('')}${this.whereSql()}${this.orderBy}${this.limitClause}`;
    const res = await this.db.prepare(sql).bind(...this.binds).all();
    return res.results as any[];
  }

  async find(): Promise<any | null> {
    const sql = `SELECT ${this.selectFields} FROM ${quoteIdent(this.table)}${this.joins.join('')}${this.whereSql()}${this.orderBy} LIMIT 1`;
    const res = await this.db.prepare(sql).bind(...this.binds).first();
    return (res as any) ?? null;
  }

  async column(field: string): Promise<any[]> {
    const sql = `SELECT ${quoteIdent(field)} FROM ${quoteIdent(this.table)}${this.joins.join('')}${this.whereSql()}${this.orderBy}`;
    const res = await this.db.prepare(sql).bind(...this.binds).all();
    return (res.results as any[]).map((r: any) => r[field]);
  }

  async value(field: string): Promise<any> {
    const row = await this.find();
    return row ? row[field] : null;
  }

  async count(): Promise<number> {
    const sql = `SELECT COUNT(*) AS c FROM ${quoteIdent(this.table)}${this.joins.join('')}${this.whereSql()}`;
    const res = await this.db.prepare(sql).bind(...this.binds).first();
    return (res as any)?.c ?? 0;
  }

  async insert(data: Record<string, any>, replace = false): Promise<boolean> {
    const keys = Object.keys(data);
    const cols = keys.map(quoteIdent).join(',');
    const placeholders = keys.map(() => '?').join(',');
    const verb = replace ? 'INSERT OR REPLACE' : 'INSERT';
    const sql = `${verb} INTO ${quoteIdent(this.table)} (${cols}) VALUES (${placeholders})`;
    const res = await this.db.prepare(sql).bind(...keys.map((k) => data[k] ?? null)).run();
    return res.success;
  }

  async insertGetId(data: Record<string, any>): Promise<number | null> {
    const ok = await this.insert(data);
    if (!ok) return null;
    const res = await this.db.prepare('SELECT last_insert_rowid() AS id').first();
    return (res as any)?.id ?? null;
  }

  async update(data: Record<string, any>): Promise<number> {
    const keys = Object.keys(data);
    if (!keys.length) return 0;
    const sets = keys.map((k) => `${quoteIdent(k)} = ?`).join(',');
    const sql = `UPDATE ${quoteIdent(this.table)} SET ${sets}${this.whereSql()}`;
    const res = await this.db.prepare(sql).bind(...keys.map((k) => data[k] ?? null), ...this.binds).run();
    return res.meta?.changes ?? 0;
  }

  async delete(): Promise<number> {
    const sql = `DELETE FROM ${quoteIdent(this.table)}${this.whereSql()}`;
    const res = await this.db.prepare(sql).bind(...this.binds).run();
    return res.meta?.changes ?? 0;
  }

  /** UPSERT：兼容原 config_set 的 replace()->insert */
  async upsert(data: Record<string, any>, conflictKeys: string[]): Promise<boolean> {
    const keys = Object.keys(data);
    const cols = keys.map(quoteIdent).join(',');
    const placeholders = keys.map(() => '?').join(',');
    const updates = keys.filter((k) => !conflictKeys.includes(k)).map((k) => `${quoteIdent(k)}=excluded.${quoteIdent(k)}`).join(',');
    const sql = `INSERT INTO ${quoteIdent(this.table)} (${cols}) VALUES (${placeholders}) ON CONFLICT(${conflictKeys.map(quoteIdent).join(',')}) DO UPDATE SET ${updates || `${quoteIdent(keys[0])}=excluded.${quoteIdent(keys[0])}`}`;
    const res = await this.db.prepare(sql).bind(...keys.map((k) => data[k] ?? null)).run();
    return res.success;
  }
}

/** 数据库门面：db('user') 等价于 Db::name('user')（自动加前缀） */
export function db(env: { DB: D1Database }, tableWithoutPrefix: string): QueryBuilder {
  return new QueryBuilder(env.DB, PREFIX + tableWithoutPrefix);
}

/** 使用完整表名（含前缀） */
export function dbFull(dbHandle: D1Database, fullTable: string): QueryBuilder {
  return new QueryBuilder(dbHandle, fullTable);
}

/** 执行原生 SQL */
export async function execute(dbHandle: D1Database, sql: string, ...binds: any[]): Promise<D1Result> {
  return dbHandle.prepare(sql).bind(...binds).run();
}

/** 查询原生 SQL 返回多行 */
export async function query(dbHandle: D1Database, sql: string, ...binds: any[]): Promise<any[]> {
  const res = await dbHandle.prepare(sql).bind(...binds).all();
  return res.results as any[];
}

/** 检查表是否存在（替代 SHOW TABLES LIKE） */
export async function tableExists(dbHandle: D1Database, table: string): Promise<boolean> {
  const full = table.startsWith(PREFIX) ? table : PREFIX + table;
  const row = await dbHandle
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .bind(full)
    .first();
  return !!row;
}

/** 批量执行多条 SQL 语句（用于备份导入） */
export async function executeBatch(dbHandle: D1Database, statements: D1PreparedStatement[]): Promise<D1Result[]> {
  return dbHandle.batch(statements);
}
