// 仮エンジン用の描画。外部AIを使わずに「モデルが服を着た姿」をSVGで描く。
// 本物の画像生成エンジンに差し替えるまでの、画面と運用フローの確認用。

import type { BottomStyle, Model, OuterStyle, Product } from "../types";

type Pt = [number, number];
const CX = 300; // 体の中心線
const FLOOR = 950; // 足元のY座標

/** 色を明るく(+)/暗く(-)する。amount は -1〜1 */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x888888;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)),
  );
  return "#" + ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("");
}

export function safeHex(hex: string | undefined, fallback: string): string {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback;
}

const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [2 * CX - x, y]);
const poly = (pts: Pt[]) => "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L") + " Z";
/** 左半分の点列（上から下）を、右半分を鏡写しにして一つの閉じた形にする */
const symmetric = (left: Pt[]) => poly([...left, ...mirror(left).reverse()]);

function gradient(id: string, base: string): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${shade(base, 0.12)}"/><stop offset="0.55" stop-color="${base}"/><stop offset="1" stop-color="${shade(base, -0.18)}"/></linearGradient>`;
}

// ---- 体 ----
const ARM_L: Pt[] = [
  [234, 214], [214, 258], [206, 362], [200, 470], [197, 508], [221, 510], [226, 372], [240, 290],
];
const LEG_L: Pt[] = [[252, 520], [250, 600], [256, 720], [262, 922], [290, 922], [296, 640], [300, 590]];

function body(m: Pick<Model, "skin_hex" | "hair_hex" | "hair_style">): string {
  const skin = safeHex(m.skin_hex, "#e8c4a0");
  const hair = safeHex(m.hair_hex, "#2b2118");
  const skinDark = shade(skin, -0.12);
  const hairBack =
    m.hair_style === "long"
      ? `<path d="M258,120 Q256,70 300,66 Q344,70 342,120 L350,250 Q300,270 250,250 Z" fill="${shade(hair, -0.1)}"/>`
      : m.hair_style === "bun"
        ? `<circle cx="300" cy="70" r="22" fill="${hair}"/>`
        : "";
  return `
${hairBack}
<path d="${poly(ARM_L)}" fill="${skinDark}"/><path d="${poly(mirror(ARM_L))}" fill="${skinDark}"/>
<ellipse cx="209" cy="526" rx="13" ry="20" fill="${skin}"/><ellipse cx="391" cy="526" rx="13" ry="20" fill="${skin}"/>
<path d="${poly(LEG_L)}" fill="${skinDark}"/><path d="${poly(mirror(LEG_L))}" fill="${skinDark}"/>
<rect x="286" y="160" width="28" height="48" rx="8" fill="${skinDark}"/>
<ellipse cx="300" cy="128" rx="37" ry="47" fill="${skin}"/>
<path d="M263,122 Q262,78 300,76 Q338,78 337,122 Q328,96 300,94 Q272,96 263,122 Z" fill="${hair}"/>
<ellipse cx="272" cy="937" rx="30" ry="13" fill="#2a2a2e"/><ellipse cx="328" cy="937" rx="30" ry="13" fill="#2a2a2e"/>`;
}

// ---- 下に着ている白Tシャツ（常に着用） ----
const TEE_L: Pt[] = [
  [284, 198], [262, 204], [236, 212], [219, 236], [213, 292], [243, 298], [247, 340], [246, 470], [244, 505],
];
function tee(): string {
  return `<path d="${symmetric(TEE_L)}" fill="#f7f6f2" stroke="#d9d6cf" stroke-width="2"/>
<path d="M284,198 Q300,214 316,198" fill="none" stroke="#d9d6cf" stroke-width="3"/>`;
}

// ---- パンツ ----
const BOTTOM_SHAPES: Record<BottomStyle, Pt[]> = {
  straight: [[248, 464], [238, 540], [242, 700], [247, 916], [293, 916], [297, 630], [300, 586]],
  wide: [[248, 464], [236, 540], [228, 700], [222, 918], [296, 918], [298, 640], [300, 588]],
  slim: [[248, 464], [240, 540], [250, 700], [257, 912], [289, 912], [295, 630], [300, 586]],
  shorts: [[248, 464], [236, 540], [231, 648], [294, 654], [298, 610], [300, 586]],
};

