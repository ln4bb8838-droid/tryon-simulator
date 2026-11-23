export type Category = "outer" | "bottoms";
export const CATEGORY_LABEL: Record<Category, string> = { outer: "アウター", bottoms: "パンツ" };

export const OUTER_STYLES = ["jacket", "coat", "blouson"] as const;
export const BOTTOM_STYLES = ["straight", "wide", "slim", "shorts"] as const;
export type OuterStyle = (typeof OUTER_STYLES)[number];
export type BottomStyle = (typeof BOTTOM_STYLES)[number];
export const STYLE_LABEL: Record<string, string> = {
  jacket: "ジャケット",
  coat: "ロングコート",
  blouson: "ブルゾン",
  straight: "ストレート",
  wide: "ワイド",
  slim: "スリム",
  shorts: "ショーツ",
};

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  monthly_quota: number;
  engine_id: string | null;
}

export interface User {
  id: string;
  tenant_id: string | null;
  email: string;
  role: "system_admin" | "tenant_admin" | "member";
}

export interface Product {
  id: string;
  tenant_id: string;
  external_code: string;
  name: string;
  category: Category;
  style: string;
  tagline: string;
  description: string;
  features: string[];
  color_name: string;
  color_hex: string;
  fit: string;
  material: string;
  care: string;
  sizes: string[];
  price_jpy: number;
  product_url: string;
  image_key: string | null;
  is_published: boolean;
  sort_order: number;
}

export interface Model {
  id: string;
  tenant_id: string;
  name: string;
  height_cm: number;
  size_worn: string;
  body_type: "slim" | "standard" | "broad";
  skin_hex: string;
  hair_hex: string;
  hair_style: "short" | "long" | "bun";
  image_key: string | null;
  is_active: boolean;
  sort_order: number;
}

export type LookStatus = "queued" | "running" | "ready" | "failed";

export interface Look {
  id: string;
  tenant_id: string;
  model_id: string;
  outer_id: string | null;
  bottom_id: string | null;
  combo_key: string;
  status: LookStatus;
  engine_id: string | null;
  image_key: string | null;
  error_code: string | null;
  latency_ms: number | null;
  attempts: number;
  source: "pregenerate" | "on_demand";
  generated_at: string | null;
}

export const EVENT_TYPES = ["room_view", "look_view", "product_select", "detail_open", "product_link", "add_to_cart"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_LABEL: Record<EventType, string> = {
  room_view: "試着室の表示",
  look_view: "組み合わせの表示",
  product_select: "商品の選択",
  detail_open: "詳細の表示",
  product_link: "商品ページへ移動",
  add_to_cart: "カートに入れる",
};

export const ERROR_LABEL: Record<string, string> = {
  QUOTA_EXCEEDED: "今月の生成上限に達しました",
  ENGINE_ERROR: "生成エンジンでエラーが起きました",
  ENGINE_NOT_CONFIGURED: "生成エンジンの設定（APIキー）がありません",
  ENGINE_INPUT_UNSUPPORTED: "このエンジンでは使えない画像形式です（PNG/JPEGが必要）",
  TIMEOUT: "時間内に生成が終わりませんでした",
  PRODUCT_UNAVAILABLE: "商品が非公開または削除されています",
};
