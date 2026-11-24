import { activeTenant, clientIp, jsonError, rateLimited } from "@/lib/public-api";
import * as repo from "@/lib/repo";
import { EVENT_TYPES, type EventType } from "@/lib/types";

export const runtime = "nodejs";

/** 試着室での操作を記録する（利用状況の集計元）。個人を特定する情報は受け取らない。 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const tenant = activeTenant(slug);
  if (!tenant) return jsonError(404, "TENANT_NOT_FOUND", "試着室が見つかりません");
  if (rateLimited(`ev:${tenant.id}:${clientIp(req)}`, 120, 60_000)) return new Response(null, { status: 204 });

  const body = (await req.json().catch(() => null)) as
    | { type?: string; session_id?: string; product_id?: string; look_id?: string }
    | null;
  if (!body?.type || !EVENT_TYPES.includes(body.type as EventType)) return jsonError(400, "BAD_REQUEST", "type が不正です");
  const productId = body.product_id && repo.getProduct(tenant.id, body.product_id) ? body.product_id : null;
  const lookId = body.look_id && repo.getLook(tenant.id, body.look_id) ? body.look_id : null;
  const sessionId = typeof body.session_id === "string" ? body.session_id.slice(0, 64) : null;
  repo.recordEvent({ tenant_id: tenant.id, session_id: sessionId, type: body.type as EventType, product_id: productId, look_id: lookId });
  return new Response(null, { status: 204 });
}
