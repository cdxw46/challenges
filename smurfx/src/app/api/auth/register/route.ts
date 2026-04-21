import { handle, json, error, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { hashPassword, createUserSession, clientIp, getOrCreateGuestId } from "@/lib/auth";
import { mergeGuestCartIntoUserCart } from "@/lib/cart";
import { sendMail, brandedEmail } from "@/lib/mailer";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: z.string().optional(),
  acceptTerms: z.literal(true)
});

export const POST = handle(async (req) => {
  const ip = clientIp();
  const rl = rateLimit("register:" + ip, 8, 60_000);
  if (!rl.ok) return error(429, "Demasiados intentos");
  const body = await req.json();
  const data = schema.parse(body);
  const exists = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (exists) return error(409, "Email ya registrado");
  const user = await prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash: await hashPassword(data.password),
      firstName: data.firstName,
      lastName: data.lastName,
      birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
      verifyToken: Math.random().toString(36).slice(2) + Date.now().toString(36)
    }
  });
  const guestId = getOrCreateGuestId();
  await mergeGuestCartIntoUserCart(user.id, guestId);
  await createUserSession(user.id, user.role);
  const verifyUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/cuenta/verificar?token=${user.verifyToken}`;
  await sendMail({
    to: user.email,
    subject: "Bienvenido a SMURFX — verifica tu email",
    html: brandedEmail(
      `Hola, ${user.firstName}. Bienvenido a SMURFX.`,
      `<p>Solo queda un paso: verifica tu email para acceder a beneficios SmurfX Members.</p>`,
      "Verificar email",
      verifyUrl
    )
  });
  return json({ ok: true, user: { id: user.id, email: user.email, firstName: user.firstName } });
});
