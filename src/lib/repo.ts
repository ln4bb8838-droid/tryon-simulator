// データの読み書き。SQLはこのファイルに集め、すべての問い合わせで tenant_id を条件に入れる（仕様 N-SEC-02）。

import { db, now, uid } from "./db";
import type { Category, EventType, Look, Model, Product, Tenant, User } from "./types";

type Row = Record<string, unknown>;

function toProduct(r: Row): Product {
  return {
    ...(r as unknown as Product),
    features: JSON.parse(String(r.features || "[]")),
    sizes: JSON.parse(String(r.sizes || "[]")),
    is_published: !!r.is_published,
  };
}
function toModel(r: Row): Model {
  return { ...(r as unknown as Model), is_active: !!r.is_active };
}

// ---------- テナント ----------
export function getTenantBySlug(slug: string): Tenant | null {
  return (db().prepare("SELECT * FROM tenants WHERE slug = ?").get(slug) as unknown as Tenant) ?? null;
}
export function getTenant(id: string): Tenant | null {
  return (db().prepare("SELECT * FROM tenants WHERE id = ?").get(id) as unknown as Tenant) ?? null;
}
export function listTenants(): Tenant[] {
  return db().prepare("SELECT * FROM tenants ORDER BY created_at").all() as unknown as Tenant[];
}
export function createTenant(input: { slug: string; name: string; monthly_quota: number }): Tenant {
  const id = uid();
  const t = now();
  db()
    .prepare("INSERT INTO tenants (id, slug, name, monthly_quota, created_at, updated_at) VALUES (?,?,?,?,?,?)")
    .run(id, input.slug, input.name, input.monthly_quota, t, t);
  return getTenant(id)!;
}
export function updateTenant(id: string, input: Partial<Pick<Tenant, "name" | "status" | "monthly_quota" | "engine_id">>) {
  const cur = getTenant(id);
  if (!cur) return;
  const next = { ...cur, ...input };
  db()
    .prepare("UPDATE tenants SET name=?, status=?, monthly_quota=?, engine_id=?, updated_at=? WHERE id=?")
    .run(next.name, next.status, next.monthly_quota, next.engine_id, now(), id);
}

