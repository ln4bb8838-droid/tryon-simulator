// 試着室（公開側）で使うデータの組み立てと、簡易レート制限。

import { NextResponse } from "next/server";
import * as repo from "./repo";
import { fileUrl } from "./storage";
import type { Look, Model, Product, Tenant } from "./types";

export interface PublicProduct {
  id: string;
  external_code: string;
  name: string;
  category: Product["category"];
  tagline: string;
  description: string;
  features: string[];
  color_name: string;
  color_hex: string;
  fit: string;
  material: string;
  care: string;
  sizes: string[];
  price_jpy: number;
  product_url: string;
  image_url: string | null;
}

export interface PublicModel {
  id: string;
  name: string;
  height_cm: number;
  size_worn: string;
  image_url: string | null;
}

export interface PublicLook {
  id: string;
  combo_key: string;
  status: Look["status"];
  image_url: string | null;
  error_code: string | null;
}

export interface Catalog {
  tenant: { slug: string; name: string };
  models: PublicModel[];
  outers: PublicProduct[];
  bottoms: PublicProduct[];
  looks: Record<string, PublicLook>;
}

export function toPublicProduct(p: Product): PublicProduct {
  return {
    id: p.id, external_code: p.external_code, name: p.name, category: p.category, tagline: p.tagline,
    description: p.description, features: p.features, color_name: p.color_name, color_hex: p.color_hex, fit: p.fit,
    material: p.material, care: p.care, sizes: p.sizes, price_jpy: p.price_jpy, product_url: safeUrl(p.product_url),
    image_url: fileUrl(p.image_key),
  };
}

/** javascript: などを弾き、http(s) のURLだけを通す */
export function safeUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function toPublicModel(m: Model): PublicModel {
  return { id: m.id, name: m.name, height_cm: m.height_cm, size_worn: m.size_worn, image_url: fileUrl(m.image_key) };
}

export function toPublicLook(l: Look): PublicLook {
  return { id: l.id, combo_key: l.combo_key, status: l.status, image_url: fileUrl(l.image_key), error_code: l.error_code };
}

export function activeTenant(slug: string): Tenant | null {
  const t = repo.getTenantBySlug(slug);
  return t && t.status === "active" ? t : null;
}

export function buildCatalog(tenant: Tenant): Catalog {
  const products = repo.listProducts(tenant.id, { publishedOnly: true });
  const ids = new Set(products.map((p) => p.id));
  const models = repo.listModels(tenant.id, { activeOnly: true });
  const modelIds = new Set(models.map((m) => m.id));
  const looks: Record<string, PublicLook> = {};
  for (const l of repo.listLooks(tenant.id)) {
    if (l.status !== "ready") continue;
    if (!modelIds.has(l.model_id)) continue;
    if ((l.outer_id && !ids.has(l.outer_id)) || (l.bottom_id && !ids.has(l.bottom_id))) continue;
    looks[l.combo_key] = toPublicLook(l);
  }
  return {
    tenant: { slug: tenant.slug, name: tenant.name },
    models: models.map(toPublicModel),
    outers: products.filter((p) => p.category === "outer").map(toPublicProduct),
    bottoms: products.filter((p) => p.category === "bottoms").map(toPublicProduct),
    looks,
  };
}

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// ---- 簡易レート制限（1プロセス内のメモリ。複数台構成ではRedis等に移す） ----
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const t = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < t) {
    buckets.set(key, { count: 1, reset: t + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset < t) buckets.delete(k);
    return false;
  }
  b.count++;
  return b.count > limit;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
