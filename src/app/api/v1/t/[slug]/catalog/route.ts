import { NextResponse } from "next/server";
import { activeTenant, buildCatalog, jsonError } from "@/lib/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 試着室に必要なデータ（モデル、公開中の商品、生成済みの組み合わせ）を返す */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const tenant = activeTenant(slug);
  if (!tenant) return jsonError(404, "TENANT_NOT_FOUND", "試着室が見つかりません");
  return NextResponse.json(buildCatalog(tenant));
}
