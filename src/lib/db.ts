import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths";
import { ensureSeed } from "./seed";

// node:sqlite は Node.js 22.13 以降に標準で入っている SQLite。
// 追加のネイティブモジュールが不要なので、手元のPCでもそのまま動く。
// 本番で PostgreSQL に移すときは、このファイルと repo.ts を差し替える。
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  monthly_quota INTEGER NOT NULL DEFAULT 500,
  engine_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  external_code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  style TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  features TEXT NOT NULL DEFAULT '[]',
  color_name TEXT NOT NULL DEFAULT '',
  color_hex TEXT NOT NULL DEFAULT '#888888',
  fit TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL DEFAULT '',
  care TEXT NOT NULL DEFAULT '',
  sizes TEXT NOT NULL DEFAULT '["S","M","L","XL"]',
  price_jpy INTEGER NOT NULL DEFAULT 0,
  product_url TEXT NOT NULL DEFAULT '',
  image_key TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, external_code)
);
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  height_cm INTEGER NOT NULL,
  size_worn TEXT NOT NULL,
  body_type TEXT NOT NULL DEFAULT 'standard',
  skin_hex TEXT NOT NULL DEFAULT '#e8c4a0',
  hair_hex TEXT NOT NULL DEFAULT '#2b2118',
  hair_style TEXT NOT NULL DEFAULT 'short',
  image_key TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS looks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  outer_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  bottom_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  combo_key TEXT NOT NULL,
  status TEXT NOT NULL,
  engine_id TEXT,
  image_key TEXT,
  error_code TEXT,
  latency_ms INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'pregenerate',
  generated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, combo_key)
);
CREATE INDEX IF NOT EXISTS looks_status ON looks(status);
CREATE TABLE IF NOT EXISTS usage_monthly (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  month TEXT NOT NULL,
  generated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, month)
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  session_id TEXT,
  type TEXT NOT NULL,
  product_id TEXT,
  look_id TEXT,
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_tenant_time ON events(tenant_id, occurred_at);
`;

type Db = DatabaseSyncType;
const g = globalThis as unknown as { __tryonDb?: Db };

export function openDb(file?: string): Db {
  const target = file ?? path.join(dataDir(), "app.db");
  if (target !== ":memory:") fs.mkdirSync(path.dirname(target), { recursive: true });
  const db = new DatabaseSync(target);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}

/** アプリ全体で共有する接続。初回呼び出し時にテーブル作成とデモデータ投入を行う。 */
export function db(): Db {
  if (!g.__tryonDb) {
    const conn = openDb();
    g.__tryonDb = conn;
    ensureSeed(conn);
  }
  return g.__tryonDb;
}

/** テスト用: 共有接続を差し替える */
export function setDbForTest(conn: Db | undefined) {
  g.__tryonDb = conn;
}

export function now(): string {
  return new Date().toISOString();
}

export function uid(): string {
  return crypto.randomUUID();
}

export type { Db };
