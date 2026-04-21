import { NextResponse } from "next/server";
import { z } from "zod";

import { createVerificationToken, registerWithEmail } from "@/lib/auth";

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  birthDate: z.string().optional(),
});

async function parsePayload(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return registerSchema.parse(await request.json());
  }

  const form = await request.formData();
  return registerSchema.parse({
    email: form.get("email"),
    password: form.get("password"),
    firstName: form.get("firstName"),
    lastName: form.get("lastName"),
    birthDate: form.get("birthDate") || undefined,
  });
}

export async function POST(request: Request) {
  try {
    const payload = await parsePayload(request);
    const user = await registerWithEmail({
      email: payload.email.toLowerCase(),
      password: payload.password,
      firstName: payload.firstName,
      lastName: payload.lastName,
      birthDate: payload.birthDate,
    });

    const verificationToken = await createVerificationToken(user.id);

    const accept = request.headers.get("accept") || "";
    if (accept.includes("text/html")) {
      return NextResponse.redirect(new URL("/cuenta", request.url));
    }

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
  } catch (error) {
    const accept = request.headers.get("accept") || "";
    if (accept.includes("text/html")) {
      return NextResponse.redirect(new URL("/cuenta?error=register", request.url));
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear la cuenta." },
      { status: 400 },
    );
  }
}
