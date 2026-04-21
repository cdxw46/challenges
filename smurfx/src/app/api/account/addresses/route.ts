import { handle, json, error } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  addressLine: z.string().min(1),
  addressLine2: z.string().optional().nullable(),
  city: z.string().min(1),
  region: z.string().min(1),
  postalCode: z.string().min(3),
  country: z.string().min(2),
  phone: z.string().optional().nullable(),
  isDefault: z.boolean().optional()
});

export const GET = handle(async () => {
  const user = await getCurrentUser();
  if (!user) return error(401, "No autenticado");
  const addresses = await prisma.address.findMany({ where: { userId: user.id } });
  return json({ addresses });
});

export const POST = handle(async (req) => {
  const user = await getCurrentUser();
  if (!user) return error(401, "No autenticado");
  const data = schema.parse(await req.json());
  if (data.isDefault) {
    await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  }
  const a = await prisma.address.create({ data: { ...data, userId: user.id } });
  return json({ address: a });
});

export const DELETE = handle(async (req) => {
  const user = await getCurrentUser();
  if (!user) return error(401, "No autenticado");
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return error(400, "id requerido");
  await prisma.address.deleteMany({ where: { id, userId: user.id } });
  return json({ ok: true });
});
