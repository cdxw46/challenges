import { NextRequest } from "next/server";

export const runtime = "nodejs";

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const line = url.searchParams.get("line") || "SMURFX";
  const color = url.searchParams.get("color") || "#534AB7";
  const n = Number(url.searchParams.get("n") || 0);
  const seed = url.searchParams.get("seed") || line;
  const w = 800;
  const h = 1000;
  const accent = "#0a0a0a";
  const r = 120 + (hash(seed) % 80);
  const cx = 400 + (n === 1 ? 60 : -30);
  const cy = 520 + (hash(seed + n) % 60);
  const angle = (hash(seed) % 30) - 15;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f7f6fb"/>
      <stop offset="100%" stop-color="#e9e7f6"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <g transform="translate(${cx} ${cy}) rotate(${angle})">
    <ellipse cx="0" cy="${r * 0.35}" rx="${r * 1.7}" ry="${r * 0.18}" fill="#000" opacity="0.08"/>
    <path d="M -${r * 1.6} 0 Q -${r * 1.4} -${r * 0.7}, -${r * 0.6} -${r * 0.9}
             T ${r * 0.8} -${r * 0.85} Q ${r * 1.6} -${r * 0.5}, ${r * 1.6} -${r * 0.05}
             Q ${r * 1.5} ${r * 0.25}, ${r * 1.2} ${r * 0.32}
             L -${r * 1.4} ${r * 0.32}
             Q -${r * 1.7} ${r * 0.25}, -${r * 1.6} 0 Z"
          fill="${color}"/>
    <path d="M -${r * 1.4} ${r * 0.22} L ${r * 1.4} ${r * 0.22}" stroke="${accent}" stroke-width="6" opacity="0.8"/>
    <circle cx="${r * 0.55}" cy="-${r * 0.45}" r="${r * 0.18}" fill="${accent}" opacity="0.85"/>
    <path d="M -${r * 0.6} -${r * 0.3} L ${r * 0.2} -${r * 0.55}" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
    <path d="M -${r * 0.9} -${r * 0.1} L ${r * 0.4} -${r * 0.35}" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.4"/>
  </g>
  <g font-family="Helvetica, Arial, sans-serif" font-weight="800" fill="#0a0a0a">
    <text x="60" y="120" font-size="48" letter-spacing="6">${line.toUpperCase()}</text>
    <text x="60" y="160" font-size="20" letter-spacing="4" opacity="0.6">SMURFX</text>
  </g>
</svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
