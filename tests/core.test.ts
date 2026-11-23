import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// テストごとに空のデータフォルダを使う（db() より前に設定する）
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tryon-test-"));
process.env.DATA_DIR = dir;
process.env.TRYON_ENGINE = "mock";

import { db } from "@/lib/db";
import * as repo from "@/lib/repo";
import { drainForTest, plannedLookCount, pregenerateAll, requestLook } from "@/lib/generation";
import { hashPassword, verifyPassword } from "@/lib/password";
import { renderGarmentSvg, renderLookSvg, shade } from "@/lib/engines/mock-art";
import { buildCatalog, rateLimited, safeUrl } from "@/lib/public-api";
import { getEngine } from "@/lib/engines";
import { getObject, resolveKey } from "@/lib/storage";
import { DEMO_TENANT_SLUG } from "@/lib/seed";

let tenantId = "";

beforeAll(async () => {
  db();
  tenantId = repo.getTenantBySlug(DEMO_TENANT_SLUG)!.id;
  await new Promise((r) => setTimeout(r, 20)); // seed の事前生成が積まれるのを待つ
  await drainForTest();
});

describe("デモデータ", () => {
  it("テナント・モデル・商品が入り、全組み合わせが生成される", () => {
    expect(repo.listModels(tenantId)).toHaveLength(2);
    const catalog = buildCatalog(repo.getTenant(tenantId)!);
    expect(catalog.outers.length).toBe(4);
    expect(catalog.bottoms.length).toBe(3); // ショーツは非公開
    // モデル2 ×（アウター4 + なし）× パンツ3
    expect(plannedLookCount(tenantId)).toBe(30);
    expect(Object.keys(catalog.looks)).toHaveLength(30);
  });
});

describe("組み合わせ画像の生成", () => {
  it("公開を増やすと未生成分だけが積まれ、再実行しても重複しない", async () => {
    const shorts = repo.listProducts(tenantId).find((p) => !p.is_published)!;
    repo.setProductPublished(tenantId, shorts.id, true);
    expect(pregenerateAll(tenantId)).toBe(10); // モデル2 × (アウター4+なし) × 1
    await drainForTest();
    expect(pregenerateAll(tenantId)).toBe(0);
    const look = repo.getLookByCombo(tenantId, repo.comboKey(repo.listModels(tenantId)[0].id, null, shorts.id))!;
    expect(look.status).toBe("ready");
    expect(getObject(look.image_key!)?.toString()).toContain("<svg");
  });

  it("月間上限を超えると QUOTA_EXCEEDED で失敗する", async () => {
    const t = repo.getTenant(tenantId)!;
    repo.updateTenant(tenantId, { monthly_quota: repo.countGeneratedThisMonth(tenantId) });
    const m = repo.listModels(tenantId)[0];
    const outer = repo.listProducts(tenantId, { category: "outer" })[0];
    const bottoms = repo.listProducts(tenantId, { category: "bottoms" })[0];
    repo.deleteLooksFor(tenantId, { productId: outer.id });
    const look = requestLook(tenantId, m.id, outer.id, bottoms.id)!;
    await drainForTest();
    const after = repo.getLook(tenantId, look.id)!;
    expect(after.status).toBe("failed");
    expect(after.error_code).toBe("QUOTA_EXCEEDED");
    repo.updateTenant(tenantId, { monthly_quota: t.monthly_quota });
    // 上限を戻せば再依頼で生成される
    requestLook(tenantId, m.id, outer.id, bottoms.id);
    await drainForTest();
    expect(repo.getLook(tenantId, look.id)!.status).toBe("ready");
  });

  it("他テナントの商品は取得できない", () => {
    const other = repo.createTenant({ slug: "other", name: "他社", monthly_quota: 10 });
    const p = repo.listProducts(tenantId)[0];
    expect(repo.getProduct(other.id, p.id)).toBeNull();
    expect(repo.listProducts(other.id)).toHaveLength(0);
  });
});

describe("部品", () => {
  it("パスワードのハッシュと照合", () => {
    const h = hashPassword("secret-pass");
    expect(verifyPassword("secret-pass", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });

  it("仮エンジンの描画は色と形を反映する", () => {
    const svg = renderLookSvg(
      { height_cm: 170, body_type: "standard", skin_hex: "#e6c09c", hair_hex: "#222222", hair_style: "short" },
      { style: "coat", color_hex: "#123456" },
      { style: "wide", color_hex: "#654321" },
    );
    expect(svg).toContain("#123456");
    expect(svg).toContain("#654321");
    expect(renderGarmentSvg({ category: "outer", style: "jacket", color_hex: "#abcdef" })).toContain("#abcdef");
    expect(shade("#808080", -1)).toBe("#000000");
    expect(shade("#808080", 1)).toBe("#ffffff");
  });

  it("色に不正な値が来ても描画に混ざらない", () => {
    const svg = renderLookSvg(
      { height_cm: 170, body_type: "standard", skin_hex: '"/><script>', hair_hex: "#222222", hair_style: "short" },
      { style: "jacket", color_hex: '"><script>alert(1)</script>' },
      null,
    );
    expect(svg).not.toContain("<script");
  });

  it("商品URLは http(s) のみ通す", () => {
    expect(safeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("not a url")).toBe("");
  });

  it("保存キーでフォルダの外に出られない", () => {
    expect(() => resolveKey("../etc/passwd")).toThrow();
    expect(() => resolveKey("tenants/../../x")).toThrow();
  });

  it("レート制限", () => {
    const k = "test-" + Math.random();
    for (let i = 0; i < 3; i++) expect(rateLimited(k, 3, 60_000)).toBe(false);
    expect(rateLimited(k, 3, 60_000)).toBe(true);
  });

  it("エンジン未設定の openai は分かるエラーで止まる", async () => {
    delete process.env.OPENAI_API_KEY;
    const m = repo.listModels(tenantId)[0];
    await expect(getEngine("openai").generate({ model: m, outer: null, bottoms: null })).rejects.toMatchObject({
      code: "ENGINE_NOT_CONFIGURED",
    });
  });
});
