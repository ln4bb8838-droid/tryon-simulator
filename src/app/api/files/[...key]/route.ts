import { contentTypeFor, getObject } from "@/lib/storage";

export const runtime = "nodejs";

// 商品画像・モデル画像・組み合わせ画像を返す。
// SVG を直接開かれてもスクリプトが動かないよう、CSP の sandbox を付ける。
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const k = key.join("/");
  if (!k.startsWith("tenants/")) return new Response("not found", { status: 404 });
  let body: Buffer | null = null;
  try {
    body = getObject(k);
  } catch {
    body = null;
  }
  if (!body) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": contentTypeFor(k),
      // ファイル名に生成時刻が入るので、同じURLの中身は変わらない
      "Cache-Control": k.includes("/looks/") ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
