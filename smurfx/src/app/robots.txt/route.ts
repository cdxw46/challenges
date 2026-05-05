export function GET() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return new Response(
    `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${base}/sitemap.xml\n`,
    { headers: { "Content-Type": "text/plain" } }
  );
}
