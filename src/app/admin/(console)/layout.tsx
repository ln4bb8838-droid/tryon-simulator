import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "管理画面 | 試着シミュレータ" };

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, tenant } = await requireAdmin();
  return (
    <div className="admin">
      <nav className="admin-nav" aria-label="管理メニュー">
        <div className="brand">TRY-ON ADMIN</div>
        <div className="tenant">{tenant.name}</div>
        <Link href="/admin">ダッシュボード</Link>
        <Link href="/admin/products">商品</Link>
        <Link href="/admin/models">AIモデル</Link>
        <Link href="/admin/looks">組み合わせ画像</Link>
        <Link href="/admin/embed">ECへの設置</Link>
        {user.role === "system_admin" && <Link href="/admin/system">運営者メニュー</Link>}
        <a href={`/t/${tenant.slug}`} target="_blank" rel="noopener">
          試着室を開く ↗
        </a>
        <div className="spacer" />
        <div className="who">{user.email}</div>
        <form action={logoutAction}>
          <button type="submit">ログアウト</button>
        </form>
      </nav>
      <main className="admin-main">{children}</main>
    </div>
  );
}
