import { handle, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { z } from "zod";
import { slugify } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1),
  shortDesc: z.string().min(1),
  description: z.string().min(1),
  line: z.string(),
  gender: z.string(),
  activity: z.string().optional(),
  basePrice: z.number().positive(),
  salePrice: z.number().nullable().optional(),
  status: z.string().default("draft"),
  isNew: z.boolean().default(false)
});

export const GET = handle(async (req) => {
  await requireAdmin();
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || undefined;
  const items = await prisma.product.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { line: { contains: q } }] } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { variants: true, images: { take: 1 } }
  });
  return json({ items });
});

export const POST = handle(async (req) => {
  await requireAdmin();
  const data = schema.parse(await req.json());
  const slug = `${slugify(data.name)}-${Date.now().toString(36)}`;
  const p = await prisma.product.create({
    data: { ...data, slug }
  });
  return json({ ok: true, product: p });
});
