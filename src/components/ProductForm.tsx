import Link from "next/link";
import { saveProductAction, deleteProductAction } from "@/app/admin/actions";
import { fileUrl } from "@/lib/storage";
import { BOTTOM_STYLES, OUTER_STYLES, STYLE_LABEL, type Product } from "@/lib/types";

const ERRORS: Record<string, string> = {
  required: "商品コードと商品名は必須です。",
  image: "画像はPNG・JPEG・WebP（5MBまで）にしてください。",
  duplicate: "同じ商品コードの商品が既にあります。",
};

export default function ProductForm({ product, error }: { product?: Product; error?: string }) {
  const p = product;
  return (
    <>
      {error && <div className="alert">{ERRORS[error] ?? "保存できませんでした。"}</div>}
      <form action={saveProductAction} className="form card">
        {p && <input type="hidden" name="id" value={p.id} />}
        <div className="grid2">
          <label>
            商品コード（EC側の品番）
            <input type="text" name="external_code" required defaultValue={p?.external_code} maxLength={64} />
          </label>
          <label>
            商品名
            <input type="text" name="name" required defaultValue={p?.name} maxLength={120} />
          </label>
        </div>
        <div className="grid2">
          <label>
            種類
            <select name="category" defaultValue={p?.category ?? "outer"}>
              <option value="outer">アウター</option>
              <option value="bottoms">パンツ</option>
            </select>
          </label>
          <label>
            形（仮エンジンの描画に使用）
            <select name="style" defaultValue={p?.style ?? "jacket"}>
              <optgroup label="アウター">
                {OUTER_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {STYLE_LABEL[s]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="パンツ">
                {BOTTOM_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {STYLE_LABEL[s]}
                  </option>
                ))}
              </optgroup>
            </select>
            <span className="hint">種類と合わない形を選んだ場合は、その種類の最初の形になります。</span>
          </label>
        </div>
        <label>
          一言説明
          <input type="text" name="tagline" defaultValue={p?.tagline} maxLength={200} />
        </label>
        <label>
          説明
          <textarea name="description" defaultValue={p?.description} maxLength={2000} />
        </label>
        <label>
          特徴 <span className="hint">1行に1つ</span>
          <textarea name="features" defaultValue={p?.features.join("\n")} />
        </label>
        <div className="grid3">
          <label>
            カラー名
            <input type="text" name="color_name" defaultValue={p?.color_name} />
          </label>
          <label>
            色
            <input type="color" name="color_hex" defaultValue={p?.color_hex ?? "#6b5b45"} />
          </label>
          <label>
            フィット
            <input type="text" name="fit" defaultValue={p?.fit} placeholder="レギュラー / ゆったり など" />
          </label>
        </div>
        <div className="grid2">
          <label>
            素材
            <input type="text" name="material" defaultValue={p?.material} />
          </label>
          <label>
            お手入れ
            <input type="text" name="care" defaultValue={p?.care} />
          </label>
        </div>
        <div className="grid3">
          <label>
            サイズ <span className="hint">カンマ区切り</span>
            <input type="text" name="sizes" defaultValue={(p?.sizes ?? ["S", "M", "L", "XL"]).join(",")} />
          </label>
          <label>
            価格（税込・円）
            <input type="number" name="price_jpy" min={0} defaultValue={p?.price_jpy ?? 0} />
          </label>
          <label>
            商品ページURL
            <input type="url" name="product_url" defaultValue={p?.product_url} placeholder="https://" />
          </label>
        </div>
        <label>
          商品画像（平置き・PNG/JPEG/WebP）
          <span className="hint">
            未登録なら、色と形から仮の画像を自動で作ります。本物の画像生成エンジンを使うときは実物の写真が必要です。
          </span>
          {p?.image_key && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(p.image_key)!} alt="" className="thumb" style={{ width: 96, height: 96 }} />
          )}
          <input type="file" name="image" accept="image/png,image/jpeg,image/webp" />
        </label>
        <label className="check">
          <input type="checkbox" name="is_published" defaultChecked={p?.is_published ?? true} /> 試着室に公開する
        </label>
        <div className="form-actions">
          <button className="btn primary" type="submit">
            保存
          </button>
          <Link className="btn" href="/admin/products">
            戻る
          </Link>
        </div>
      </form>
      {p && (
        <form action={deleteProductAction} className="card">
          <input type="hidden" name="id" value={p.id} />
          <h2>商品の削除</h2>
          <p className="muted">この商品と、この商品を含む組み合わせ画像を削除します。元に戻せません。</p>
          <button className="btn danger" type="submit">
            削除する
          </button>
        </form>
      )}
    </>
  );
}
