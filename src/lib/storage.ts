import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths";

// 画像の保存先。MVPはローカルディスク（data/storage）。
// 本番では S3 / Cloudflare R2 に差し替える想定で、読み書きはこのファイル経由に限定する。

const KEY_RE = /^[a-z0-9][a-z0-9/_.-]*$/i;

function root(): string {
  return path.join(dataDir(), "storage");
}

export function resolveKey(key: string): string {
  if (!KEY_RE.test(key) || key.includes("..")) throw new Error("invalid storage key");
  const full = path.join(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new Error("invalid storage key");
  return full;
}

export function putObject(key: string, data: Buffer | string): void {
  const full = resolveKey(key);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, data);
}

export function getObject(key: string): Buffer | null {
  try {
    return fs.readFileSync(resolveKey(key));
  } catch {
    return null;
  }
}

export function deleteObject(key: string): void {
  try {
    fs.unlinkSync(resolveKey(key));
  } catch {
    /* 既に無ければ何もしない */
  }
}

export function contentTypeFor(key: string): string {
  const ext = path.extname(key).toLowerCase();
  return (
    { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[ext] ??
    "application/octet-stream"
  );
}

/** ブラウザから画像を取得するURL */
export function fileUrl(key: string | null | undefined): string | null {
  return key ? `/api/files/${key}` : null;
}