export function bottomsSvg(p: Pick<Product, "style" | "color_hex">, gid = "gb"): string {
  const style = (p.style in BOTTOM_SHAPES ? p.style : "straight") as BottomStyle;
  const base = safeHex(p.color_hex, "#3b4a63");
  const left = BOTTOM_SHAPES[style];
  const line = shade(base, -0.35);
  const hemY = left[3][1];
  return `<defs>${gradient(gid, base)}</defs>
<path d="${symmetric(left)}" fill="url(#${gid})" stroke="${line}" stroke-width="2" stroke-linejoin="round"/>
<rect x="246" y="462" width="108" height="16" rx="3" fill="${shade(base, -0.1)}" stroke="${line}" stroke-width="1.5"/>
<path d="M300,478 L300,560" stroke="${line}" stroke-width="1.5" opacity="0.7"/>
<path d="M270,560 Q268,${(560 + hemY) / 2} 270,${hemY - 6}" stroke="${shade(base, 0.2)}" stroke-width="2" fill="none" opacity="0.5"/>
<path d="M330,560 Q332,${(560 + hemY) / 2} 330,${hemY - 6}" stroke="${shade(base, 0.2)}" stroke-width="2" fill="none" opacity="0.5"/>`;
}

// ---- アウター ----
const OUTER_HEM: Record<OuterStyle, number> = { jacket: 562, coat: 760, blouson: 492 };
const SLEEVE_L: Pt[] = [[230, 208], [207, 260], [198, 370], [192, 500], [226, 503], [231, 374], [246, 290]];

export function outerSvg(p: Pick<Product, "style" | "color_hex">, gid = "go"): string {
  const style = (p.style in OUTER_HEM ? p.style : "jacket") as OuterStyle;
  const base = safeHex(p.color_hex, "#7a6a55");
  const line = shade(base, -0.38);
  const hem = OUTER_HEM[style];
  const flare = style === "coat" ? 18 : style === "blouson" ? -6 : 4;
  const panelL: Pt[] = [
    [287, 194], [234, 208], [244, 292], [242, 360], [240, 470], [240 - flare, hem], [297, hem], [294, 320],
  ];
  const panelR = mirror(panelL);
  const sleeves = `<path d="${poly(SLEEVE_L)}" fill="url(#${gid})" stroke="${line}" stroke-width="2" stroke-linejoin="round"/>
<path d="${poly(mirror(SLEEVE_L))}" fill="url(#${gid})" stroke="${line}" stroke-width="2" stroke-linejoin="round"/>`;
  const panels = `<path d="${poly(panelL)}" fill="url(#${gid})" stroke="${line}" stroke-width="2" stroke-linejoin="round"/>
<path d="${poly(panelR)}" fill="url(#${gid})" stroke="${line}" stroke-width="2" stroke-linejoin="round"/>`;
  const lapels =
    style === "blouson"
      ? `<path d="M270,196 Q300,214 330,196 L330,186 Q300,204 270,186 Z" fill="${shade(base, -0.12)}" stroke="${line}" stroke-width="1.5"/>`
      : `<path d="M287,194 L258,214 L272,252 L292,318 Z" fill="${shade(base, -0.1)}" stroke="${line}" stroke-width="1.5"/>
<path d="M313,194 L342,214 L328,252 L308,318 Z" fill="${shade(base, -0.1)}" stroke="${line}" stroke-width="1.5"/>`;
  const extras: string[] = [];
  if (style === "blouson") {
    extras.push(`<rect x="238" y="${hem - 18}" width="124" height="18" rx="4" fill="${shade(base, -0.15)}" stroke="${line}" stroke-width="1.5"/>`);
    extras.push(`<rect x="190" y="488" width="38" height="14" rx="3" fill="${shade(base, -0.15)}"/><rect x="372" y="488" width="38" height="14" rx="3" fill="${shade(base, -0.15)}"/>`);
    extras.push(`<path d="M300,206 L300,${hem - 18}" stroke="${shade(base, 0.35)}" stroke-width="2.5"/>`);
  } else {
    const ys = style === "coat" ? [360, 440, 520, 600] : [380, 460];
    for (const y of ys) extras.push(`<circle cx="306" cy="${y}" r="5" fill="${shade(base, -0.3)}"/>`);
    extras.push(`<path d="M248,${style === "coat" ? 520 : 480} L284,${style === "coat" ? 520 : 480}" stroke="${line}" stroke-width="1.5"/>`);
    extras.push(`<path d="M352,${style === "coat" ? 520 : 480} L316,${style === "coat" ? 520 : 480}" stroke="${line}" stroke-width="1.5"/>`);
  }
  if (style === "coat") {
    extras.push(`<rect x="238" y="452" width="124" height="14" fill="${shade(base, -0.12)}" stroke="${line}" stroke-width="1.5"/>`);
  }
  return `<defs>${gradient(gid, base)}</defs>${sleeves}${panels}${lapels}${extras.join("")}`;
}

