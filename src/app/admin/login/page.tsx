import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEMO_ADMIN_EMAIL, DEMO_OPERATOR_EMAIL } from "@/lib/seed";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "ログイン | 試着シミュレータ" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  db();
  if (await currentUser()) redirect("/admin");
  const { error } = await searchParams;
  const showDemo = process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_LOGIN === "1";
  return (
    <main className="login">
      <h1>管理画面にログイン</h1>
      {error && <div className="alert">メールアドレスまたはパスワードが違います。</div>}
      <form action={loginAction} className="form card">
        <label>
          メールアドレス
          <input type="email" name="email" required autoComplete="username" defaultValue={showDemo ? DEMO_ADMIN_EMAIL : ""} />
        </label>
        <label>
          パスワード
          <input type="password" name="password" required autoComplete="current-password" />
        </label>
        <button className="btn primary wide" type="submit">
          ログイン
        </button>
      </form>
      {showDemo && (
        <div className="demo-hint">
          デモ用アカウント（パスワードは環境変数 ADMIN_PASSWORD、未設定なら <code>demo1234</code>）
          <br />
          事業者: {DEMO_ADMIN_EMAIL}
          <br />
          運営者: {DEMO_OPERATOR_EMAIL}
        </div>
      )}
    </main>
  );
}
