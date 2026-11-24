import Link from "next/link";
import { db } from "@/lib/db";
import { DEMO_TENANT_SLUG } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default function Home() {
  db(); // 初回アクセス時にデモデータを用意する
  return (
    <main className="home">
      <h1>試着シミュレータ</h1>
      <p className="muted">アパレル事業者向け「AIモデルの試着室」MVP</p>
      <div className="home-links">
        <Link className="btn primary" href={`/t/${DEMO_TENANT_SLUG}`}>
          デモの試着室を開く
        </Link>
        <Link className="btn" href="/admin">
          事業者の管理画面
        </Link>
      </div>
    </main>
  );
}
