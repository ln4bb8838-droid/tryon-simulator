// 初回起動時のデモデータ。テナントが1件も無いときだけ投入する。

import type { Db } from "./db";
import { hashPassword } from "./password";
import { putObject } from "./storage";
import { renderGarmentSvg, renderModelSvg } from "./engines/mock-art";
import * as repo from "./repo";
import type { ModelInput, ProductInput } from "./repo";
import * as generation from "./generation";

export const DEMO_TENANT_SLUG = "demo";
export const DEMO_ADMIN_EMAIL = "shop@example.com";
export const DEMO_OPERATOR_EMAIL = "operator@example.com";

export function demoPassword(): string {
  return process.env.ADMIN_PASSWORD || "demo1234";
}

const MODELS: ModelInput[] = [
  { name: "Ren", height_cm: 180, size_worn: "M", body_type: "standard", skin_hex: "#e6c09c", hair_hex: "#231a14", hair_style: "short", is_active: true },
  { name: "Aoi", height_cm: 165, size_worn: "S", body_type: "slim", skin_hex: "#d9a982", hair_hex: "#3a2a1c", hair_style: "long", is_active: true },
];

const base = { sizes: ["S", "M", "L", "XL"], is_published: true, product_url: "https://example.com/products/" };

const PRODUCTS: ProductInput[] = [
  {
    ...base, external_code: "OT-001", name: "ウールブレンド テーラードジャケット", category: "outer", style: "jacket",
    tagline: "きれいめにもカジュアルにも合わせやすい定番の一着",
    description: "ほどよい肩幅と短めの着丈で、パンツを選ばずに合わせられるテーラードジャケットです。",
    features: ["裏地付きで滑りがよい", "内ポケット2つ", "家庭で手洗い可能"],
    color_name: "ブラウン", color_hex: "#6b5b45", fit: "レギュラー", material: "ウール60% ポリエステル40%",
    care: "手洗い（30℃以下）、ドライクリーニング可", price_jpy: 19800,
  },
  {
    ...base, external_code: "OT-002", name: "ロングチェスターコート", category: "outer", style: "coat",
    tagline: "膝下まで伸びるシルエットで縦のラインを強調",
    description: "ベルト付きで前を閉じても開けても着られるロング丈のチェスターコートです。",
    features: ["取り外し可能なベルト", "撥水加工", "背中にベンツ"],
    color_name: "ベージュ", color_hex: "#c8b08a", fit: "ゆったり", material: "ポリエステル70% ウール30%",
    care: "ドライクリーニング", price_jpy: 29800,
  },
  {
    ...base, external_code: "OT-003", name: "ナイロン ショートブルゾン", category: "outer", style: "blouson",
    tagline: "軽くて動きやすい、春秋の羽織り",
    description: "裾と袖口にリブを付けた短丈のブルゾン。ワイドなパンツとのバランスが取りやすい丈です。",
    features: ["軽量ナイロン", "前開きはダブルジップ", "洗濯機で洗える"],
    color_name: "オリーブ", color_hex: "#4e5e3f", fit: "ややゆったり", material: "ナイロン100%",
    care: "洗濯機（ネット使用）", price_jpy: 14800,
  },
  {
    ...base, external_code: "OT-004", name: "コットンツイル ワークジャケット", category: "outer", style: "jacket",
    tagline: "着込むほど風合いが増すツイル素材",
    description: "丈夫なコットンツイルを使った、ポケット多めのワークジャケットです。",
    features: ["胸と腰に計4ポケット", "やや短めの着丈"],
    color_name: "ネイビー", color_hex: "#2c3a52", fit: "レギュラー", material: "綿100%",
    care: "洗濯機可、乾燥機不可", price_jpy: 16500,
  },
  {
    ...base, external_code: "PT-001", name: "セミワイド ストレートデニム", category: "bottoms", style: "straight",
    tagline: "どんなアウターにも合う、ほどよい太さ",
    description: "腰回りに少しゆとりを持たせたストレートシルエットのデニムです。",
    features: ["ストレッチ入り", "裾上げ無料"],
    color_name: "インディゴ", color_hex: "#33476b", fit: "ストレート", material: "綿98% ポリウレタン2%",
    care: "裏返して洗濯機、色移りに注意", price_jpy: 9900,
  },
  {
    ...base, external_code: "PT-002", name: "ウールライク ワイドスラックス", category: "bottoms", style: "wide",
    tagline: "落ち感のある生地できれいめに",
    description: "センタープレス入りのワイドスラックス。ロングコートと合わせると縦長の印象になります。",
    features: ["センタープレス", "ウエスト後ろゴム"],
    color_name: "ブラック", color_hex: "#232326", fit: "ワイド", material: "ポリエステル100%",
    care: "洗濯機（ネット使用）", price_jpy: 8900,
  },
  {
    ...base, external_code: "PT-003", name: "テーパード チノパンツ", category: "bottoms", style: "slim",
    tagline: "裾に向かって細くなるすっきりシルエット",
    description: "足首に向かって細くなるテーパードのチノ。短丈のブルゾンと好相性です。",
    features: ["ストレッチ入り", "シワになりにくい"],
    color_name: "アイボリー", color_hex: "#ddd5c4", fit: "テーパード", material: "綿97% ポリウレタン3%",
    care: "洗濯機可", price_jpy: 7900,
  },
  {
    ...base, external_code: "PT-004", name: "リネンブレンド ショーツ", category: "bottoms", style: "shorts",
    tagline: "膝上丈の涼しいショーツ",
    description: "リネン混の軽い生地を使ったショーツ。夏のワンマイルウェアに。",
    features: ["ウエストゴム＋紐", "ポケット4つ"],
    color_name: "カーキ", color_hex: "#8a7f5e", fit: "レギュラー", material: "リネン55% 綿45%",
    care: "洗濯機可", price_jpy: 5900, is_published: false,
  },
];

