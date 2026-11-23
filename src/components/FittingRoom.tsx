"use client";

// 試着室ビュー（仕様 F-FIT-01〜04）。
// 中央にAIモデル、左にアウター、右にパンツ。選ぶと事前生成済みの画像に即座に切り替わる。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Catalog, PublicLook, PublicProduct } from "@/lib/public-api";

const NO_OUTER = "__none__";

function comboKey(modelId: string, outerId: string | null, bottomId: string | null) {
  return `${modelId}|${outerId ?? "-"}|${bottomId ?? "-"}`;
}

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

function sessionId(): string {
  try {
    let id = sessionStorage.getItem("tryon_sid");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("tryon_sid", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

interface Props {
  catalog: Catalog;
  initial: { outerCode: string | null; bottomsCode: string | null; modelId: string | null };
}

export default function FittingRoom({ catalog, initial }: Props) {
  const { models, outers, bottoms, tenant } = catalog;
  const [looks, setLooks] = useState<Record<string, PublicLook>>(catalog.looks);
  const [modelId, setModelId] = useState(
    models.find((m) => m.id === initial.modelId)?.id ?? models[0]?.id ?? "",
  );
  const [outerId, setOuterId] = useState<string | null>(
    outers.find((p) => p.external_code === initial.outerCode)?.id ?? outers[0]?.id ?? null,
  );
  const [bottomId, setBottomId] = useState<string | null>(
    bottoms.find((p) => p.external_code === initial.bottomsCode)?.id ?? bottoms[0]?.id ?? null,
  );
  const [detail, setDetail] = useState<PublicProduct | null>(null);
  const [pending, setPending] = useState<string | null>(null); // 生成待ちの combo_key
  const [failed, setFailed] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [shownUrl, setShownUrl] = useState<string | null>(null);
  const embedded = useRef(false);

  const model = models.find((m) => m.id === modelId) ?? null;
  const key = modelId && bottomId ? comboKey(modelId, outerId, bottomId) : null;
  const look = key ? looks[key] : undefined;

  const track = useCallback(
    (type: string, extra: { product_id?: string; look_id?: string } = {}) => {
      const body = JSON.stringify({ type, session_id: sessionId(), ...extra });
      fetch(`/api/v1/t/${tenant.slug}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    },
    [tenant.slug],
  );

  useEffect(() => {
    embedded.current = window.parent !== window;
    track("room_view");
  }, [track]);

  // 同じモデルの生成済み画像を先読みして、切り替えを一瞬にする
  useEffect(() => {
    const urls = Object.values(looks)
      .filter((l) => l.combo_key.startsWith(modelId + "|") && l.image_url)
      .map((l) => l.image_url!);
    const imgs = urls.map((u) => {
      const img = new Image();
      img.decoding = "async";
      img.src = u;
      return img;
    });
    return () => imgs.forEach((i) => (i.src = ""));
  }, [modelId, looks]);

  // 表示中の画像。新しい組み合わせが未生成のあいだは直前の画像を薄く表示しておく
  useEffect(() => {
    if (look?.image_url) {
      setShownUrl(look.image_url);
      track("look_view", { look_id: look.id });
    }
  }, [look?.image_url, look?.id, track]);

  // 未生成ならオンデマンド生成を依頼し、できるまで待つ
  useEffect(() => {
    if (!key || look || !modelId || !bottomId) return;
    let cancelled = false;
    setPending(key);
    setFailed(null);
    (async () => {
      const res = await fetch(`/api/v1/t/${tenant.slug}/looks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId, outer_id: outerId, bottom_id: bottomId }),
      }).catch(() => null);
      let data = res && res.ok ? ((await res.json()) as PublicLook) : null;
      if (!data) {
        if (!cancelled) {
          setPending(null);
          setFailed(res?.status === 429 ? "少し時間を置いてからお試しください" : "画像を用意できませんでした");
        }
        return;
      }
      for (let i = 0; i < 80 && !cancelled && (data.status === "queued" || data.status === "running"); i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const r2 = await fetch(`/api/v1/t/${tenant.slug}/looks/${data.id}`).catch(() => null);
        if (r2?.ok) data = (await r2.json()) as PublicLook;
      }
      if (cancelled) return;
      setPending(null);
      if (data.status === "ready") setLooks((prev) => ({ ...prev, [data!.combo_key]: data! }));
      else setFailed("画像を用意できませんでした。時間を置いてお試しください");
    })();
    return () => {
      cancelled = true;
    };
  }, [key, look, modelId, outerId, bottomId, tenant.slug]);

  // スマホでは詳細パネルが着用画像を隠してしまうので、選んだだけでは開かない
  const isNarrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 860px)").matches;
  const selectOuter = (p: PublicProduct | null) => {
    setOuterId(p?.id ?? null);
    if (p) {
      track("product_select", { product_id: p.id });
      if (!isNarrow() || detail) openDetail(p);
    } else setDetail(null);
  };
  const selectBottoms = (p: PublicProduct) => {
    setBottomId(p.id);
    track("product_select", { product_id: p.id });
    if (!isNarrow() || detail) openDetail(p);
  };
  const openDetail = (p: PublicProduct) => {
    setDetail(p);
    track("detail_open", { product_id: p.id });
  };

  const addToCart = (p: PublicProduct, size: string) => {
    track("add_to_cart", { product_id: p.id });
    const message = { type: "tryon:add_to_cart", external_code: p.external_code, size, name: p.name, price_jpy: p.price_jpy };
    if (embedded.current) {
      // 埋め込み先のECサイトに通知する。実際のカート投入はEC側で行う（仕様 F-WGT-07）
      window.parent.postMessage(message, "*");
      setToast(`${p.name}（${size}）をカートに追加しました`);
    } else {
      setToast(`カートに追加しました（デモ表示）: ${p.name} ${size}`);
    }
    setTimeout(() => setToast(null), 3000);
  };

  const selectedOuter = outers.find((p) => p.id === outerId) ?? null;
  const selectedBottoms = bottoms.find((p) => p.id === bottomId) ?? null;
  const outfitTotal = useMemo(
    () => (selectedOuter?.price_jpy ?? 0) + (selectedBottoms?.price_jpy ?? 0),
    [selectedOuter, selectedBottoms],
  );

  if (!model || bottoms.length === 0) {
    return (
      <main className="room-empty">
        <p>現在この試着室では試着できる商品がありません。</p>
      </main>
    );
  }

  const busy = pending === key && !look;

  return (
    <div className={`room ${detail ? "with-detail" : ""}`}>
      <header className="room-header">
        <div className="room-brand">
          <span className="room-title">FITTING ROOM</span>
          <span className="room-tenant">{tenant.name}</span>
        </div>
        {models.length > 1 && (
          <div className="model-switch" role="radiogroup" aria-label="モデルを選ぶ">
            {models.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={m.id === modelId}
                className={`chip ${m.id === modelId ? "on" : ""}`}
                onClick={() => setModelId(m.id)}
              >
                {m.name}・{m.height_cm}cm
              </button>
            ))}
          </div>
        )}
      </header>

      <section className="rail rail-outer" aria-label="アウター">
        <h2 className="rail-title">アウター</h2>
        <div className="rail-items">
          <button className={`item none ${outerId === null ? "on" : ""}`} onClick={() => selectOuter(null)} aria-pressed={outerId === null}>
            <span className="item-none">なし</span>
            <span className="item-name">アウターなし</span>
          </button>
          {outers.map((p) => (
            <ProductCard key={p.id} p={p} on={p.id === outerId} onClick={() => selectOuter(p)} />
          ))}
        </div>
      </section>

      <section className="stage" aria-live="polite">
        <div className="stage-frame">
          {shownUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shownUrl}
              alt={`${model.name}の着用イメージ`}
              className={`stage-img ${busy ? "dim" : ""}`}
              key={shownUrl}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            model.image_url && <img src={model.image_url} alt={model.name} className="stage-img dim" />
          )}
          {busy && (
            <div className="stage-overlay">
              <div className="spinner" aria-hidden />
              <p>この組み合わせを生成しています…</p>
            </div>
          )}
          {failed && !busy && !look && (
            <div className="stage-overlay">
              <p>{failed}</p>
            </div>
          )}
        </div>
        <p className="model-note">
          AI生成モデル（身長{model.height_cm}cm想定・{model.size_worn}サイズ着用）
        </p>
        <p className="disclaimer">AI生成イメージです。実際の色・サイズ感と異なる場合があります。</p>
        <div className="wearing" aria-label="着用中の商品">
          {[selectedOuter, selectedBottoms].filter((p): p is PublicProduct => !!p).map((p) => (
            <button key={p.id} className="wearing-item" onClick={() => openDetail(p)}>
              <span className="swatch" style={{ background: p.color_hex }} />
              <span className="wearing-name">{p.name}</span>
              <span className="wearing-more">詳細</span>
            </button>
          ))}
        </div>
        {outfitTotal > 0 && <p className="outfit-total">このコーディネート合計 {yen(outfitTotal)}（税込）</p>}
      </section>

      <section className="rail rail-bottoms" aria-label="パンツ">
        <h2 className="rail-title">パンツ</h2>
        <div className="rail-items">
          {bottoms.map((p) => (
            <ProductCard key={p.id} p={p} on={p.id === bottomId} onClick={() => selectBottoms(p)} />
          ))}
        </div>
      </section>

      {detail && (
        <DetailPanel
          key={detail.id}
          p={detail}
          defaultSize={model.size_worn}
          onClose={() => setDetail(null)}
          onCart={addToCart}
          onLink={() => track("product_link", { product_id: detail.id })}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function ProductCard({ p, on, onClick }: { p: PublicProduct; on: boolean; onClick: () => void }) {
  return (
    <button className={`item ${on ? "on" : ""}`} onClick={onClick} aria-pressed={on}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.image_url ? <img src={p.image_url} alt="" className="item-img" loading="lazy" /> : <span className="item-img" />}
      <span className="item-name">{p.name}</span>
      <span className="item-price">{yen(p.price_jpy)}</span>
    </button>
  );
}

function DetailPanel({
  p,
  defaultSize,
  onClose,
  onCart,
  onLink,
}: {
  p: PublicProduct;
  defaultSize: string;
  onClose: () => void;
  onCart: (p: PublicProduct, size: string) => void;
  onLink: () => void;
}) {
  const [tab, setTab] = useState<"detail" | "features">("detail");
  const [size, setSize] = useState(p.sizes.includes(defaultSize) ? defaultSize : (p.sizes[0] ?? ""));
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className="detail" aria-label={`${p.name}の詳細`}>
      <button ref={closeRef} className="detail-close" onClick={onClose} aria-label="詳細を閉じる">
        ×
      </button>
      <p className="detail-cat">{p.category === "outer" ? "アウター" : "パンツ"}</p>
      <h2 className="detail-name">{p.name}</h2>
      {p.tagline && <p className="detail-tagline">{p.tagline}</p>}
      <p className="detail-price">
        {yen(p.price_jpy)}
        <span className="tax">（税込）</span>
      </p>

      <div className="detail-sizes" role="radiogroup" aria-label="サイズ">
        <span className="label">サイズ</span>
        {p.sizes.map((s) => (
          <button key={s} role="radio" aria-checked={s === size} className={`size ${s === size ? "on" : ""}`} onClick={() => setSize(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "detail"} className={tab === "detail" ? "on" : ""} onClick={() => setTab("detail")}>
          詳細
        </button>
        <button role="tab" aria-selected={tab === "features"} className={tab === "features" ? "on" : ""} onClick={() => setTab("features")}>
          特徴
        </button>
      </div>
      {tab === "detail" ? (
        <div role="tabpanel">
          {p.description && <p className="detail-desc">{p.description}</p>}
          <dl className="spec">
            <dt>カラー</dt>
            <dd>
              <span className="swatch" style={{ background: p.color_hex }} /> {p.color_name || "-"}
            </dd>
            <dt>フィット</dt>
            <dd>{p.fit || "-"}</dd>
            <dt>素材</dt>
            <dd>{p.material || "-"}</dd>
            <dt>お手入れ</dt>
            <dd>{p.care || "-"}</dd>
            <dt>商品コード</dt>
            <dd>{p.external_code}</dd>
          </dl>
        </div>
      ) : (
        <ul role="tabpanel" className="features">
          {p.features.length ? p.features.map((f) => <li key={f}>{f}</li>) : <li>登録されていません</li>}
        </ul>
      )}

      <div className="detail-actions">
        <button className="btn primary wide" onClick={() => onCart(p, size)} disabled={!size}>
          カートに入れる
        </button>
        {p.product_url && (
          <a className="btn wide" href={p.product_url} target="_blank" rel="noopener noreferrer" onClick={onLink}>
            商品ページを見る
          </a>
        )}
      </div>
    </aside>
  );
}
