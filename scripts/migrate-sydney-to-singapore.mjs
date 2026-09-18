/**
 * Copy auth users + public tables from the Sydney Supabase project to Singapore.
 * Schema must already exist on the destination (run supabase/migration.sql).
 *
 * Usage:
 *   OLD_SUPABASE_URL=... OLD_SUPABASE_SERVICE_ROLE_KEY=... \
 *   NEW_SUPABASE_URL=... NEW_SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/migrate-sydney-to-singapore.mjs
 */
const OLD_URL = required("OLD_SUPABASE_URL");
const OLD_KEY = required("OLD_SUPABASE_SERVICE_ROLE_KEY");
const NEW_URL = required("NEW_SUPABASE_URL");
const NEW_KEY = required("NEW_SUPABASE_SERVICE_ROLE_KEY");

const PAGE = 1000;
const UPSERT = 500;

const TABLES = [
  "tiktok_tokens",
  "shopee_tokens",
  "jubelio_tokens",
  "uploaded_files",
  "overview_files",
  "profiles",
  "orders",
  "overview_orders",
  "live_order_status",
  "overdue_scans",
  "cancel_alerts",
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value.replace(/\/$/, "");
}

function headers(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url, key, init = {}, attempt = 1) {
  const response = await fetch(url, {
    ...init,
    headers: headers(key, init.headers),
  });
  if ((response.status === 429 || response.status >= 500) && attempt < 6) {
    await sleep(400 * attempt);
    return request(url, key, init, attempt + 1);
  }
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  if (!response.ok) {
    const detail = typeof json === "string" ? json : JSON.stringify(json);
    throw new Error(`${response.status} ${init.method || "GET"} ${url}: ${detail.slice(0, 500)}`);
  }
  return { response, json };
}

async function tableExists(url, key, table) {
  try {
    await request(`${url}/rest/v1/${table}?select=*&limit=1`, key);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("PGRST205") || message.includes("does not exist")) return false;
    throw error;
  }
}

async function countRows(url, key, table) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*`, {
    method: "HEAD",
    headers: headers(key, { Prefer: "count=exact", Range: "0-0" }),
  });
  const range = response.headers.get("content-range") || "";
  const total = range.split("/")[1];
  return Number(total || 0);
}

async function fetchPage(url, key, table, from) {
  const to = from + PAGE - 1;
  const { json } = await request(`${url}/rest/v1/${table}?select=*`, key, {
    headers: { Range: `${from}-${to}`, Prefer: "count=exact" },
  });
  return Array.isArray(json) ? json : [];
}

async function upsertRows(url, key, table, rows) {
  if (!rows.length) return;
  await request(`${url}/rest/v1/${table}`, key, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
}

async function copyTable(table) {
  const total = await countRows(OLD_URL, OLD_KEY, table);
  let copied = 0;
  for (let from = 0; from < total; from += PAGE) {
    const rows = await fetchPage(OLD_URL, OLD_KEY, table, from);
    for (let i = 0; i < rows.length; i += UPSERT) {
      await upsertRows(NEW_URL, NEW_KEY, table, rows.slice(i, i + UPSERT));
    }
    copied += rows.length;
    console.log(`  ${table}: ${copied}/${total}`);
  }
  if (total === 0) console.log(`  ${table}: 0/0`);
  return { table, old: total, copied };
}

async function listUsers() {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { json } = await request(
      `${OLD_URL}/auth/v1/admin/users?page=${page}&per_page=200`,
      OLD_KEY,
    );
    const batch = Array.isArray(json?.users) ? json.users : [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users;
}

async function copyUsers(users) {
  let created = 0;
  let skipped = 0;
  for (const user of users) {
    const payload = {
      id: user.id,
      email: user.email,
      phone: user.phone || undefined,
      email_confirm: true,
      phone_confirm: Boolean(user.phone),
      user_metadata: user.user_metadata || {},
      app_metadata: user.app_metadata || {},
    };
    try {
      await request(`${NEW_URL}/auth/v1/admin/users`, NEW_KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      created += 1;
      console.log(`  auth user created ${user.email}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("already") || message.includes("exists") || message.includes("unique")) {
        skipped += 1;
        console.log(`  auth user exists ${user.email}`);
        continue;
      }
      throw error;
    }
  }
  return { created, skipped, total: users.length };
}

async function main() {
  console.log(`from ${OLD_URL}`);
  console.log(`to   ${NEW_URL}`);

  const missing = [];
  for (const table of TABLES) {
    if (!(await tableExists(NEW_URL, NEW_KEY, table))) missing.push(table);
  }
  if (missing.length) {
    throw new Error(
      `Singapore schema missing: ${missing.join(", ")}. Run supabase/migration.sql in the new project's SQL Editor first.`,
    );
  }

  const users = await listUsers();
  console.log(`auth users on source: ${users.length}`);
  const authResult = await copyUsers(users);

  const tables = [];
  for (const table of TABLES) {
    tables.push(await copyTable(table));
  }

  console.log(JSON.stringify({ auth: authResult, tables }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
