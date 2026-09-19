import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;

export function mysqlConfigured() {
  return Boolean(String(process.env.MYSQL_HOST || "").trim() && String(process.env.MYSQL_DATABASE || "").trim());
}

export function getMysql() {
  if (pool) return pool;
  if (!mysqlConfigured()) {
    throw new Error("MySQL belum dikonfigurasi di backend Nest");
  }
  pool = mysql.createPool({
    host: String(process.env.MYSQL_HOST).trim(),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: String(process.env.MYSQL_USER || "root").trim(),
    password: String(process.env.MYSQL_PASSWORD || ""),
    database: String(process.env.MYSQL_DATABASE).trim(),
    waitForConnections: true,
    connectionLimit: 8,
    timezone: "+07:00",
  });
  return pool;
}

export async function mysqlReady() {
  if (!mysqlConfigured()) return false;
  const conn = await getMysql().getConnection();
  try {
    await conn.query("SELECT 1");
    return true;
  } finally {
    conn.release();
  }
}
