import { handle, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(2),
  type: z.enum(["percentage", "fixed", "free_shipping"]),
  value: z.number(),
  minSubtotal: z.number().nullable().optional(),
  maxUses: z.number().int().nullable().optional(),
  active: z.boolean().default(true)
});

export const GET = handle(async () => {
  await requireAdmin();
  return json({ items: await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } }) });
});

export const POST = handle(async (req) => {
  await requireAdmin();
  const data = schema.parse(await req.json());
  const c = await prisma.coupon.create({ data: { ...data, code: data.code.toUpperCase() } });
  return json({ ok: true, coupon: c });
});
