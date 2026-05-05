import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Page() {
  const items = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <div className="p-8">
      <h1 className="h-display text-3xl">Cupones</h1>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-ink/10">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-xs uppercase tracking-wider text-ink/60">
            <tr>
              <th className="px-4 py-3 text-left">Código</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-left">Valor</th>
              <th className="px-4 py-3 text-left">Mín. subtotal</th>
              <th className="px-4 py-3 text-left">Usos</th>
              <th className="px-4 py-3 text-left">Activo</th>
              <th className="px-4 py-3 text-left">Creado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-t border-ink/5">
                <td className="px-4 py-3 font-bold">{c.code}</td>
                <td className="px-4 py-3 capitalize">{c.type.replace("_", " ")}</td>
                <td className="px-4 py-3">{c.type === "percentage" ? `${c.value}%` : `${c.value}€`}</td>
                <td className="px-4 py-3">{c.minSubtotal ? `${c.minSubtotal}€` : "—"}</td>
                <td className="px-4 py-3">{c.uses}{c.maxUses ? ` / ${c.maxUses}` : ""}</td>
                <td className="px-4 py-3">{c.active ? "Sí" : "No"}</td>
                <td className="px-4 py-3 text-xs text-ink/60">{formatDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
