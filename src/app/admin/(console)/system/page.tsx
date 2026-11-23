import { requireSystemAdmin } from "@/lib/auth";
import * as repo from "@/lib/repo";
import { ENGINES } from "@/lib/engines";
import { createTenantAction, switchTenantAction, updateTenantAction } from "../../actions";

const ERRORS: Record<string, string> = {
  input: "入力を確認してください（URL名は英小文字・数字・ハイフン、パスワードは8文字以上）。",
  slug: "そのURL名は既に使われています。",
  email: "そのメールアドレスは既に登録されています。",
};

export default async function SystemPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireSystemAdmin();
  const { error, saved } = await searchParams;
  const tenants = repo.listTenants();
  return (
    <>
      <h1>運営者メニュー</h1>
      <p className="lead">契約事業者（テナント）の作成・停止、月間の生成上限、生成エンジンの割り当てを行います。</p>
      {error && <div className="alert">{ERRORS[error] ?? "保存できませんでした。"}</div>}
      {saved && <div className="notice">保存しました。</div>}

      <div className="card scroll-x">
        <h2>事業者一覧</h2>
        <table className="list">
          <thead>
            <tr>
              <th>事業者</th>
              <th>URL名</th>
              <th className="num">今月の生成</th>
              <th>設定</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>/t/{t.slug}</td>
                <td className="num">{repo.countGeneratedThisMonth(t.id)}</td>
                <td>
                  <form action={updateTenantAction} className="row-actions" style={{ alignItems: "center" }}>
                    <input type="hidden" name="id" value={t.id} />
                    <select name="status" defaultValue={t.status}>
                      <option value="active">稼働</option>
                      <option value="suspended">停止</option>
                    </select>
                    <label style={{ fontSize: 12 }}>
                      上限 <input type="number" name="monthly_quota" defaultValue={t.monthly_quota} min={0} style={{ width: 80 }} />
                    </label>
                    <select name="engine_id" defaultValue={t.engine_id ?? ""}>
                      <option value="">既定（環境変数）</option>
                      {Object.values(ENGINES).map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                    <button className="btn small" type="submit">
                      保存
                    </button>
                  </form>
                </td>
                <td>
                  <form action={switchTenantAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn small" type="submit">
                      この事業者の画面へ
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>事業者を追加</h2>
        <form action={createTenantAction} className="form">
          <div className="grid2">
            <label>
              事業者名
              <input type="text" name="name" required />
            </label>
            <label>
              URL名 <span className="hint">試着室のURL /t/○○ になります（英小文字・数字・ハイフン）</span>
              <input type="text" name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,39}" />
            </label>
          </div>
          <div className="grid3">
            <label>
              管理者のメールアドレス
              <input type="email" name="email" required />
            </label>
            <label>
              初期パスワード（8文字以上）
              <input type="password" name="password" required minLength={8} autoComplete="new-password" />
            </label>
            <label>
              月間の生成上限
              <input type="number" name="monthly_quota" defaultValue={500} min={0} />
            </label>
          </div>
          <div className="form-actions">
            <button className="btn primary" type="submit">
              追加
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