function frame(inner: string, viewBox: string, bg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${bg}${inner}</svg>`;
}

const STUDIO_BG = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5f2ed"/><stop offset="0.8" stop-color="#e9e4dc"/><stop offset="1" stop-color="#ddd6cb"/></linearGradient>
<radialGradient id="sh" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#000" stop-opacity="0.18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
<rect width="600" height="1000" fill="url(#bg)"/><ellipse cx="300" cy="${FLOOR - 4}" rx="140" ry="22" fill="url(#sh)"/>`;

/** モデル×アウター×パンツの組み合わせを1枚のSVGにする */
export function renderLookSvg(
  model: Pick<Model, "height_cm" | "body_type" | "skin_hex" | "hair_hex" | "hair_style">,
  outer: Pick<Product, "style" | "color_hex"> | null,
  bottoms: Pick<Product, "style" | "color_hex"> | null,
): string {
  const s = Math.max(0.8, Math.min(1.05, model.height_cm / 180));
  const wx = model.body_type === "slim" ? 0.93 : model.body_type === "broad" ? 1.08 : 1;
  const transform = `translate(${CX},${FLOOR}) scale(${(s * wx).toFixed(3)},${s.toFixed(3)}) translate(${-CX},${-FLOOR})`;
  const layers = [
    body(model),
    tee(),
    bottoms ? bottomsSvg(bottoms) : bottomsSvg({ style: "shorts", color_hex: "#9a9a9a" }),
    outer ? outerSvg(outer) : "",
  ].join("");
  return frame(`<g transform="${transform}">${layers}</g>`, "0 0 600 1000", STUDIO_BG);
}

/** 商品の平置き風画像（ゴーストマネキン風） */
export function renderGarmentSvg(p: Pick<Product, "category" | "style" | "color_hex">): string {
  const bg = `<rect x="-1000" y="-1000" width="3000" height="3000" fill="#f3f1ee"/>`;
  if (p.category === "outer") {
    const hem = OUTER_HEM[(p.style in OUTER_HEM ? p.style : "jacket") as OuterStyle];
    const h = hem - 170;
    const w = Math.max(h, 260);
    return frame(outerSvg(p, "g1"), `${CX - w / 2} 170 ${w} ${h + 20}`, bg);
  }
  const left = BOTTOM_SHAPES[(p.style in BOTTOM_SHAPES ? p.style : "straight") as BottomStyle];
  const bottom = left[3][1];
  const h = bottom - 440;
  const w = Math.max(h, 220);
  return frame(bottomsSvg(p, "g1"), `${CX - w / 2} 440 ${w} ${h + 20}`, bg);
}

/** モデル単体（白T＋グレーのショーツ） */
export function renderModelSvg(model: Parameters<typeof renderLookSvg>[0]): string {
  return renderLookSvg(model, null, null);
}
