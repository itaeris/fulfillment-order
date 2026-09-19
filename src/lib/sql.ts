import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;

export function getMysql() {
  if (pool) return pool;
  const host = String(process.env.MYSQL_HOST || "127.0.0.1").trim();
  const database = String(process.env.MYSQL_DATABASE || "fulfillment_db").trim();
  pool = mysql.createPool({
    host,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: String(process.env.MYSQL_USER || "root").trim(),
    password: String(process.env.MYSQL_PASSWORD || ""),
    database,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: "+07:00",
  });
  return pool;
}

export async function sqlQuery<T = Record<string, unknown>[]>(sql: string, params: unknown[] = []): Promise<T> {
  const { ensureSchema } = await import("./schema");
  await ensureSchema();
  const [rows] = await getMysql().query(sql, params);
  return rows as T;
}

function ident(column: string) {
  return `\`${String(column).replace(/`/g, "")}\``;
}

function inList(values: unknown[]) {
  return values.map(() => "?").join(", ");
}

type Filter = { sql: string; params: unknown[] };

class Query {
  private tableName: string;
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private columns = "*";
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitCount?: number;
  private offsetCount?: number;
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private wantSingle = false;
  private wantMaybe = false;
  private wantCount = false;
  private headOnly = false;
  private ignoreDup = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns = "*", opts?: { count?: string; head?: boolean }) {
    this.columns = columns;
    if (opts?.count === "exact") this.wantCount = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ sql: `${ident(column)} = ?`, params: [value] });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ sql: `${ident(column)} <> ?`, params: [value] });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ sql: `${ident(column)} >= ?`, params: [value] });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ sql: `${ident(column)} < ?`, params: [value] });
    return this;
  }

  in(column: string, values: unknown[]) {
    const list = values.length ? values : [null];
    this.filters.push({ sql: `${ident(column)} IN (${inList(list)})`, params: list });
    return this;
  }

  not(column: string, op: string, value: string) {
    if (op === "in") {
      const inner = String(value || "")
        .replace(/[()]/g, "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (inner.length) this.filters.push({ sql: `${ident(column)} NOT IN (${inList(inner)})`, params: inner });
    }
    return this;
  }

  or(raw: string) {
    const parts = String(raw || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const ilike = part.match(/^([a-z0-9_]+)\.ilike\.%(.+)%$/i);
        if (ilike) return { sql: `LOWER(${ident(ilike[1])}) LIKE ?`, params: [`%${ilike[2].toLowerCase()}%`] };
        const gte = part.match(/^([a-z0-9_]+)\.gte\.(.+)$/i);
        if (gte) return { sql: `${ident(gte[1])} >= ?`, params: [gte[2]] };
        const eq = part.match(/^([a-z0-9_]+)\.eq\.(.+)$/i);
        if (eq) return { sql: `${ident(eq[1])} = ?`, params: [eq[2]] };
        return null;
      })
      .filter(Boolean) as Filter[];
    if (parts.length) {
      this.filters.push({
        sql: `(${parts.map((part) => part.sql).join(" OR ")})`,
        params: parts.flatMap((part) => part.params),
      });
    }
    return this;
  }

  ilike(column: string, value: string) {
    this.filters.push({ sql: `LOWER(${ident(column)}) LIKE ?`, params: [String(value).toLowerCase()] });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orders.push(`${ident(column)} ${opts?.ascending === false ? "DESC" : "ASC"}`);
    return this;
  }

  range(from: number, to: number) {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.wantSingle = true;
    this.limitCount = 1;
    return this;
  }

  maybeSingle() {
    this.wantMaybe = true;
    this.limitCount = 1;
    return this;
  }

  insert(row: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = "insert";
    this.payload = row;
    return this;
  }

  update(fields: Record<string, unknown>) {
    this.op = "update";
    this.payload = fields;
    return this;
  }

  upsert(rows: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.payload = rows;
    this.ignoreDup = Boolean(opts?.ignoreDuplicates);
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  private whereSql() {
    if (!this.filters.length) return { sql: "", params: [] as unknown[] };
    return {
      sql: ` WHERE ${this.filters.map((filter) => filter.sql).join(" AND ")}`,
      params: this.filters.flatMap((filter) => filter.params),
    };
  }

  private async run(): Promise<{ data: any; error: null | Error; count: number | null }> {
    const table = ident(this.tableName);
    const where = this.whereSql();
    if (this.op === "select") {
      if (this.wantCount || this.headOnly) {
        const rows = await sqlQuery<[{ n: number }]>(`SELECT COUNT(*) AS n FROM ${table}${where.sql}`, where.params);
        const count = Number(rows[0]?.n || 0);
        return { data: this.headOnly ? null : [], error: null, count };
      }
      let sql = `SELECT ${this.columns} FROM ${table}${where.sql}`;
      if (this.orders.length) sql += ` ORDER BY ${this.orders.join(", ")}`;
      const params = [...where.params];
      if (this.limitCount != null) {
        sql += " LIMIT ?";
        params.push(this.limitCount);
      }
      if (this.offsetCount != null) {
        sql += " OFFSET ?";
        params.push(this.offsetCount);
      }
      const rows = await sqlQuery(sql, params);
      if (this.wantSingle || this.wantMaybe) {
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row && this.wantSingle) throw new Error("Row not found");
        return { data: row || null, error: null, count: row ? 1 : 0 };
      }
      return { data: rows, error: null, count: Array.isArray(rows) ? rows.length : 0 };
    }

    const rows = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
    if (this.op === "insert" || this.op === "upsert") {
      if (!rows.length) return { data: [], error: null, count: 0 };
      const keys = Object.keys(rows[0]);
      const cols = keys.map(ident).join(", ");
      const values = rows.flatMap((row) => keys.map((key) => row[key] ?? null));
      const tuple = `(${keys.map(() => "?").join(", ")})`;
      let sql = `${this.ignoreDup ? "INSERT IGNORE" : "INSERT"} INTO ${table} (${cols}) VALUES ${rows.map(() => tuple).join(", ")}`;
      if (this.op === "upsert" && !this.ignoreDup) {
        sql += ` ON DUPLICATE KEY UPDATE ${keys
          .filter((key) => key !== "id")
          .map((key) => `${ident(key)} = VALUES(${ident(key)})`)
          .join(", ")}`;
      }
      await sqlQuery(sql, values);
      const last = rows[rows.length - 1];
      return { data: this.wantSingle || this.wantMaybe ? last : rows, error: null, count: rows.length };
    }

    if (this.op === "update") {
      const fields = (this.payload || {}) as Record<string, unknown>;
      const keys = Object.keys(fields);
      if (!keys.length) return { data: null, error: null, count: 0 };
      const sql = `UPDATE ${table} SET ${keys.map((key) => `${ident(key)} = ?`).join(", ")}${where.sql}`;
      await sqlQuery(sql, [...keys.map((key) => fields[key] ?? null), ...where.params]);
      if (this.wantSingle || this.wantMaybe) {
        const select = await sqlQuery(`SELECT * FROM ${table}${where.sql} LIMIT 1`, where.params);
        return { data: Array.isArray(select) ? select[0] || null : null, error: null, count: 1 };
      }
      return { data: null, error: null, count: 0 };
    }

    await sqlQuery(`DELETE FROM ${table}${where.sql || " WHERE 1=1"}`, where.params);
    return { data: null, error: null, count: 0 };
  }

  then<TResult1 = { data: any; error: Error | null; count: number | null }, TResult2 = never>(
    resolve?: ((value: { data: any; error: Error | null; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.run()
      .catch((error) => ({
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
        count: null,
      }))
      .then(resolve ?? undefined, reject ?? undefined);
  }
}

export const supabase = {
  from(table: string) {
    return new Query(table);
  },
};
