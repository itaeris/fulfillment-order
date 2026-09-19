import { createRequire } from "module";
import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const SKIP = new Set([
  "ER_TABLE_EXISTS_ERROR",
  "ER_DUP_FIELDNAME",
  "ER_DUP_KEYNAME",
  "ER_MULTIPLE_PRI_KEY",
  "ER_CANT_DROP_FIELD_OR_KEY",
]);

const here = dirname(fileURLToPath(import.meta.url));
const sqlFile = [
  join(here, "../docker/mysql/init.sql"),
  "/app/docker/mysql/init.sql",
].find((path) => existsSync(path));

if (!sqlFile) {
  console.error("migrate: docker/mysql/init.sql tidak ketemu");
  process.exit(1);
}

function statements() {
  return readFileSync(sqlFile, "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !/^CREATE DATABASE/i.test(part) && !/^USE /i.test(part));
}

function splitDefs(body) {
  const parts = [];
  let buf = "";
  let depth = 0;
  for (const ch of body) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf);
  return parts;
}

function parseCreate(sql) {
  const match = sql.match(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?\s*\(([\s\S]*)\)\s*$/i);
  if (!match) return null;
  const columns = [];
  const indexes = [];
  for (const raw of splitDefs(match[2])) {
    const line = raw.trim().replace(/,\s*$/, "");
    if (!line) continue;
    if (/^(PRIMARY\s+KEY|UNIQUE(\s+KEY)?|KEY|INDEX|CONSTRAINT|FOREIGN\s+KEY)/i.test(line)) {
      indexes.push(line);
      continue;
    }
    const name = line.replace(/^`/, "").split(/[\s`]/)[0];
    if (name) columns.push({ name, def: line });
  }
  return { table: match[1], columns, indexes };
}

function indexName(line) {
  const named = line.match(/^(?:UNIQUE(?:\s+KEY)?|KEY|INDEX)\s+`?(\w+)`?/i);
  if (named) return named[1];
  if (/^PRIMARY\s+KEY/i.test(line)) return "PRIMARY";
  return "";
}

function isSkip(error) {
  return SKIP.has(error?.code) || /Duplicate|already exists/i.test(String(error?.message || ""));
}

async function queryOk(conn, sql) {
  try {
    await conn.query(sql);
    return true;
  } catch (error) {
    if (isSkip(error)) return false;
    throw error;
  }
}

async function connect() {
  const config = {
    host: String(process.env.MYSQL_HOST || "127.0.0.1").trim(),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: String(process.env.MYSQL_USER || "root").trim(),
    password: String(process.env.MYSQL_PASSWORD || ""),
    multipleStatements: false,
  };
  const database = String(process.env.MYSQL_DATABASE || "fulfillment_db").trim().replace(/`/g, "");
  let last;
  for (let i = 0; i < 20; i += 1) {
    try {
      const conn = await mysql.createConnection(config);
      try {
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
      } catch (error) {
        if (!isSkip(error) && error?.code !== "ER_DB_CREATE_EXISTS") {
          /* user mungkin tidak punya CREATE — lanjut kalau DB sudah ada */
        }
      }
      await conn.changeUser({ database });
      return { conn, database };
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw last;
}

const { conn, database } = await connect();
try {
  let created = 0;
  let columns = 0;

  for (const sql of statements()) {
    const parsed = parseCreate(sql);
    if (!parsed) {
      await queryOk(conn, sql);
      continue;
    }

    const [tables] = await conn.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [database, parsed.table]
    );
    const existed = tables.length > 0;
    await queryOk(conn, sql);
    if (!existed) {
      created += 1;
      console.log(`migrate: ${parsed.table} created`);
    } else {
      console.log(`migrate: ${parsed.table} ok`);
    }

    const [haveCols] = await conn.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [database, parsed.table]
    );
    const colSet = new Set(haveCols.map((row) => String(row.COLUMN_NAME)));
    for (const col of parsed.columns) {
      if (colSet.has(col.name)) continue;
      const added = await queryOk(conn, `ALTER TABLE \`${parsed.table}\` ADD COLUMN ${col.def}`);
      if (added) {
        columns += 1;
        console.log(`migrate: ${parsed.table}.${col.name} +`);
      }
    }

    const [haveIdx] = await conn.query(
      "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [database, parsed.table]
    );
    const idxSet = new Set(haveIdx.map((row) => String(row.INDEX_NAME)));
    for (const line of parsed.indexes) {
      const name = indexName(line);
      if (name && idxSet.has(name)) continue;
      const added = await queryOk(conn, `ALTER TABLE \`${parsed.table}\` ADD ${line}`);
      if (added) console.log(`migrate: ${parsed.table} index ${name || line}`);
    }
  }

  const email = "it@aerisbeaute.com";
  const username = "itaeris";
  const hash = await bcrypt.hash("@AerisFTI2026!", 10);
  const [admins] = await conn.query("SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1", [
    email,
    username,
  ]);
  if (admins[0]?.id) {
    await conn.query(
      `UPDATE users SET username = ?, name = ?, email = ?, password_hash = ?, role = 'admin', approved = 1 WHERE id = ?`,
      [username, "IT Aeris", email, hash, admins[0].id]
    );
    console.log("migrate: admin it@aerisbeaute.com ok");
  } else {
    await conn.query(
      `INSERT INTO users (id, username, name, email, password_hash, role, approved)
       VALUES (?, ?, ?, ?, ?, 'admin', 1)`,
      [randomUUID(), username, "IT Aeris", email, hash]
    );
    console.log("migrate: admin it@aerisbeaute.com created");
  }

  if (created === 0 && columns === 0) {
    console.log("migrate: tidak ada table/kolom baru");
  }
  console.log("migrate: done");
} finally {
  await conn.end();
}