export function ensureSeed(conn: Db) {
  const row = conn.prepare("SELECT COUNT(*) AS n FROM tenants").get() as { n: number };
  if (row.n > 0) return;
  const tenant = repo.createTenant({ slug: DEMO_TENANT_SLUG, name: "デモアパレル", monthly_quota: 500 });
  const pw = hashPassword(demoPassword());
  repo.createUser({ tenant_id: null, email: DEMO_OPERATOR_EMAIL, password_hash: pw, role: "system_admin" });
  repo.createUser({ tenant_id: tenant.id, email: DEMO_ADMIN_EMAIL, password_hash: pw, role: "tenant_admin" });

  MODELS.forEach((m, i) => {
    const key = `tenants/${tenant.id}/models/demo-${i + 1}.svg`;
    putObject(key, renderModelSvg(m));
    repo.createModel(tenant.id, { ...m, image_key: key, sort_order: i });
  });
  PRODUCTS.forEach((p, i) => {
    const key = `tenants/${tenant.id}/products/${p.external_code}.svg`;
    putObject(key, renderGarmentSvg(p));
    repo.createProduct(tenant.id, { ...p, product_url: p.product_url + p.external_code, image_key: key, sort_order: i });
  });
  // デモはすぐ触れるように、全組み合わせを生成しておく
  setTimeout(() => generation.pregenerateAll(tenant.id), 0);
  conn.exec(`PRAGMA user_version = ${ART_VERSION}`);
}

/** 仮エンジンの描画を変えたときの版数。上がると、手元の仮画像を自動で描き直す */
export const ART_VERSION = 2;

/**
 * 既存データの仮画像（SVG）を新しい描画で作り直す。
 * 実物の写真（PNG/JPEG/WebP）や、本物のエンジンで作った画像には触らない。
 */
export function migrateArt(conn: Db) {
  const { user_version } = conn.prepare("PRAGMA user_version").get() as { user_version: number };
  if (user_version >= ART_VERSION) return;
  const stamp = Date.now();
  for (const t of repo.listTenants()) {
    for (const p of repo.listProducts(t.id)) {
      if (!p.image_key?.endsWith(".svg")) continue;
      const key = `tenants/${t.id}/products/${p.id}-${stamp}.svg`;
      putObject(key, renderGarmentSvg(p));
      conn.prepare("UPDATE products SET image_key=? WHERE id=?").run(key, p.id);
    }
    for (const m of repo.listModels(t.id)) {
      if (!m.image_key?.endsWith(".svg")) continue;
      const key = `tenants/${t.id}/models/${m.id}-${stamp}.svg`;
      putObject(key, renderModelSvg(m));
      conn.prepare("UPDATE models SET image_key=? WHERE id=?").run(key, m.id);
    }
    conn.prepare("DELETE FROM looks WHERE tenant_id=? AND image_key LIKE '%.svg'").run(t.id);
    setTimeout(() => generation.pregenerateAll(t.id), 0);
  }
  conn.exec(`PRAGMA user_version = ${ART_VERSION}`);
}
