import { handle, json, error } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sendMail, brandedEmail } from "@/lib/mailer";

const schema = z.object({ email: z.string().email() });

export const POST = handle(async (req) => {
  const ct = req.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? schema.parse(await req.json())
    : schema.parse(Object.fromEntries(await req.formData()));
  await prisma.newsletter.upsert({
    where: { email: data.email.toLowerCase() },
    update: {},
    create: { email: data.email.toLowerCase() }
  });
  await sendMail({
    to: data.email,
    subject: "Bienvenido al newsletter SMURFX",
    html: brandedEmail(
      "Estás dentro",
      `<p>Gracias por unirte. Recibirás novedades, lanzamientos y ofertas exclusivas para SmurfX Members.</p>`
    )
  });
  if (ct.includes("application/json")) return json({ ok: true });
  return new Response(null, { status: 303, headers: { Location: "/?newsletter=ok" } });
});
