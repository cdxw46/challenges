import { prisma } from "@/lib/prisma";
import { handle, json } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await prisma.$queryRaw`SELECT 1`;
  return json({ ok: true, ts: new Date().toISOString() });
});
