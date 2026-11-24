"use server";

// 管理画面の操作（フォーム送信）。どの操作も最初にログインとテナントを確認する。

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { login, logout, requireAdmin, requireSystemAdmin } from "@/lib/auth";
import * as repo from "@/lib/repo";
import { pregenerateAll } from "@/lib/generation";
import { putObject } from "@/lib/storage";
import { renderGarmentSvg, renderModelSvg } from "@/lib/engines/mock-art";
import { hashPassword } from "@/lib/password";
import { ENGINES } from "@/lib/engines";
import { BOTTOM_STYLES, OUTER_STYLES, type Category } from "@/lib/types";

const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);
const int = (f: FormData, k: string, def = 0) => {
  const n = Number.parseInt(String(f.get(k) ?? ""), 10);
  return Number.isFinite(n) ? n : def;
};
const hex = (f: FormData, k: string, def: string) => {
  const v = str(f, k, 7);
  return /^#[0-9a-f]{6}$/i.test(v) ? v : def;
};
const lines = (f: FormData, k: string) =>
  str(f, k, 2000)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

const MAX_UPLOAD = 5 * 1024 * 1024;

/** アップロード画像を検査して保存する。PNG/JPEG/WebPのみ（SVGは受け付けない） */
async function saveUpload(file: FormDataEntryValue | null, keyBase: string): Promise<string | null | "invalid"> {
  if (!file || typeof file === "string" || file.size === 0) return null;
  if (file.size > MAX_UPLOAD) return "invalid";
  const buf = Buffer.from(await file.arrayBuffer());
  let ext: string | null = null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ext = "png";
  else if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ext = "jpg";
  else if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") ext = "webp";
  if (!ext) return "invalid";
  const key = `${keyBase}-${Date.now()}.${ext}`;
  putObject(key, buf);
  return key;
}

