import { NextResponse } from "next/server";
import { activeTenant, jsonError, toPublicLook } from "@/lib/public-api";
import { kickWorker } from "@/lib/generation";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 組み合わせ画像の生成状態（試着室が生成待ちの間ポーリングする） */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  const tenant = activeTenant(slug);
  if (!tenant) return jsonError(404, "TENANT_NOT_FOUND", "試着室が見つかりません");
  const look = repo.getLook(tenant.id, id);
  if (!look) return jsonError(404, "NOT_FOUND", "見つかりません");
  if (look.status === "queued") kickWorker();
  return NextResponse.json(toPublicLook(look));
}
