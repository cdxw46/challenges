import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/account/dashboard";
import { BRAND, levelForPoints } from "@/lib/brand";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/cuenta/login?next=/cuenta/members");
  const tx = await prisma.membersTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30
  });
  const lvl = levelForPoints(user.membersPoints);
  return (
    <div className="container-x grid gap-8 py-10 md:grid-cols-[260px_1fr]">
      <Sidebar />
      <div>
        <h1 className="h-display text-3xl">SmurfX Members</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-ink/10 p-6">
            <div className="text-xs font-bold uppercase tracking-widest text-ink/60">Nivel actual</div>
            <div className="mt-1 text-3xl font-extrabold uppercase">{lvl.label}</div>
            <div className="mt-1 text-sm text-ink/60">{user.membersPoints} pts acumulados</div>
          </div>
          <div className="rounded-2xl border border-ink/10 p-6">
            <div className="text-xs font-bold uppercase tracking-widest text-ink/60">Niveles</div>
            <ul className="mt-2 space-y-1 text-sm">
              {BRAND.members.levels.map((l) => (
                <li key={l.key} className={`flex justify-between ${l.key === lvl.key ? "font-bold text-smurf-700" : ""}`}>
                  <span className="capitalize">{l.label}</span>
                  <span>{l.min}+ pts</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <h2 className="mt-10 text-lg font-extrabold uppercase tracking-wider">Historial de puntos</h2>
        <ul className="mt-3 divide-y divide-ink/10 rounded-2xl border border-ink/10">
          {tx.length === 0 && <li className="px-4 py-3 text-sm text-ink/60">Sin movimientos por ahora.</li>}
          {tx.map((t) => (
            <li key={t.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3 text-sm">
              <span className="capitalize">{t.reason}</span>
              <span className="text-xs text-ink/60">{formatDateTime(t.createdAt)}</span>
              <span className={`font-bold ${t.points >= 0 ? "text-smurf-600" : "text-red-600"}`}>
                {t.points >= 0 ? "+" : ""}
                {t.points} pts
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
