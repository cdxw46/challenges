import { redirect } from "next/navigation";
import { BarChart3, Boxes, CreditCard, PackageCheck, Shield, Users } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";

const stats = [
  { label: "Ventas hoy", value: "€3.240", icon: CreditCard },
  { label: "Pedidos activos", value: "18", icon: PackageCheck },
  { label: "Clientes nuevos", value: "42", icon: Users },
  { label: "Conversion", value: "3.9%", icon: BarChart3 },
];

const alerts = [
  "4 variantes con stock bajo.",
  "1 solicitud de devolucion pendiente.",
  "Stripe y PayPal listos para activar con credenciales reales.",
];

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (!user || !["ADMIN", "SUPERADMIN"].includes(user.role)) {
    redirect("/cuenta");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "white", padding: "40px 24px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 24 }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "center",
            padding: 24,
            borderRadius: 28,
            background: "linear-gradient(135deg, rgba(83,74,183,.28), rgba(18,18,24,.92))",
            border: "1px solid rgba(255,255,255,.08)",
          }}
        >
          <div>
            <p style={{ margin: 0, opacity: 0.7, textTransform: "uppercase", letterSpacing: ".18em", fontSize: 12 }}>
              SMURFX Admin
            </p>
            <h1 style={{ margin: "10px 0 0", fontSize: "clamp(2rem, 5vw, 3.25rem)" }}>Operacion central.</h1>
            <p style={{ margin: "10px 0 0", maxWidth: 720, color: "rgba(255,255,255,.72)" }}>
              Dashboard inicial para control de ventas, catalogo, pedidos, clientes y seguridad. Preparado para crecer
              sobre el mismo modelo de datos ya conectado a PostgreSQL.
            </p>
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 16px",
              borderRadius: 999,
              background: "rgba(255,255,255,.08)",
            }}
          >
            <Shield size={18} />
            2FA / RBAC ready
          </div>
        </header>

        <section style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {stats.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.label}
                style={{
                  padding: 22,
                  borderRadius: 24,
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.08)",
                  display: "grid",
                  gap: 12,
                }}
              >
                <Icon size={18} />
                <span style={{ color: "rgba(255,255,255,.62)", fontSize: 13 }}>{item.label}</span>
                <strong style={{ fontSize: 32 }}>{item.value}</strong>
              </article>
            );
          })}
        </section>

        <section style={{ display: "grid", gap: 18, gridTemplateColumns: "1.3fr 1fr" }}>
          <article
            style={{
              padding: 24,
              borderRadius: 28,
              background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.08)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Modulos disponibles</h2>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              {[
                ["Catalogo", "Productos, variantes, imagenes y stock.", Boxes],
                ["Pedidos", "Estados, pagos, tracking y devoluciones.", PackageCheck],
                ["Clientes", "Perfiles, Members y favoritos.", Users],
                ["Analitica", "KPIs y lectura operativa.", BarChart3],
              ].map(([title, copy, IconComponent]) => {
                const Icon = IconComponent as typeof Boxes;
                return (
                  <div
                    key={title}
                    style={{
                      padding: 18,
                      borderRadius: 20,
                      background: "rgba(255,255,255,.04)",
                      border: "1px solid rgba(255,255,255,.06)",
                    }}
                  >
                    <Icon size={18} />
                    <h3>{title}</h3>
                    <p style={{ color: "rgba(255,255,255,.68)", marginBottom: 0 }}>{copy}</p>
                  </div>
                );
              })}
            </div>
          </article>

          <article
            style={{
              padding: 24,
              borderRadius: 28,
              background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.08)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Alertas</h2>
            <ul style={{ paddingLeft: 18, color: "rgba(255,255,255,.76)", lineHeight: 1.7 }}>
              {alerts.map((alert) => (
                <li key={alert}>{alert}</li>
              ))}
            </ul>
          </article>
        </section>
      </div>
    </div>
  );
}
