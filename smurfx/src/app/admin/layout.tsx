import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · SMURFX" };

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/cupones", label: "Cupones" },
  { href: "/admin/contenido", label: "Contenido" }
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/cuenta/login?next=/admin");
  if (!["admin", "superadmin", "editor", "order_manager", "analytics"].includes(user.role)) {
    return (
      <div className="container-x py-20 text-center">
        <h1 className="h-display text-3xl">Acceso restringido</h1>
        <p className="mt-2 text-ink/70">No tienes permisos para acceder al panel.</p>
      </div>
    );
  }
  return (
    <div className="grid min-h-[80vh] md:grid-cols-[240px_1fr]">
      <aside className="border-r border-ink/10 bg-ink p-6 text-white">
        <div className="text-2xl font-extrabold tracking-[0.18em]">
          SMURF<span className="text-smurf-200">X</span>
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-widest text-white/50">Admin</div>
        <nav className="mt-8 space-y-1 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex rounded-md px-3 py-2 font-semibold text-white/80 hover:bg-white/10 hover:text-white"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-10 text-xs text-white/50">
          Sesión: {user.email}
          <form action="/api/auth/logout" method="post" className="mt-2">
            <button className="text-white/80 hover:text-white">Cerrar sesión →</button>
          </form>
        </div>
      </aside>
      <main className="bg-paper">{children}</main>
    </div>
  );
}
