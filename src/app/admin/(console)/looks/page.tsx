import { requireAdmin } from "@/lib/auth";
import * as repo from "@/lib/repo";
import { fileUrl } from "@/lib/storage";
import { kickWorker, plannedLookCount } from "@/lib/generation";
import { getEngine } from "@/lib/engines";
import { ERROR_LABEL } from "@/lib/types";
import AutoRefresh from "@/components/AutoRefresh";
import { pregenerateAction } from "../../actions";

export default async function LooksPage({ searchParams }: { searchParams: Promise<{ queued?: string }> }) {
  const { tenant } = await requireAdmin();
  const { queued } = await searchParams;
  const models = repo.listModels(tenant.id, { activeOnly: true });
  const outers = repo.listProducts(tenant.id, { publishedOnly: true, category: "outer" });
  const bottoms = repo.listProducts(tenant.id, { publishedOnly: true, category: "bottoms" });
  const looks = repo.listLooks(tenant.id);
  const byKey = new Map(looks.map((l) => [l.combo_key, l]));
  const planned = plannedLookCount(tenant.id);
  const activeKeys = new Set(
    models.flatMap((m) => [null, ...outers.map((o) => o.id)].flatMap((o) => bottoms.map((b) => repo.comboKey(m.id, o, b.id)))),
  );
  const active = looks.filter((l) => activeKeys.has(l.combo_key));
  const ready = active.filter((l) => l.status === "ready").length;
  const waiting = active.filter((l) => l.status === "queued" || l.status === "running").length;
  const failed = active.filter((l) => l.status === "failed");
  if (waiting) kickWorker();
  const engine = getEngine(tenant.engine_id);

  return (
    <>
      <AutoRefresh active={waiting > 0} />
      <div className="page-head">
        <div>
          <h1>組み合わせ画像</h1>
          <p className="lead" style={{ margin: 0 }}>
            モデル × アウター × パンツの着用画像を前もって作っておくと、試着室での切り替えが一瞬になります。未生成の組み合わせは、試着室で選ばれた時に作ります。
          </p>
        </div>
        <div className="row-actions">
          <form action={pregenerateAction}>
            <button className="btn primary" type="submit">
              未生成の組み合わせを生成
            </button>
          </form>
          <form action={pregenerateAction}>
            <input type="hidden" name="force" value="1" />
            <button className="btn" type="submit">
              すべて作り直す
            </button>
          </form>
        </div>
      </div>
      {queued !== undefined && <div className="notice">{queued} 件を生成待ちに追加しました。</div>}
      <div className="stats">
        <div className="stat">
          <div className="k">生成済み / 対象</div>
          <div className="v">
            {ready} / {planned}
          </div>
          <div className="bar">
            <span style={{ width: `${planned ? (ready / planned) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="stat">
          <div className="k">生成待ち</div>
          <div className="v">{waiting}</div>
          <div className="s">{waiting ? "自動で更新します" : "なし"}</div>
        </div>
        <div className="stat">
          <div className="k">失敗</div>
          <div className="v">{failed.length}</div>
          <div className="s">「未生成の組み合わせを生成」で再試行</div>
        </div>
        <div className="stat">
          <div className="k">生成エンジン</div>
          <div className="v" style={{ fontSize: 15 }}>
            {engine.label}
          </div>
        </div>
      </div>

      {failed.length > 0 && (
        <div className="alert">
          失敗の理由: {[...new Set(failed.map((f) => ERROR_LABEL[f.error_code ?? ""] ?? f.error_code))].join(" / ")}
        </div>
      )}

      {models.map((m) => (
        <div className="card scroll-x" key={m.id}>
          <h2>
            {m.name}（{m.height_cm}cm）
          </h2>
          <table className="matrix">
            <thead>
              <tr>
                <th>パンツ ＼ アウター</th>
                <th>なし</th>
                {outers.map((o) => (
                  <th key={o.id}>{o.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bottoms.map((b) => (
                <tr key={b.id}>
                  <th>{b.name}</th>
                  {[null, ...outers].map((o) => {
                    const l = byKey.get(repo.comboKey(m.id, o?.id ?? null, b.id));
                    return (
                      <td key={o?.id ?? "none"}>
                        {l?.status === "ready" && l.image_key ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={fileUrl(l.image_key)!} alt="" loading="lazy" />
                        ) : (
                          <div className="cell-empty">
                            {!l ? "未生成" : l.status === "failed" ? <span className="badge ng">失敗</span> : <span className="badge warn">生成中</span>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {(models.length === 0 || bottoms.length === 0) && (
        <div className="card muted">有効なモデルと、公開中のパンツが1つ以上必要です。</div>
      )}
    </>
  );
}
