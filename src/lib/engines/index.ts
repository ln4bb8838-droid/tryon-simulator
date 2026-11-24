// 生成エンジンのアダプタ（仕様 F-JOB-02）。
// エンジンを増やすときは TryOnEngine を実装して ENGINES に登録するだけでよい。

import type { Model, Product } from "../types";
import { getObject, contentTypeFor } from "../storage";
import { renderLookSvg } from "./mock-art";

export interface GenerateInput {
  model: Model;
  outer: Product | null;
  bottoms: Product | null;
}

export interface GenerateOutput {
  data: Buffer;
  ext: "svg" | "png" | "jpg" | "webp";
}

export class EngineError extends Error {
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface TryOnEngine {
  id: string;
  label: string;
  generate(input: GenerateInput): Promise<GenerateOutput>;
}

/** 外部AIを使わない仮エンジン。服の形と色をイラストで重ねる。 */
export const mockEngine: TryOnEngine = {
  id: "mock",
  label: "仮エンジン（イラスト合成・外部AI不要）",
  async generate({ model, outer, bottoms }) {
    const svg = renderLookSvg(model, outer, bottoms);
    return { data: Buffer.from(svg, "utf8"), ext: "svg" };
  },
};

/**
 * OpenAI の画像編集API（gpt-image 系）を使うエンジン。
 * モデル写真と商品画像（PNG/JPEG）を渡し、モデルに商品を着せた画像を作らせる。
 * 注意: このエンジンはAPIキーが無い環境で作ったため未検証。最初の利用時に画質と原価を確認すること。
 */
export const openAiEngine: TryOnEngine = {
  id: "openai",
  label: "OpenAI 画像生成（要APIキー・未検証）",
  async generate({ model, outer, bottoms }) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new EngineError("ENGINE_NOT_CONFIGURED");
    const inputs: { key: string | null; name: string }[] = [
      { key: model.image_key, name: "model" },
      ...(outer ? [{ key: outer.image_key, name: "outer" }] : []),
      ...(bottoms ? [{ key: bottoms.image_key, name: "bottoms" }] : []),
    ];
    const form = new FormData();
    form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-1");
    form.append("size", "1024x1536");
    form.append("prompt", buildPrompt({ model, outer, bottoms }));
    for (const input of inputs) {
      if (!input.key) throw new EngineError("ENGINE_INPUT_UNSUPPORTED", `${input.name} の画像がありません`);
      const type = contentTypeFor(input.key);
      if (!["image/png", "image/jpeg", "image/webp"].includes(type)) throw new EngineError("ENGINE_INPUT_UNSUPPORTED");
      const buf = getObject(input.key);
      if (!buf) throw new EngineError("ENGINE_INPUT_UNSUPPORTED", `${input.name} の画像が見つかりません`);
      form.append("image[]", new Blob([new Uint8Array(buf)], { type }), `${input.name}.${type.split("/")[1]}`);
    }
    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    }).catch((e) => {
      throw new EngineError(e?.name === "TimeoutError" ? "TIMEOUT" : "ENGINE_ERROR", String(e));
    });
    if (!res.ok) throw new EngineError("ENGINE_ERROR", `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new EngineError("ENGINE_ERROR", "画像が返りませんでした");
    return { data: Buffer.from(b64, "base64"), ext: "png" };
  },
};

export function buildPrompt({ model, outer, bottoms }: GenerateInput): string {
  const items = [
    outer && `アウター「${outer.name}」（${outer.color_name}、${outer.material}）`,
    bottoms && `パンツ「${bottoms.name}」（${bottoms.color_name}、${bottoms.material}）`,
  ].filter(Boolean);
  return [
    "Fashion e-commerce try-on image. Dress the person in the first image with the garments from the other images.",
    "Keep the person's face, body shape, pose and the plain studio background unchanged.",
    "Reproduce each garment's exact color, pattern, texture, logo and silhouette. Full body, front view, soft studio lighting.",
    `Model: about ${model.height_cm}cm tall, wearing size ${model.size_worn}.`,
    `Garments: ${items.join(" / ")}`,
  ].join("\n");
}

export const ENGINES: Record<string, TryOnEngine> = {
  [mockEngine.id]: mockEngine,
  [openAiEngine.id]: openAiEngine,
};

export function getEngine(id?: string | null): TryOnEngine {
  const chosen = id || process.env.TRYON_ENGINE || "mock";
  return ENGINES[chosen] ?? mockEngine;
}
