import { handle, json, error } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { z } from "zod";

const profileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  savedSize: z.string().optional()
});
const passwordSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(8)
});

export const PATCH = handle(async (req) => {
  const user = await getCurrentUser();
  if (!user) return error(401, "No autenticado");
  const data = profileSchema.parse(await req.json());
  await prisma.user.update({ where: { id: user.id }, data });
  return json({ ok: true });
});

export const POST = handle(async (req) => {
  const user = await getCurrentUser();
  if (!user) return error(401, "No autenticado");
  const data = passwordSchema.parse(await req.json());
  const u = await prisma.user.findUnique({ where: { id: user.id } });
  if (!u || !(await verifyPassword(data.current, u.passwordHash))) {
    return error(400, "Contraseña actual incorrecta");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(data.next) }
  });
  return json({ ok: true });
});
