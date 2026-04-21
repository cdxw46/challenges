import Link from "next/link";
import { formatPrice, formatDate } from "@/lib/format";
import { BRAND, levelForPoints } from "@/lib/brand";

export function AccountDashboard({
  user,
  orders
}: {
  user: any;
  orders: { id: string; number: string; status: string; total: number; createdAt: string }[];
}) {
  const lvl = levelForPoints(user.membersPoints);
  const next = BRAND.members.levels.find((l) => l.min > user.membersPoints);
  const progress = next
    ? Math.min(100, Math.round(((user.membersPoints - lvl.min) / (next.min - lvl.min)) * 100))
    : 100;
  return (
    <div className="container-x grid gap-8 py-10 md:grid-cols-[260px_1fr]">
      <Sidebar />
      <div>
        <h1 className="h-display text-3xl">Hola, {user.firstName}</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-ink/10 p-5">
            <div className="text-xs font-bold uppercase tracking-widest text-ink/60">SmurfX Members</div>
            <div className="mt-1 text-2xl font-extrabold capitalize">{lvl.label}</div>
            <div className="mt-1 text-xs text-ink/60">{user.membersPoints} pts</div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full bg-smurf-500" style={{ width: `${progress}%` }} />
            </div>
            {next && (
              <div className="mt-1 text-xs text-ink/60">
                {next.min - user.membersPoints} pts para {next.label}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-ink/10 p-5">
            <div className="text-xs font-bold uppercase tracking-widest text-ink/60">Pedidos</div>
            <div className="mt-1 text-2xl font-extrabold">{orders.length}</div>
            <div className="mt-1 text-xs text-ink/60">en tu historial</div>
          </div>
          <div className="rounded-2xl border border-ink/10 p-5">
            <div className="text-xs font-bold uppercase tracking-widest text-ink/60">Talla guardada</div>
            <div className="mt-1 text-2xl font-extrabold">{user.savedSize || "—"}</div>
            <div className="mt-1 text-xs text-ink/60">Edita tu perfil para ajustarla</div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-extrabold uppercase tracking-wider">Pedidos recientes</h2>
          {orders.length === 0 ? (
            <p className="mt-3 text-sm text-ink/60">Aún no tienes pedidos. <Link href="/hombre" className="text-smurf-600">Empieza a comprar</Link></p>
          ) : (
            <ul className="mt-3 divide-y divide-ink/10 rounded-2xl border border-ink/10">
              {orders.map((o) => (
                <li key={o.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-4 text-sm">
                  <div>
                    <div className="font-bold">{o.number}</div>
                    <div className="text-xs text-ink/60">{formatDate(o.createdAt)}</div>
                  </div>
                  <span className="rounded-full bg-smurf-50 px-2 py-0.5 text-xs font-bold uppercase text-smurf-700">
                    {o.status}
                  </span>
                  <span className="font-bold">{formatPrice(o.total)}</span>
                  <Link href={`/cuenta/pedidos/${o.number}`} className="text-xs font-semibold text-smurf-600">
                    Ver →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const links = [
    { href: "/cuenta", label: "Resumen" },
    { href: "/cuenta/pedidos", label: "Mis pedidos" },
    { href: "/cuenta/direcciones", label: "Mis direcciones" },
    { href: "/cuenta/favoritos", label: "Favoritos" },
    { href: "/cuenta/perfil", label: "Mis datos" },
    { href: "/cuenta/members", label: "SmurfX Members" }
  ];
  return (
    <aside>
      <ul className="space-y-1 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex rounded-lg px-3 py-2 font-semibold text-ink/85 hover:bg-ink/5"
            >
              {l.label}
            </Link>
          </li>
        ))}
        <li className="pt-3">
          <form action="/api/auth/logout" method="post">
            <button className="text-xs font-semibold uppercase tracking-wider text-ink/60 hover:text-ink">
              Cerrar sesión
            </button>
          </form>
        </li>
      </ul>
    </aside>
  );
}
