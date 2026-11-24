import { requireAdmin } from "@/lib/auth";
import * as repo from "@/lib/repo";
import { fileUrl } from "@/lib/storage";
import type { Model } from "@/lib/types";
import { saveModelAction } from "../../actions";

const ERRORS: Record<string, string> = {
  consent: "モデル画像の権利確認にチェックを入れてください。",
  image: "画像はPNG・JPEG・WebP（5MBまで）にしてください。",
};

function ModelForm({ m }: { m?: Model }) {
  return (
    <form action={saveModelAction} className="form">
      {m && <input type="hidden" name="id" value={m.id} />}
      <div className="grid3">
        <label>
          表示名
          <input type="text" name="name" defaultValue={m?.name} required maxLength={40} />
        </label>
        <label>
          身長（cm）
          <input type="number" name="height_cm" min={140} max={200} defaultValue={m?.height_cm ?? 170} />
        </label>
        <label>
          着用サイズ
          <input type="text" name="size_worn" defaultValue={m?.size_worn ?? "M"} maxLength={8} />
        </label>
      </div>
      <div className="grid3">
        <label>
          体型
          <select name="body_type" defaultValue={m?.body_type ?? "standard"}>
            <option value="slim">細め</option>
            <option value="standard">標準</option>
            <option value="broad">しっかり</option>
          </select>
        </label>
        <label>
          肌の色
          <input type="color" name="skin_hex" defaultValue={m?.skin_hex ?? "#e6c09c"} />
        </label>
        <label>
          髪
          <span style={{ display: "flex", gap: 8 }}>
            <input type="color" name="hair_hex" defaultValue={m?.hair_hex ?? "#231a14"} style={{ width: 60 }} />
            <select name="hair_style" defaultValue={m?.hair_style ?? "short"} style={{ flex: 1 }}>
              <option value="short">ショート</option>
              <option value="long">ロング</option>
              <option value="bun">まとめ髪</option>
            </select>
          </span>
        </label>
      </div>
      <label>
        モデル画像（PNG/JPEG/WebP・任意）
        <span className="hint">
          本物の画像生成エンジンでは、ここに登録したAI生成モデルの全身画像に服を着せます。未登録なら仮の画像を使います。
        </span>
        <input type="file" name="image" accept="image/png,image/jpeg,image/webp" />
      </label>
      <label className="check">
        <input type="checkbox" name="is_active" defaultChecked={m?.is_active ?? true} /> 試着室で使う
      </label>
      <label className="check">
        <input type="checkbox" name="consent" required defaultChecked={!!m} /> 実在の人物に似せていないこと、画像の利用権があることを確認しました
      </label>
      <div className="form-actions">
        <button className="btn primary" type="submit">
          {m ? "保存" : "追加"}
        </button>
      </div>
    </form>
  );
}

export default async function ModelsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { tenant } = await requireAdmin();
  const { error, saved } = await searchParams;
  const models = repo.listModels(tenant.id);
  return (
    <>
      <h1>AIモデル</h1>
      <p className="lead">
        試着室の中央に立つモデルです。モデルを増やすと、事前生成する組み合わせ画像の枚数も増えます（モデル数 × アウター数 × パンツ数）。
      </p>
      {error && <div className="alert">{ERRORS[error] ?? "保存できませんでした。"}</div>}
      {saved && <div className="notice">保存しました。組み合わせ画像は作り直しの対象になりました。</div>}
      {models.map((m) => (
        <div className="card" key={m.id} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {m.image_key ? <img src={fileUrl(m.image_key)!} alt="" style={{ width: 100, height: 166, objectFit: "contain", background: "#efebe5", borderRadius: 8 }} /> : <div />}
          <div>
            <h2>
              {m.name}（{m.height_cm}cm・{m.size_worn}着用）{" "}
              {m.is_active ? <span className="badge ok">使用中</span> : <span className="badge">停止中</span>}
            </h2>
            <ModelForm m={m} />
          </div>
        </div>
      ))}
      <div className="card">
        <h2>モデルを追加</h2>
        <ModelForm />
      </div>
    </>
  );
}
