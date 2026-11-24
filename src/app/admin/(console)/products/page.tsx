import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import * as repo from "@/lib/repo";
import { fileUrl } from "@/lib/storage";
import { CATEGORY_LABEL, STYLE_LABEL } from "@/lib/types";
import { togglePublishAction } from "../../actions";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { tenant } = await requireAdmin();
  const { saved } = await searchParams;
  const products = repo.listProducts(tenant.id);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>商品</h1>
          <p className="lead" style={{ margin: 0 }}>
            公開にした商品だけが試着室に並びます。公開を変えたら「組み合わせ画像」で事前生成してください。
          </p>
        </div>
        <Link className="btn primary" href="/admin/products/new">
          ＋ 商品を登録
        </Link>
      </div>
      {saved && <div className="notice">保存しました。</div>}
      <div className="card scroll-x">
        <table className="list">
          <thead>
            <tr>
              <th></th>
              <th>商品コード</th>
              <th>商品名</th>
              <th>種類</th>
              <th>カラー</th>
              <th className="num">価格</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.image_key ? <img className="thumb" src={fileUrl(p.image_key)!} alt="" /> : <span className="thumb" />}
                </td>
                <td>{p.external_code}</td>
                <td>{p.name}</td>
                <td>
                  {CATEGORY_LABEL[p.category]}・{STYLE_LABEL[p.style] ?? p.style}
                </td>
                <td>
                  <span className="swatch" style={{ background: p.color_hex }} /> {p.color_name}
                </td>
                <td className="num">¥{p.price_jpy.toLocaleString()}</td>
                <td>{p.is_published ? <span className="badge ok">公開中</span> : <span className="badge">非公開</span>}</td>
                <td>
                  <div className="row-actions">
                    <form action={togglePublishAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn small" type="submit">
                        {p.is_published ? "非公開にする" : "公開する"}
                      </button>
                    </form>
                    <Link className="btn small" href={`/admin/products/${p.id}`}>
                      編集
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  商品がまだありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
