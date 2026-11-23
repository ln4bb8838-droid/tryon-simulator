// 組み合わせ画像の生成キュー（仕様 F-FIT-02 / F-JOB-01）。
// MVPではWebサーバーと同じプロセスで動かす。台数を増やす段階で BullMQ 等の別ワーカーに移す。

import { getEngine, EngineError } from "./engines";
import { putObject } from "./storage";
import * as repo from "./repo";
import type { Look } from "./types";

const CONCURRENCY = 2;
const MAX_ATTEMPTS = 3;

const g = globalThis as unknown as { __tryonWorker?: { running: number; started: boolean } };

function state() {
  if (!g.__tryonWorker) g.__tryonWorker = { running: 0, started: false };
  return g.__tryonWorker;
}

/** 生成待ちがあれば処理を始める。何度呼んでもよい。 */
export function kickWorker(): void {
  const s = state();
  if (!s.started) {
    s.started = true;
    repo.resetStuckLooks();
  }
  while (s.running < CONCURRENCY) {
    const look = repo.claimNextQueuedLook();
    if (!look) return;
    s.running++;
    processLook(look)
      .catch((e) => console.error("[generation] unexpected", e))
      .finally(() => {
        s.running--;
        kickWorker();
      });
  }
}

export async function processLook(look: Look): Promise<void> {
  const tenant = repo.getTenant(look.tenant_id);
  const engine = getEngine(tenant?.engine_id);
  if (!tenant || tenant.status !== "active") return repo.failLook(look.id, "PRODUCT_UNAVAILABLE", engine.id);
  if (repo.countGeneratedThisMonth(tenant.id) >= tenant.monthly_quota) {
    return repo.failLook(look.id, "QUOTA_EXCEEDED", engine.id);
  }
  const model = repo.getModel(tenant.id, look.model_id);
  const outer = look.outer_id ? repo.getProduct(tenant.id, look.outer_id) : null;
  const bottoms = look.bottom_id ? repo.getProduct(tenant.id, look.bottom_id) : null;
  if (!model || (look.outer_id && !outer) || (look.bottom_id && !bottoms)) {
    return repo.failLook(look.id, "PRODUCT_UNAVAILABLE", engine.id);
  }
  const started = Date.now();
  try {
    const out = await engine.generate({ model, outer, bottoms });
    const key = `tenants/${tenant.id}/looks/${look.id}-${Date.now()}.${out.ext}`;
    putObject(key, out.data);
    repo.finishLook(look.id, { image_key: key, engine_id: engine.id, latency_ms: Date.now() - started });
  } catch (e) {
    const code = e instanceof EngineError ? e.code : "ENGINE_ERROR";
    console.error(`[generation] look ${look.id} failed: ${code}`, e instanceof Error ? e.message : e);
    const retryable = code === "ENGINE_ERROR" || code === "TIMEOUT";
    if (retryable && look.attempts < MAX_ATTEMPTS) repo.requeueLook(look.id);
    else repo.failLook(look.id, code, engine.id);
  }
}

/** 公開中の商品と有効なモデルの全組み合わせを生成待ちにする。戻り値は新たに積んだ件数 */
export function pregenerateAll(tenantId: string, opts: { force?: boolean } = {}): number {
  const models = repo.listModels(tenantId, { activeOnly: true });
  const outers = [null, ...repo.listProducts(tenantId, { publishedOnly: true, category: "outer" }).map((p) => p.id)];
  const bottoms = repo.listProducts(tenantId, { publishedOnly: true, category: "bottoms" }).map((p) => p.id);
  let queued = 0;
  for (const m of models)
    for (const o of outers)
      for (const b of bottoms) {
        if (repo.upsertQueuedLook(tenantId, m.id, o, b, "pregenerate", opts.force).created) queued++;
      }
  kickWorker();
  return queued;
}

/** 事前生成の対象になる組み合わせの数（アウターなしを含む） */
export function plannedLookCount(tenantId: string): number {
  const models = repo.listModels(tenantId, { activeOnly: true }).length;
  const outers = repo.listProducts(tenantId, { publishedOnly: true, category: "outer" }).length + 1;
  const bottoms = repo.listProducts(tenantId, { publishedOnly: true, category: "bottoms" }).length;
  return models * outers * bottoms;
}

/** 試着室で未生成の組み合わせが選ばれたときに呼ぶ（オンデマンド生成） */
export function requestLook(tenantId: string, modelId: string, outerId: string | null, bottomId: string | null): Look | null {
  const { id } = repo.upsertQueuedLook(tenantId, modelId, outerId, bottomId, "on_demand");
  kickWorker();
  return repo.getLook(tenantId, id);
}

/** テスト用: キューが空になるまで待つ */
export async function drainForTest(timeoutMs = 5000): Promise<void> {
  const until = Date.now() + timeoutMs;
  kickWorker();
  while (Date.now() < until) {
    if (state().running === 0) {
      kickWorker();
      if (state().running === 0) return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("drain timeout");
}
