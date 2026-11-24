"use client";

// 試着室ビュー（仕様 F-FIT-01〜04）。
// 白い背景の中央に大きくAIモデル。左右に商品画像だけを浮かべて並べ、上段がアウター、下段がパンツ。
// 選ぶと事前生成済みの着用画像にすぐ切り替わる。表示する文字は最小限にしている。

import { useCallback, useEffect, useRef, useState } from "react";
import type { Catalog, PublicLook, PublicProduct } from "@/lib/public-api";

// 身長の調整範囲（cm）
export const HEIGHT_MIN = 150;
export const HEIGHT_MAX = 190;

/** 身長に合わせて着用画像を何倍に表示するか（足元を基準に拡大・縮小） */
export function heightScale(targetCm: number, modelCm: number): number {
  return targetCm / modelCm;
}

function comboKey(modelId: string, outerId: string | null, bottomId: string | null) {
  return `${modelId}|${outerId ?? "-"}|${bottomId ?? "-"}`;
}

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const clampHeight = (cm: number) => Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, cm));

/** 一覧を左右に振り分ける（左に前半、右に後半） */
function split<T>(items: T[]): [T[], T[]] {
  const half = Math.ceil(items.length / 2);
  return [items.slice(0, half), items.slice(half)];
}

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

interface CartLine {
  product: PublicProduct;
  size: string;
}

interface Props {
  catalog: Catalog;
  initial: { outerCode: string | null; bottomsCode: string | null; modelId: string | null };
}

