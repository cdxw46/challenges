import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { createSessionForUser, createVerificationToken, hashPassword, setSessionCookies } from "@/lib/auth";

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  birthDate: z.string().optional(),
  marketingOptIn: z.boolean().optional(),
});

export async function POST(request: Request) {
  const payload = registerSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const exists = await db.user.findUnique({ where: { email: payload.data.email.toLowerCase() } });
  if (exists) {
    return NextResponse.json({ error: "El email ya esta registrado" }, { status: 409 });
  }

  const passwordHash = await hashPassword(payload.data.password);
  const user = await db.user.create({
    data: {
      email: payload.data.email.toLowerCase(),
      passwordHash,
      firstName: payload.data.firstName,
      lastName: payload.data.lastName,
      birthDate: payload.data.birthDate ? new Date(payload.data.birthDate) : undefined,
      marketingOptIn: payload.data.marketingOptIn ?? true,
    },
  });

  const session = await createSessionForUser(
    user.id,
    user.role,
    user.email,
    request.headers.get("user-agent"),
    request.headers.get("x-forwarded-for"),
  );
  await setSessionCookies(session.accessToken, session.refreshToken);

  const verificationToken = await createVerificationToken(user.id);

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    verificationToken,
  });
}