function safeHttpUrl(u: string): string {
  if (!u) return "";
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

// ---------- ログイン ----------
export async function loginAction(form: FormData) {
  const ok = await login(str(form, "email", 200), String(form.get("password") ?? ""));
  if (!ok) redirect("/admin/login?error=1");
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

// ---------- 商品 ----------
export async function saveProductAction(form: FormData) {
  const { tenant } = await requireAdmin();
  const id = str(form, "id", 64);
  const category = (str(form, "category") === "outer" ? "outer" : "bottoms") as Category;
  const styles: readonly string[] = category === "outer" ? OUTER_STYLES : BOTTOM_STYLES;
  const style = styles.includes(str(form, "style")) ? str(form, "style") : styles[0];
  const sizes = str(form, "sizes", 100)
    .split(/[,、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
  const input: repo.ProductInput = {
    external_code: str(form, "external_code", 64),
    name: str(form, "name", 120),
    category,
    style,
    tagline: str(form, "tagline", 200),
    description: str(form, "description", 2000),
    features: lines(form, "features"),
    color_name: str(form, "color_name", 40),
    color_hex: hex(form, "color_hex", "#888888"),
    fit: str(form, "fit", 60),
    material: str(form, "material", 200),
    care: str(form, "care", 200),
    sizes: sizes.length ? sizes : ["S", "M", "L", "XL"],
    price_jpy: Math.max(0, int(form, "price_jpy")),
    product_url: safeHttpUrl(str(form, "product_url", 500)),
    is_published: form.get("is_published") === "on",
  };
  const back = id ? `/admin/products/${id}` : "/admin/products/new";
  if (!input.external_code || !input.name) redirect(`${back}?error=required`);

  const uploaded = await saveUpload(form.get("image"), `tenants/${tenant.id}/products/${input.external_code.replace(/[^a-z0-9_-]/gi, "_")}`);
  if (uploaded === "invalid") redirect(`${back}?error=image`);

  let productId = id;
  try {
    if (id) {
      if (!repo.getProduct(tenant.id, id)) redirect("/admin/products");
      repo.updateProduct(tenant.id, id, { ...input, image_key: uploaded });
      repo.deleteLooksFor(tenant.id, { productId: id });
    } else {
      productId = repo.createProduct(tenant.id, { ...input, image_key: uploaded });
    }
  } catch (e) {
    if (String(e).includes("UNIQUE")) redirect(`${back}?error=duplicate`);
    throw e;
  }
  // 画像が無い商品は、仮エンジン用の平置き風画像を自動で用意する
  const saved = repo.getProduct(tenant.id, productId)!;
  if (!saved.image_key || (saved.image_key.endsWith(".svg") && !uploaded)) {
    const key = `tenants/${tenant.id}/products/${productId}-${Date.now()}.svg`;
    putObject(key, renderGarmentSvg(saved));
    repo.updateProduct(tenant.id, productId, { ...input, image_key: key });
  }
  revalidatePath("/admin/products");
  redirect(`/admin/products?saved=1`);
}

export async function togglePublishAction(form: FormData) {
  const { tenant } = await requireAdmin();
  const id = str(form, "id", 64);
  const p = repo.getProduct(tenant.id, id);
  if (p) repo.setProductPublished(tenant.id, id, !p.is_published);
  revalidatePath("/admin/products");
}

export async function deleteProductAction(form: FormData) {
  const { tenant } = await requireAdmin();
  repo.deleteProduct(tenant.id, str(form, "id", 64));
  revalidatePath("/admin/products");
  redirect("/admin/products");
}

// ---------- AIモデル ----------
export async function saveModelAction(form: FormData) {
  const { tenant } = await requireAdmin();
  const id = str(form, "id", 64);
  const bodyType = ["slim", "standard", "broad"].includes(str(form, "body_type")) ? str(form, "body_type") : "standard";
  const hairStyle = ["short", "long", "bun"].includes(str(form, "hair_style")) ? str(form, "hair_style") : "short";
  const input: repo.ModelInput = {
    name: str(form, "name", 40) || "モデル",
    height_cm: Math.min(200, Math.max(140, int(form, "height_cm", 170))),
    size_worn: str(form, "size_worn", 8) || "M",
    body_type: bodyType as repo.ModelInput["body_type"],
    skin_hex: hex(form, "skin_hex", "#e6c09c"),
    hair_hex: hex(form, "hair_hex", "#231a14"),
    hair_style: hairStyle as repo.ModelInput["hair_style"],
    is_active: form.get("is_active") === "on",
  };
  if (form.get("consent") !== "on") redirect(`/admin/models?error=consent`);
  const uploaded = await saveUpload(form.get("image"), `tenants/${tenant.id}/models/${id || "new"}`);
  if (uploaded === "invalid") redirect(`/admin/models?error=image`);
  let modelId = id;
  if (id) {
    if (!repo.getModel(tenant.id, id)) redirect("/admin/models");
    repo.updateModel(tenant.id, id, { ...input, image_key: uploaded });
    repo.deleteLooksFor(tenant.id, { modelId: id });
  } else modelId = repo.createModel(tenant.id, { ...input, image_key: uploaded });
  const saved = repo.getModel(tenant.id, modelId)!;
  if (!uploaded && (!saved.image_key || saved.image_key.endsWith(".svg"))) {
    const key = `tenants/${tenant.id}/models/${modelId}-${Date.now()}.svg`;
    putObject(key, renderModelSvg(saved));
    repo.updateModel(tenant.id, modelId, { ...input, image_key: key });
  }
  revalidatePath("/admin/models");
  redirect("/admin/models?saved=1");
}

// ---------- 組み合わせ画像 ----------
export async function pregenerateAction(form: FormData) {
  const { tenant } = await requireAdmin();
  const n = pregenerateAll(tenant.id, { force: form.get("force") === "1" });
  revalidatePath("/admin/looks");
  redirect(`/admin/looks?queued=${n}`);
}

// ---------- 運営者向け ----------
export async function createTenantAction(form: FormData) {
  await requireSystemAdmin();
  const slug = str(form, "slug", 40).toLowerCase();
  const name = str(form, "name", 80);
  const email = str(form, "email", 200);
  const password = String(form.get("password") ?? "");
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug) || !name || !email || password.length < 8) {
    redirect("/admin/system?error=input");
  }
  if (repo.getTenantBySlug(slug)) redirect("/admin/system?error=slug");
  if (repo.getUserByEmail(email)) redirect("/admin/system?error=email");
  const tenant = repo.createTenant({ slug, name, monthly_quota: Math.max(0, int(form, "monthly_quota", 500)) });
  repo.createUser({ tenant_id: tenant.id, email, password_hash: hashPassword(password), role: "tenant_admin" });
  revalidatePath("/admin/system");
  redirect("/admin/system?saved=1");
}

export async function updateTenantAction(form: FormData) {
  await requireSystemAdmin();
  const id = str(form, "id", 64);
  const engine = str(form, "engine_id", 40);
  repo.updateTenant(id, {
    status: str(form, "status") === "suspended" ? "suspended" : "active",
    monthly_quota: Math.max(0, int(form, "monthly_quota", 500)),
    engine_id: engine && engine in ENGINES ? engine : null,
  });
  revalidatePath("/admin/system");
  redirect("/admin/system?saved=1");
}

export async function switchTenantAction(form: FormData) {
  await requireSystemAdmin();
  const id = str(form, "id", 64);
  if (repo.getTenant(id)) (await cookies()).set("tryon_tenant", id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/admin");
}
