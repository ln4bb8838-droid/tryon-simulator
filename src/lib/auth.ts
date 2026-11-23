// 管理画面のログイン（仕様 F-AUTH-01 / N-SEC-04）。
// セッションIDはランダム値をHttpOnly Cookieに入れ、DBにはそのハッシュだけを保存する。

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, now } from "./db";
import { getTenant, getUserByEmail } from "./repo";
import { verifyPassword } from "./password";
import type { Tenant, User } from "./types";

const COOKIE = "tryon_admin";
const TTL_DAYS = 7;

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function login(email: string, password: string): Promise<boolean> {
  const user = getUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) return false;
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + TTL_DAYS * 86400_000);
  db()
    .prepare("INSERT INTO admin_sessions (id, user_id, expires_at, created_at) VALUES (?,?,?,?)")
    .run(hashToken(token), user.id, expires.toISOString(), now());
  db().prepare("UPDATE users SET last_login_at=? WHERE id=?").run(now(), user.id);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return true;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db().prepare("DELETE FROM admin_sessions WHERE id=?").run(hashToken(token));
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.tenant_id, u.email, u.role FROM admin_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), now()) as User | undefined;
  return row ?? null;
}

export interface AdminContext {
  user: User;
  tenant: Tenant;
}

/**
 * 管理画面の各ページ・操作の最初に呼ぶ。未ログインならログイン画面へ。
 * 運営者（system_admin）は ?tenant= で対象テナントを切り替えられる。MVPでは最初のテナントを既定にする。
 */
export async function requireAdmin(): Promise<AdminContext> {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  let tenant: Tenant | null = null;
  if (user.tenant_id) tenant = getTenant(user.tenant_id);
  else {
    const jar = await cookies();
    const chosen = jar.get("tryon_tenant")?.value;
    tenant =
      (chosen && getTenant(chosen)) ||
      ((db().prepare("SELECT * FROM tenants ORDER BY created_at LIMIT 1").get() as unknown as Tenant) ?? null);
  }
  if (!tenant) redirect("/admin/system");
  return { user, tenant };
}

export async function requireSystemAdmin(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "system_admin") redirect("/admin");
  return user;
}
