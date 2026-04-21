import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim();
  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q } },
            { firstName: { contains: q } },
            { lastName: { contains: q } }
          ]
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { orders: true } } }
  });
  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="h-display text-3xl">Clientes</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q || ""} placeholder="Buscar por email o nombre" className="input-base w-64" />
          <button className="btn-secondary">Buscar</button>
        </form>
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-ink/10">
        <table className="w-full text-sm">
          <thead className="bg-ink/5 text-xs uppercase tracking-wider text-ink/60">
            <tr>
              <th className="px-4 py-3 text-left">Cliente</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Members</th>
              <th className="px-4 py-3 text-left">Pedidos</th>
              <th className="px-4 py-3 text-left">Alta</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-ink/5">
                <td className="px-4 py-3 font-bold">{u.firstName} {u.lastName}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3 capitalize">{u.membersLevel} · {u.membersPoints} pts</td>
                <td className="px-4 py-3">{u._count.orders}</td>
                <td className="px-4 py-3 text-xs text-ink/60">{formatDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
