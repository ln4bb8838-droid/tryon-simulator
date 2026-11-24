import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import * as repo from "@/lib/repo";

export default async function EmbedPage() {
  const { tenant } = await requireAdmin();
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origin = process.env.PUBLIC_BASE_URL || `${proto}://${host}`;
  const roomUrl = `${origin}/t/${tenant.slug}`;
  const sample = repo.listProducts(tenant.id, { publishedOnly: true, category: "outer" })[0];

  const iframe = `<iframe src="${roomUrl}" title="試着室" style="width:100%;height:860px;border:0" loading="lazy"></iframe>`;
  const listener = `<script>
  // 試着室で「カートに入れる」が押されたときの通知を受け取る
  window.addEventListener("message", function (e) {
    if (e.origin !== "${origin}") return;
    if (e.data && e.data.type === "tryon:add_to_cart") {
      // e.data.external_code（商品コード）と e.data.size を使って、お使いのECのカート追加処理を呼んでください
      console.log("カート追加", e.data.external_code, e.data.size);
    }
  });
</script>`;
  const productLink = sample
    ? `<a href="${roomUrl}?outer=${encodeURIComponent(sample.external_code)}" target="_blank">この商品を試着する</a>`
    : "";

  return (
    <>
      <h1>ECへの設置</h1>
      <p className="lead">試着室は「リンクで開く」か「ページに埋め込む」の2通りで設置できます。</p>

      <div className="card">
        <h2>1. 試着室のURL</h2>
        <p>
          <a href={roomUrl} target="_blank" rel="noopener">
            {roomUrl}
          </a>
        </p>
        <p className="muted">メニューやバナーからこのURLへリンクするだけで使えます。</p>
      </div>

      <div className="card">
        <h2>2. 商品ページから、その商品を着た状態で開く</h2>
        <p className="muted">
          URLの末尾に <code>?outer=商品コード</code> または <code>?bottoms=商品コード</code> を付けると、その商品を選んだ状態で開きます。
        </p>
        {productLink && <pre className="code">{productLink}</pre>}
      </div>

      <div className="card">
        <h2>3. ページに埋め込む（iframe）</h2>
        <pre className="code">{iframe}</pre>
        <p className="muted">「カートに入れる」を押すと、埋め込み先のページに次の通知が届きます。EC側のカート追加処理につないでください。</p>
        <pre className="code">{listener}</pre>
      </div>
    </>
  );
}
