import { handle, json, error } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  name: z.string().optional(),
  shortDesc: z.string().optional(),
  description: z.string().optional(),
  line: z.string().optional(),
  gender: z.string().optional(),
  activity: z.string().optional(),
  basePrice: z.number().optional(),
  salePrice: z.number().nullable().optional(),
  status: z.string().optional(),
  isNew: z.boolean().optional()
});

export const GET = handle(async (req: Request) => {
  await requireAdmin();
  const id = new URL(req.url).pathname.split("/").pop()!;
  const p = await prisma.product.findUnique({
    where: { id },
    include: { variants: true, images: true, categories: true, collections: true }
  });
  if (!p) return error(404, "No encontrado");
  return json(p);
});

export const PATCH = handle(async (req: Request) => {
  await requireAdmin();
  const id = new URL(req.url).pathname.split("/").pop()!;
  const data = schema.parse(await req.json());
  const p = await prisma.product.update({ where: { id }, data });
  return json({ ok: true, product: p });
});

export const DELETE = handle(async (req: Request) => {
  await requireAdmin();
  const id = new URL(req.url).pathname.split("/").pop()!;
  await prisma.product.delete({ where: { id } });
  return json({ ok: true });
});
