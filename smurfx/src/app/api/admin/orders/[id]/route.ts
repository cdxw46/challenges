import { handle, json, error } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { sendMail, brandedEmail } from "@/lib/mailer";
import { z } from "zod";

const schema = z.object({
  status: z.string().optional(),
  trackingCarrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  notes: z.string().optional()
});

export const PATCH = handle(async (req: Request) => {
  const admin = await requireAdmin();
  const id = new URL(req.url).pathname.split("/").pop()!;
  const data = schema.parse(await req.json());
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return error(404, "No encontrado");
  const updates: any = { ...data };
  if (data.status && data.status !== order.status) {
    await prisma.orderStatusHistory.create({
      data: {
        orderId: id,
        fromStatus: order.status,
        toStatus: data.status,
        byUserId: admin.id
      }
    });
    if (data.status === "shipped") {
      await sendMail({
        to: order.email,
        subject: `Tu pedido ${order.number} ha sido enviado`,
        html: brandedEmail(
          "Tu pedido va de camino",
          `<p>Pedido <strong>${order.number}</strong>.</p>${
            data.trackingNumber
              ? `<p>Tracking: ${data.trackingCarrier ?? ""} ${data.trackingNumber}</p>`
              : ""
          }`,
          "Ver pedido",
          `${process.env.NEXT_PUBLIC_SITE_URL}/cuenta/pedidos/${order.number}`
        )
      });
    }
    if (data.status === "delivered") {
      await sendMail({
        to: order.email,
        subject: `Pedido ${order.number} entregado`,
        html: brandedEmail(
          "Tu pedido ha llegado",
          `<p>Esperamos que disfrutes de tu compra. Si te apetece, déjanos tu valoración pasados unos días.</p>`,
          "Ver pedido",
          `${process.env.NEXT_PUBLIC_SITE_URL}/cuenta/pedidos/${order.number}`
        )
      });
    }
  }
  const updated = await prisma.order.update({ where: { id }, data: updates });
  return json({ ok: true, order: updated });
});
