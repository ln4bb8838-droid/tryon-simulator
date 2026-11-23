import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import * as repo from "@/lib/repo";
import { plannedLookCount } from "@/lib/generation";
import { getEngine } from "@/lib/engines";
import { EVENT_LABEL, EVENT_TYPES } from "@/lib/types";

export default async function Dashboard() {
  const { tenant } = await requireAdmin();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const counts = repo.eventCounts(tenant.id, since);
  const generated = repo.countGeneratedThisMonth(tenant.id);
  const looks = repo.listLooks(tenant.id);
  const ready = looks.filter((l) => l.status === "ready").length;
  const planned = plannedLookCount(tenant.id);
  const products = repo.listProducts(tenant.id);
  const published = products.filter((p) => p.is_published).length;
  const top = repo.productEventCounts(tenant.id, since).slice(0, 8);
  const daily = repo.dailyEventCounts(tenant.id, since).filter((d) => d.type === "room_view");
  const maxDaily = Math.max(1, ...daily.map((d) => d.n));
  const views = counts.room_view ?? 0;
  const carts = counts.add_to_cart ?? 0;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "-");

  return (
    <>
      <h1>ダッシュボード</h1>
      <p className="lead">直近30日の利用状況です。生成エンジン: {getEngine(tenant.engine_id).label}</p>
      <div className="stats">
        <div className="stat">
          <div className="k">試着室の表示</div>
          <div className="v">{views.toLocaleString()}</div>
          <div className="s">30日間</div>
        </div>
        <div className="stat">
          <div className="k">カートに入れる</div>
          <div className="v">{carts.toLocaleString()}</div>
          <div className="s">表示あたり {pct(carts, views)}</div>
        </div>
        <div className="stat">
          <div className="k">今月の生成枚数 / 上限</div>
          <div className="v">
            {generated} <span style={{ fontSize: 14, color: "var(--muted)" }}>/ {tenant.monthly_quota}</span>
          </div>
          <div className="bar">
            <span style={{ width: `${Math.min(100, (generated / Math.max(1, tenant.monthly_quota)) * 100)}%` }} />
          </div>
        </div>
        <div className="stat">
          <div className="k">組み合わせ画像（生成済み / 対象）</div>
          <div className="v">
            {ready} <span style={{ fontSize: 14, color: "var(--muted)" }}>/ {planned}</span>
          </div>
          <div className="s">
            <Link href="/admin/looks">組み合わせ画像を管理</Link>
          </div>
        </div>
        <div className="stat">
          <div className="k">公開中の商品</div>
          <div className="v">
            {published} <span style={{ fontSize: 14, color: "var(--muted)" }}>/ {products.length}</span>
          </div>
          <div className="s">
            <Link href="/admin/products">商品を管理</Link>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>操作の内訳（30日間）</h2>
        <table className="list">
          <tbody>
            {EVENT_TYPES.map((t) => (
              <tr key={t}>
                <td>{EVENT_LABEL[t]}</td>
                <td className="num">{(counts[t] ?? 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {daily.length > 0 && (
        <div className="card">
          <h2>日別の試着室表示</h2>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
            {daily.map((d) => (
              <div key={d.day} title={`${d.day}: ${d.n}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: "100%", maxWidth: 28, height: `${(d.n / maxDaily) * 96}px`, background: "var(--sel)", borderRadius: 3 }} />
                <span style={{ fontSize: 10, color: "var(--muted)" }}>{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>商品別（30日間・選択の多い順）</h2>
        <table className="list">
          <thead>
            <tr>
              <th>商品</th>
              <th className="num">選択</th>
              <th className="num">詳細表示</th>
              <th className="num">商品ページへ</th>
              <th className="num">カート</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="num">{r.selects}</td>
                <td className="num">{r.details}</td>
                <td className="num">{r.links}</td>
                <td className="num">{r.carts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