// ---------- ユーザー ----------
export function getUserByEmail(email: string): (User & { password_hash: string }) | null {
  return (
    (db().prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim()) as unknown as User & {
      password_hash: string;
    }) ?? null
  );
}
export function createUser(input: { tenant_id: string | null; email: string; password_hash: string; role: User["role"] }) {
  const t = now();
  const id = uid();
  db()
    .prepare("INSERT INTO users (id, tenant_id, email, password_hash, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, input.tenant_id, input.email.toLowerCase().trim(), input.password_hash, input.role, t, t);
  return id;
}
export function listUsers(tenantId: string): User[] {
  return db()
    .prepare("SELECT id, tenant_id, email, role FROM users WHERE tenant_id = ? ORDER BY created_at")
    .all(tenantId) as unknown as User[];
}

// ---------- 商品 ----------
export function listProducts(tenantId: string, opts: { publishedOnly?: boolean; category?: Category } = {}): Product[] {
  const where = ["tenant_id = ?"];
  const args: (string | number)[] = [tenantId];
  if (opts.publishedOnly) where.push("is_published = 1");
  if (opts.category) {
    where.push("category = ?");
    args.push(opts.category);
  }
  return (
    db()
      .prepare(`SELECT * FROM products WHERE ${where.join(" AND ")} ORDER BY category, sort_order, created_at`)
      .all(...args) as Row[]
  ).map(toProduct);
}
export function getProduct(tenantId: string, id: string): Product | null {
  const r = db().prepare("SELECT * FROM products WHERE tenant_id = ? AND id = ?").get(tenantId, id) as Row | undefined;
  return r ? toProduct(r) : null;
}

export type ProductInput = Omit<Product, "id" | "tenant_id" | "image_key" | "sort_order"> & {
  image_key?: string | null;
  sort_order?: number;
};

export function createProduct(tenantId: string, p: ProductInput): string {
  const id = uid();
  const t = now();
  // 並び順の指定が無ければ末尾に追加する
  const order =
    p.sort_order ??
    (db().prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM products WHERE tenant_id = ?").get(tenantId) as { n: number }).n;
  db()
    .prepare(
      `INSERT INTO products (id, tenant_id, external_code, name, category, style, tagline, description, features, color_name, color_hex,
        fit, material, care, sizes, price_jpy, product_url, image_key, is_published, sort_order, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id, tenantId, p.external_code, p.name, p.category, p.style, p.tagline, p.description, JSON.stringify(p.features),
      p.color_name, p.color_hex, p.fit, p.material, p.care, JSON.stringify(p.sizes), p.price_jpy, p.product_url,
      p.image_key ?? null, p.is_published ? 1 : 0, order, t, t,
    );
  return id;
}

export function updateProduct(tenantId: string, id: string, p: ProductInput) {
  db()
    .prepare(
      `UPDATE products SET external_code=?, name=?, category=?, style=?, tagline=?, description=?, features=?, color_name=?, color_hex=?,
        fit=?, material=?, care=?, sizes=?, price_jpy=?, product_url=?, image_key=COALESCE(?, image_key), is_published=?, updated_at=?
       WHERE tenant_id=? AND id=?`,
    )
    .run(
      p.external_code, p.name, p.category, p.style, p.tagline, p.description, JSON.stringify(p.features), p.color_name,
      p.color_hex, p.fit, p.material, p.care, JSON.stringify(p.sizes), p.price_jpy, p.product_url, p.image_key ?? null,
      p.is_published ? 1 : 0, now(), tenantId, id,
    );
}

export function setProductPublished(tenantId: string, id: string, published: boolean) {
  db()
    .prepare("UPDATE products SET is_published=?, updated_at=? WHERE tenant_id=? AND id=?")
    .run(published ? 1 : 0, now(), tenantId, id);
}

/** 商品やモデルの内容が変わったら、古い組み合わせ画像を捨てて作り直せるようにする */
export function deleteLooksFor(tenantId: string, ref: { productId?: string; modelId?: string }) {
  if (ref.productId)
    db().prepare("DELETE FROM looks WHERE tenant_id=? AND (outer_id=? OR bottom_id=?)").run(tenantId, ref.productId, ref.productId);
  if (ref.modelId) db().prepare("DELETE FROM looks WHERE tenant_id=? AND model_id=?").run(tenantId, ref.modelId);
}

export function deleteProduct(tenantId: string, id: string) {
  db().prepare("DELETE FROM looks WHERE tenant_id=? AND (outer_id=? OR bottom_id=?)").run(tenantId, id, id);
  db().prepare("DELETE FROM products WHERE tenant_id=? AND id=?").run(tenantId, id);
}

// ---------- AIモデル ----------
export function listModels(tenantId: string, opts: { activeOnly?: boolean } = {}): Model[] {
  return (
    db()
      .prepare(
        `SELECT * FROM models WHERE tenant_id = ? ${opts.activeOnly ? "AND is_active = 1" : ""} ORDER BY sort_order, created_at`,
      )
      .all(tenantId) as Row[]
  ).map(toModel);
}
export function getModel(tenantId: string, id: string): Model | null {
  const r = db().prepare("SELECT * FROM models WHERE tenant_id = ? AND id = ?").get(tenantId, id) as Row | undefined;
  return r ? toModel(r) : null;
}
export type ModelInput = Omit<Model, "id" | "tenant_id" | "image_key" | "sort_order"> & { image_key?: string | null; sort_order?: number };
export function createModel(tenantId: string, m: ModelInput): string {
  const id = uid();
  const t = now();
  db()
    .prepare(
      `INSERT INTO models (id, tenant_id, name, height_cm, size_worn, body_type, skin_hex, hair_hex, hair_style, image_key, is_active, sort_order, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, tenantId, m.name, m.height_cm, m.size_worn, m.body_type, m.skin_hex, m.hair_hex, m.hair_style, m.image_key ?? null,
      m.is_active ? 1 : 0, m.sort_order ?? 0, t, t);
  return id;
}
export function updateModel(tenantId: string, id: string, m: ModelInput) {
  db()
    .prepare(
      `UPDATE models SET name=?, height_cm=?, size_worn=?, body_type=?, skin_hex=?, hair_hex=?, hair_style=?, image_key=COALESCE(?, image_key),
        is_active=?, updated_at=? WHERE tenant_id=? AND id=?`,
    )
    .run(m.name, m.height_cm, m.size_worn, m.body_type, m.skin_hex, m.hair_hex, m.hair_style, m.image_key ?? null,
      m.is_active ? 1 : 0, now(), tenantId, id);
}

// ---------- 組み合わせ画像（ルック） ----------
export function comboKey(modelId: string, outerId: string | null, bottomId: string | null): string {
  return `${modelId}|${outerId ?? "-"}|${bottomId ?? "-"}`;
}
export function listLooks(tenantId: string): Look[] {
  return db().prepare("SELECT * FROM looks WHERE tenant_id = ?").all(tenantId) as unknown as Look[];
}
export function getLook(tenantId: string, id: string): Look | null {
  return (db().prepare("SELECT * FROM looks WHERE tenant_id = ? AND id = ?").get(tenantId, id) as unknown as Look) ?? null;
}
export function getLookByCombo(tenantId: string, key: string): Look | null {
  return (
    (db().prepare("SELECT * FROM looks WHERE tenant_id = ? AND combo_key = ?").get(tenantId, key) as unknown as Look) ?? null
  );
}
/** 組み合わせを「生成待ち」にする。既にあれば何もしない（force なら作り直し）。戻り値は look id */
export function upsertQueuedLook(
  tenantId: string,
  modelId: string,
  outerId: string | null,
  bottomId: string | null,
  source: Look["source"],
  force = false,
): { id: string; created: boolean } {
  const key = comboKey(modelId, outerId, bottomId);
  const existing = getLookByCombo(tenantId, key);
  const t = now();
  if (existing) {
    const retry = existing.status === "failed";
    if (force || retry) {
      db()
        .prepare("UPDATE looks SET status='queued', error_code=NULL, attempts=0, updated_at=? WHERE id=?")
        .run(t, existing.id);
      return { id: existing.id, created: true };
    }
    return { id: existing.id, created: false };
  }
  const id = uid();
  db()
    .prepare(
      `INSERT INTO looks (id, tenant_id, model_id, outer_id, bottom_id, combo_key, status, source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,'queued',?,?,?)`,
    )
    .run(id, tenantId, modelId, outerId, bottomId, key, source, t, t);
  return { id, created: true };
}
export function claimNextQueuedLook(): Look | null {
  const row = db().prepare("SELECT * FROM looks WHERE status='queued' ORDER BY source DESC, created_at LIMIT 1").get() as
    | Look
    | undefined;
  if (!row) return null;
  const res = db()
    .prepare("UPDATE looks SET status='running', attempts=attempts+1, updated_at=? WHERE id=? AND status='queued'")
    .run(now(), row.id);
  return res.changes ? { ...row, status: "running", attempts: row.attempts + 1 } : claimNextQueuedLook();
}
export function finishLook(id: string, r: { image_key: string; engine_id: string; latency_ms: number }) {
  const t = now();
  db()
    .prepare("UPDATE looks SET status='ready', image_key=?, engine_id=?, latency_ms=?, error_code=NULL, generated_at=?, updated_at=? WHERE id=?")
    .run(r.image_key, r.engine_id, r.latency_ms, t, t, id);
  // 生成枚数は画像を消しても減らないよう、別の集計表に積み上げる（上限・原価の集計元）
  db()
    .prepare(
      `INSERT INTO usage_monthly (tenant_id, month, generated) SELECT tenant_id, ?, 1 FROM looks WHERE id=?
       ON CONFLICT(tenant_id, month) DO UPDATE SET generated = generated + 1`,
    )
    .run(t.slice(0, 7), id);
}
export function failLook(id: string, code: string, engineId: string | null) {
  db().prepare("UPDATE looks SET status='failed', error_code=?, engine_id=?, updated_at=? WHERE id=?").run(code, engineId, now(), id);
}
export function requeueLook(id: string) {
  db().prepare("UPDATE looks SET status='queued', updated_at=? WHERE id=?").run(now(), id);
}
/** 再起動で running のまま残ったものを戻す */
export function resetStuckLooks() {
  db().prepare("UPDATE looks SET status='queued' WHERE status='running'").run();
}
export function countGeneratedThisMonth(tenantId: string): number {
  const r = db()
    .prepare("SELECT generated FROM usage_monthly WHERE tenant_id=? AND month=?")
    .get(tenantId, now().slice(0, 7)) as { generated: number } | undefined;
  return r?.generated ?? 0;
}

// ---------- 計測イベント ----------
export function recordEvent(e: { tenant_id: string; session_id: string | null; type: EventType; product_id?: string | null; look_id?: string | null }) {
  db()
    .prepare("INSERT INTO events (id, tenant_id, session_id, type, product_id, look_id, occurred_at) VALUES (?,?,?,?,?,?,?)")
    .run(uid(), e.tenant_id, e.session_id, e.type, e.product_id ?? null, e.look_id ?? null, now());
}

export function eventCounts(tenantId: string, sinceIso: string): Record<string, number> {
  const rows = db()
    .prepare("SELECT type, COUNT(*) AS n FROM events WHERE tenant_id=? AND occurred_at >= ? GROUP BY type")
    .all(tenantId, sinceIso) as { type: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.type, r.n]));
}

export function dailyEventCounts(tenantId: string, sinceIso: string): { day: string; type: string; n: number }[] {
  return db()
    .prepare(
      `SELECT substr(occurred_at, 1, 10) AS day, type, COUNT(*) AS n FROM events
       WHERE tenant_id=? AND occurred_at >= ? GROUP BY day, type ORDER BY day`,
    )
    .all(tenantId, sinceIso) as { day: string; type: string; n: number }[];
}

export function productEventCounts(tenantId: string, sinceIso: string) {
  return db()
    .prepare(
      `SELECT p.id, p.name, p.category,
        SUM(CASE WHEN e.type='product_select' THEN 1 ELSE 0 END) AS selects,
        SUM(CASE WHEN e.type='detail_open' THEN 1 ELSE 0 END) AS details,
        SUM(CASE WHEN e.type='product_link' THEN 1 ELSE 0 END) AS links,
        SUM(CASE WHEN e.type='add_to_cart' THEN 1 ELSE 0 END) AS carts
       FROM products p LEFT JOIN events e ON e.product_id = p.id AND e.occurred_at >= ? AND e.tenant_id = p.tenant_id
       WHERE p.tenant_id = ? GROUP BY p.id ORDER BY selects DESC, p.name`,
    )
    .all(sinceIso, tenantId) as { id: string; name: string; category: string; selects: number; details: number; links: number; carts: number }[];
}
