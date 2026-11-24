"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 生成待ちがある間、数秒ごとに画面を更新する */
export default function AutoRefresh({ active, intervalMs = 2000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}
