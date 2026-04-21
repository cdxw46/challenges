import { NextResponse } from "next/server";
import { z } from "zod";

import { loginWithEmail } from "@/lib/auth";

const schema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const user = await loginWithEmail(body.email, body.password);

    if (!user) {
      return NextResponse.json({ error: "Credenciales invalidas." }, { status: 401 });
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo iniciar sesion." },
      { status: 400 },
    );
  }
}
