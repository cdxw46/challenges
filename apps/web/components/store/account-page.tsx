"use client";

import Link from "next/link";
import { Award, MapPin, ShoppingBag, User } from "lucide-react";

import type { AccountOverview } from "@/lib/catalog";

type AccountPageProps = {
  account: AccountOverview | null;
};

export function AccountPage({ account }: AccountPageProps) {
  if (!account) {
    return (
      <div className="page-shell page-stack">
        <section className="listing-hero">
          <div>
            <span className="section-eyebrow">Cuenta</span>
            <h1>Accede a tu cuenta SMURFX.</h1>
            <p>Inicia sesion para ver pedidos, direcciones, favoritos y tu nivel Members.</p>
          </div>
        </section>
        <section className="card static-page-card">
          <div className="static-page-body">
            <div className="static-columns">
              <form className="mini-form" action="/api/auth/login" method="post">
                <h2>Entrar</h2>
                <input name="email" type="email" placeholder="Email" required />
                <input name="password" type="password" placeholder="Contrasena" required />
                <button type="submit" className="primary-action">Iniciar sesion</button>
              </form>
              <form className="mini-form" action="/api/auth/register" method="post">
                <h2>Crear cuenta</h2>
                <input name="firstName" placeholder="Nombre" required />
                <input name="lastName" placeholder="Apellidos" required />
                <input name="email" type="email" placeholder="Email" required />
                <input name="password" type="password" placeholder="Contrasena" required />
                <button type="submit" className="secondary-action">Crear cuenta</button>
              </form>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell page-stack">
      <section className="listing-hero">
        <div>
          <span className="section-eyebrow">Cuenta</span>
          <h1>
            {account.firstName} {account.lastName}
          </h1>
          <p>Dashboard con pedidos recientes, direcciones guardadas y progreso SmurfX Members.</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="secondary-action">
            Cerrar sesion
          </button>
        </form>
      </section>

      <section className="collection-grid">
        <article className="collection-card">
          <div className="collection-body">
            <span className="section-eyebrow">Members</span>
            <h3>{account.memberTier}</h3>
            <p>{account.memberPoints} puntos acumulados.</p>
            <div className="inline-meta">
              <Award size={16} /> Historial reciente disponible abajo.
            </div>
          </div>
        </article>
        <article className="collection-card">
          <div className="collection-body">
            <span className="section-eyebrow">Pedidos</span>
            <h3>{account.orders.length}</h3>
            <p>Pedidos recientes con estado y total.</p>
            <div className="inline-meta">
              <ShoppingBag size={16} /> Preparando, enviado, entregado y devuelto.
            </div>
          </div>
        </article>
        <article className="collection-card">
          <div className="collection-body">
            <span className="section-eyebrow">Direcciones</span>
            <h3>{account.addresses.length}</h3>
            <p>Gestiona envios, billing y preferencias de contacto.</p>
            <div className="inline-meta">
              <MapPin size={16} /> CRUD listo sobre tu perfil.
            </div>
          </div>
        </article>
        <article className="collection-card">
          <div className="collection-body">
            <span className="section-eyebrow">Perfil</span>
            <h3>{account.email}</h3>
            <p>Seguridad, datos personales y preferencias.</p>
            <div className="inline-meta">
              <User size={16} /> 2FA y verificaciones preparadas.
            </div>
          </div>
        </article>
      </section>

      <section className="card static-page-card">
        <div className="static-page-body">
          <h2>Pedidos recientes</h2>
          {account.orders.length ? (
            <div className="order-list">
              {account.orders.map((order) => (
                <div key={order.id} className="order-row">
                  <div>
                    <strong>{order.number}</strong>
                    <p className="muted">{order.status}</p>
                  </div>
                  <div className="muted">
                    {order.itemCount} items · {order.total}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Aun no hay pedidos reales para esta cuenta.</p>
          )}
        </div>
      </section>

      <section className="card static-page-card">
        <div className="static-page-body">
          <h2>Direcciones guardadas</h2>
          {account.addresses.length ? (
            <div className="static-columns">
              {account.addresses.map((address) => (
                <div key={address.id}>
                  <strong>
                    {address.firstName} {address.lastName}
                  </strong>
                  <p className="muted">
                    {address.line1}
                    <br />
                    {address.postalCode} {address.city}, {address.province}
                    <br />
                    {address.country}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No hay direcciones guardadas todavia.</p>
          )}
        </div>
      </section>

      <section className="card static-page-card">
        <div className="static-page-body">
          <h2>Favoritos</h2>
          {account.wishlists.length ? (
            <div className="link-list">
              {account.wishlists.map((item) => (
                <Link key={item.product.slug} href={`/producto/${item.product.slug}`}>
                  {item.product.name}
                </Link>
              ))}
            </div>
          ) : (
            <p className="muted">Aun no has guardado favoritos.</p>
          )}
        </div>
      </section>
    </div>
  );
}
