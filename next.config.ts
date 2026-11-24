import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 試着室ページ（/t/...）はECサイトに iframe で埋め込めるようにする。
  // 管理画面は埋め込み不可にしてクリックジャッキングを防ぐ。
  async headers() {
    return [
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
