"use client";

import { Award, Gift, Rocket, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";

type Tier = {
  name: string;
  min: number;
  max: number | null;
  benefits: string[];
};

type MembersPageProps = {
  tiers: Tier[];
};

const icons = [Award, Truck, Gift, Rocket];

export function MembersPage({ tiers }: MembersPageProps) {
  return (
    <div className="page-shell page-stack">
      <section className="listing-hero">
        <div>
          <span className="section-eyebrow">SmurfX Members</span>
          <h1>Lealtad con beneficios tangibles.</h1>
          <p>
            Cuatro niveles, recompensas por compra, reviews y cumpleaños, y acceso anticipado a
            lanzamientos clave.
          </p>
        </div>
        <div className="members-calc">
          <strong>Calculadora rápida</strong>
          <p>1 EUR = 10 puntos</p>
          <p>Compra de 180 EUR = 1800 puntos</p>
        </div>
      </section>

      <section className="collection-grid">
        {tiers.map((tier, index) => {
          const Icon = icons[index] ?? Award;
          return (
            <article key={tier.name} className="collection-card">
              <div className="collection-body">
                <span className="section-eyebrow">{tier.name}</span>
                <h3>
                  {tier.min} - {tier.max ?? "5000+"} pts
                </h3>
                <ul className="static-page-list">
                  {tier.benefits.map((benefit) => (
                    <li key={benefit}>
                      <Icon size={16} /> {benefit}
                    </li>
                  ))}
                </ul>
                <Button href="/cuenta">Ver mi nivel</Button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
