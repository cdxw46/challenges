export const runtime = "nodejs";

export async function GET() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1f1c5c"/>
      <stop offset="55%" stop-color="#534AB7"/>
      <stop offset="100%" stop-color="#cecbf6"/>
    </linearGradient>
    <radialGradient id="spot" cx="70%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#g)"/>
  <rect width="1920" height="1080" fill="url(#spot)"/>
  <g opacity="0.18" stroke="#fff" stroke-width="1" fill="none">
    <path d="M0 720 Q 480 600 960 720 T 1920 720"/>
    <path d="M0 800 Q 480 680 960 800 T 1920 800"/>
    <path d="M0 880 Q 480 760 960 880 T 1920 880"/>
  </g>
  <g transform="translate(1100 280) rotate(-12)">
    <ellipse cx="0" cy="280" rx="520" ry="60" fill="#000" opacity="0.25"/>
    <path d="M -480 0 Q -420 -240, -200 -280 T 280 -260 Q 480 -180, 480 -40 Q 460 90, 360 110 L -460 110 Q -540 80, -480 0 Z" fill="#0a0a0a"/>
    <path d="M -460 70 L 460 70" stroke="#cecbf6" stroke-width="14" opacity="0.6"/>
    <circle cx="200" cy="-160" r="60" fill="#cecbf6" opacity="0.7"/>
  </g>
</svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400"
    }
  });
}
