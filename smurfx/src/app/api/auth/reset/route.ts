import { handle, json, error } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({ token: z.string().min(8), password: z.string().min(8) });

export const POST = handle(async (req) => {
  const { token, password } = schema.parse(await req.json());
  const user = await prisma.user.findFirst({
    where: { resetToken: token, resetTokenExp: { gt: new Date() } }
  });
  if (!user) return error(400, "Token inválido o caducado");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      resetToken: null,
      resetTokenExp: null
    }
  });
  return json({ ok: true });
});
