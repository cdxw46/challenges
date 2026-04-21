import { NextResponse } from "next/server";
import { z } from "zod";

import { loginWithEmail } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

async function parsePayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return { data: schema.parse(await request.json()), fromForm: false };
  }

  const formData = await request.formData();
  return {
    data: schema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    }),
    fromForm: true,
  };
}

export async function POST(request: Request) {
  try {
    const { data, fromForm } = await parsePayload(request);
    const user = await loginWithEmail(
      data.email.toLowerCase(),
      data.password,
      request.headers.get("user-agent"),
      request.headers.get("x-forwarded-for"),
    );

    if (!user) {
      if (fromForm) {
        return NextResponse.redirect(new URL("/cuenta?error=login", request.url), 303);
      }
      return NextResponse.json({ error: "Credenciales invalidas." }, { status: 401 });
    }

    if (fromForm) {
      return NextResponse.redirect(new URL("/cuenta", request.url), 303);
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    if ((request.headers.get("content-type") ?? "").includes("application/json")) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se pudo iniciar sesion." },
        { status: 400 },
      );
    }

    return NextResponse.redirect(new URL("/cuenta?error=login", request.url), 303);
  }
}
