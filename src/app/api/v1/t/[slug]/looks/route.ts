import { NextResponse } from "next/server";
import { activeTenant, clientIp, jsonError, rateLimited, toPublicLook } from "@/lib/public-api";
import { requestLook } from "@/lib/generation";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";

/**
 * 未生成の組み合わせを生成待ちにする（オンデマンド生成）。
 * body: { model_id, outer_id|null, bottom_id }
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const tenant = activeTenant(slug);
  if (!tenant) return jsonError(404, "TENANT_NOT_FOUND", "試着室が見つかりません");
  if (rateLimited(`look:${tenant.id}:${clientIp(req)}`, 30, 60_000)) {
    return jsonError(429, "RATE_LIMITED", "少し時間を置いてください");
  }
  const body = (await req.json().catch(() => null)) as { model_id?: string; outer_id?: string | null; bottom_id?: string | null } | null;
  if (!body?.model_id || !body.bottom_id) return jsonError(400, "BAD_REQUEST", "model_id と bottom_id は必須です");

  const model = repo.getModel(tenant.id, body.model_id);
  const outer = body.outer_id ? repo.getProduct(tenant.id, body.outer_id) : null;
  const bottoms = repo.getProduct(tenant.id, body.bottom_id);
  const valid =
    model?.is_active &&
    bottoms?.is_published && bottoms.category === "bottoms" &&
    (!body.outer_id || (outer?.is_published && outer.category === "outer"));
  if (!valid) return jsonError(404, "PRODUCT_UNAVAILABLE", "商品が見つかりません");

  const look = requestLook(tenant.id, model.id, outer?.id ?? null, bottoms.id);
  if (!look) return jsonError(500, "ENGINE_ERROR", "もう一度お試しください");
  return NextResponse.json(toPublicLook(look), { status: look.status === "ready" ? 200 : 202 });
}
