import { handle, json, error, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { verifyPassword, createUserSession, clientIp, getOrCreateGuestId } from "@/lib/auth";
import { mergeGuestCartIntoUserCart } from "@/lib/cart";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const POST = handle(async (req) => {
  const ip = clientIp();
  const rl = rateLimit("login:" + ip, 5, 60_000);
  if (!rl.ok) return error(429, "Demasiados intentos. Inténtalo en un minuto.");
  const data = schema.parse(await req.json());
  const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (!user) return error(401, "Credenciales incorrectas");
  const ok = await verifyPassword(data.password, user.passwordHash);
  if (!ok) {
    await prisma.auditLog.create({
      data: { action: "login_failed", entity: "user", entityId: user.id, ip }
    });
    return error(401, "Credenciales incorrectas");
  }
  const guestId = getOrCreateGuestId();
  await mergeGuestCartIntoUserCart(user.id, guestId);
  await createUserSession(user.id, user.role);
  await prisma.auditLog.create({
    data: { userId: user.id, action: "login", entity: "user", entityId: user.id, ip }
  });
  return json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      role: user.role
    }
  });
});