export default function FittingRoom({ catalog, initial }: Props) {
  const { models, outers, bottoms, tenant } = catalog;
  const [looks, setLooks] = useState<Record<string, PublicLook>>(catalog.looks);
  const [modelId, setModelId] = useState(models.find((m) => m.id === initial.modelId)?.id ?? models[0]?.id ?? "");
  const [heightCm, setHeightCm] = useState(() =>
    clampHeight(models.find((m) => m.id === initial.modelId)?.height_cm ?? models[0]?.height_cm ?? 170),
  );
  const [outerId, setOuterId] = useState<string | null>(
    outers.find((p) => p.external_code === initial.outerCode)?.id ?? outers[0]?.id ?? null,
  );
  const [bottomId, setBottomId] = useState<string | null>(
    bottoms.find((p) => p.external_code === initial.bottomsCode)?.id ?? bottoms[0]?.id ?? null,
  );
  const [detail, setDetail] = useState<PublicProduct | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
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
      fetch(`/api/v1/t/${tenant.slug}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, session_id: sessionId(), ...extra }),
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
    const imgs = Object.values(looks)
      .filter((l) => l.combo_key.startsWith(modelId + "|") && l.image_url)
      .map((l) => {
        const img = new Image();
        img.decoding = "async";
        img.src = l.image_url!;
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

  // 選んでいるアウターをもう一度押すと脱ぐ（アウターなし）
  const pickOuter = (p: PublicProduct) => {
    const next = p.id === outerId ? null : p.id;
    setOuterId(next);
    if (next) track("product_select", { product_id: p.id });
  };
  const pickBottoms = (p: PublicProduct) => {
    setBottomId(p.id);
    track("product_select", { product_id: p.id });
  };
  const openDetail = (p: PublicProduct) => {
    setCartOpen(false);
    setDetail(p);
    track("detail_open", { product_id: p.id });
  };

  const addToCart = (p: PublicProduct, size: string) => {
    track("add_to_cart", { product_id: p.id });
    setCart((c) => [...c, { product: p, size }]);
    if (embedded.current) {
      // 埋め込み先のECサイトに通知する。実際のカート投入はEC側で行う（仕様 F-WGT-07）
      window.parent.postMessage(
        { type: "tryon:add_to_cart", external_code: p.external_code, size, name: p.name, price_jpy: p.price_jpy },
        "*",
      );
    }
    setDetail(null);
    setToast(`カートに入れました: ${p.name}（${size}）`);
    setTimeout(() => setToast(null), 2500);
  };

  if (!model || bottoms.length === 0) {
    return (
      <main className="room-empty">
        <p>現在この試着室では試着できる商品がありません。</p>
      </main>
    );
  }

  const busy = pending === key && !look;
  const scale = heightScale(heightCm, model.height_cm);
  const selectedOuter = outers.find((p) => p.id === outerId) ?? null;
  const selectedBottoms = bottoms.find((p) => p.id === bottomId) ?? null;
  const [outerL, outerR] = split(outers);
  const [bottomL, bottomR] = split(bottoms);

  const shelf = (items: PublicProduct[], selected: string | null, onPick: (p: PublicProduct) => void, label: string) => (
    <div className="shelf" role="group" aria-label={label}>
      {items.map((p) => (
        <button
          key={p.id}
          className={`piece ${p.id === selected ? "on" : ""}`}
          onClick={() => onPick(p)}
          aria-pressed={p.id === selected}
          aria-label={p.name}
          title={p.name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.image_url && <img src={p.image_url} alt="" draggable={false} />}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fr">
      <header className="fr-head">
        <h1 className="fr-title">{tenant.name}</h1>
        <button className="fr-cart" onClick={() => { setDetail(null); setCartOpen((o) => !o); }} aria-expanded={cartOpen}>
          カート <span className="fr-cart-n">{cart.length}</span>
        </button>
      </header>

      <div className="fr-side fr-left">
        {shelf(outerL, outerId, pickOuter, "アウター")}
        {shelf(bottomL, bottomId, pickBottoms, "パンツ")}
      </div>

      <main className="fr-stage" aria-live="polite">
        {shownUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={shownUrl}
            src={shownUrl}
            alt={`${model.name}の着用イメージ`}
            className={`fr-model ${busy ? "dim" : ""}`}
            style={{ transform: `scale(${scale})` }}
          />
        ) : (
          model.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={model.image_url} alt={model.name} className="fr-model dim" style={{ transform: `scale(${scale})` }} />
          )
        )}
        {busy && <div className="fr-spinner" aria-label="生成中" />}
        {failed && !busy && !look && <p className="fr-msg">{failed}</p>}
      </main>

      <div className="fr-side fr-right">
        {shelf(outerR, outerId, pickOuter, "アウター")}
        {shelf(bottomR, bottomId, pickBottoms, "パンツ")}
      </div>

      {/* スマホでは左右に分けず、アウターとパンツを1列ずつ横スクロールで並べる */}
      <div className="fr-mobile">
        {shelf(outers, outerId, pickOuter, "アウター")}
        {shelf(bottoms, bottomId, pickBottoms, "パンツ")}
      </div>

      <footer className="fr-foot">
        <p className="fr-note">
          AIによる生成イメージです。実際の色・サイズ感と異なる場合があります。
        </p>
        <div className="fr-wearing">
          <button className="fr-label" onClick={() => selectedOuter && openDetail(selectedOuter)} disabled={!selectedOuter}>
            <span className="k">アウター</span>
            {selectedOuter?.name ?? "なし"}
          </button>
          {selectedBottoms && (
            <button className="fr-label" onClick={() => openDetail(selectedBottoms)}>
              <span className="k">パンツ</span>
              {selectedBottoms.name}
            </button>
          )}
        </div>
        <div className="fr-height">
          {models.length > 1 && (
            <div className="fr-models" role="radiogroup" aria-label="モデル">
              {models.map((m) => (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={m.id === modelId}
                  className={m.id === modelId ? "on" : ""}
                  onClick={() => {
                    setModelId(m.id);
                    setHeightCm(clampHeight(m.height_cm));
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
          <label>
            <span className="row">
              <span className="k">モデルの身長</span>
              <output>{heightCm}cm</output>
            </span>
            <input
              type="range"
              min={HEIGHT_MIN}
              max={HEIGHT_MAX}
              value={heightCm}
              onChange={(e) => setHeightCm(Number(e.target.value))}
              aria-valuetext={`${heightCm}cm`}
            />
            <span className="row scale">
              <span>{HEIGHT_MIN}</span>
              <span>{(HEIGHT_MIN + HEIGHT_MAX) / 2}</span>
              <span>{HEIGHT_MAX}</span>
            </span>
          </label>
        </div>
      </footer>

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

      {cartOpen && <CartPanel lines={cart} onClose={() => setCartOpen(false)} onRemove={(i) => setCart((c) => c.filter((_, j) => j !== i))} />}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
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
  const [size, setSize] = useState(p.sizes.includes(defaultSize) ? defaultSize : (p.sizes[0] ?? ""));
  const [more, setMore] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus({ preventScroll: true }), []);
  useEscape(onClose);

  return (
    <aside className="sheet" aria-label={`${p.name}の詳細`}>
      <button ref={closeRef} className="sheet-close" onClick={onClose} aria-label="閉じる">
        ×
      </button>
      <h2 className="sheet-name">{p.name}</h2>
      <p className="sheet-price">{yen(p.price_jpy)}</p>
      <div className="sheet-sizes" role="radiogroup" aria-label="サイズ">
        {p.sizes.map((s) => (
          <button key={s} role="radio" aria-checked={s === size} className={s === size ? "on" : ""} onClick={() => setSize(s)}>
            {s}
          </button>
        ))}
      </div>
      <button className="btn primary wide" onClick={() => onCart(p, size)} disabled={!size}>
        カートに入れる
      </button>
      <button className="sheet-more" onClick={() => setMore((m) => !m)} aria-expanded={more}>
        {more ? "商品情報を閉じる" : "商品情報を見る"}
      </button>
      {more && (
        <div className="sheet-info">
          {p.description && <p>{p.description}</p>}
          <dl>
            <dt>カラー</dt>
            <dd>{p.color_name || "-"}</dd>
            <dt>フィット</dt>
            <dd>{p.fit || "-"}</dd>
            <dt>素材</dt>
            <dd>{p.material || "-"}</dd>
            <dt>お手入れ</dt>
            <dd>{p.care || "-"}</dd>
          </dl>
          {p.features.length > 0 && (
            <ul>
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          {p.product_url && (
            <a href={p.product_url} target="_blank" rel="noopener noreferrer" onClick={onLink}>
              商品ページへ
            </a>
          )}
        </div>
      )}
    </aside>
  );
}

function CartPanel({ lines, onClose, onRemove }: { lines: CartLine[]; onClose: () => void; onRemove: (i: number) => void }) {
  useEscape(onClose);
  const total = lines.reduce((s, l) => s + l.product.price_jpy, 0);
  return (
    <aside className="sheet" aria-label="カート">
      <button className="sheet-close" onClick={onClose} aria-label="閉じる">
        ×
      </button>
      <h2 className="sheet-name">カート</h2>
      {lines.length === 0 ? (
        <p className="muted">まだ何も入っていません。</p>
      ) : (
        <>
          <ul className="cart-lines">
            {lines.map((l, i) => (
              <li key={i}>
                <span>
                  {l.product.name}
                  <span className="muted">（{l.size}）</span>
                </span>
                <span>{yen(l.product.price_jpy)}</span>
                <button onClick={() => onRemove(i)} aria-label={`${l.product.name}を削除`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="cart-total">
            合計 <strong>{yen(total)}</strong>
          </p>
        </>
      )}
    </aside>
  );
}
