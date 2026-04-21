import { handle, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sendMail, brandedEmail } from "@/lib/mailer";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

export const POST = handle(async (req) => {
  const { email } = schema.parse(await req.json());
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (user) {
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExp: new Date(Date.now() + 1000 * 60 * 60) }
    });
    const link = `${process.env.NEXT_PUBLIC_SITE_URL}/cuenta/reset?token=${token}`;
    await sendMail({
      to: user.email,
      subject: "Recupera tu contraseña SMURFX",
      html: brandedEmail(
        "Recupera tu contraseña",
        `<p>Hemos recibido una solicitud para restablecer tu contraseña. Si no fuiste tú, ignora este email.</p>`,
        "Restablecer contraseña",
        link
      )
    });
  }
  return json({ ok: true });
});
