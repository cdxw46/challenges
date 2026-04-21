"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Award, ChevronRight, Star } from "lucide-react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import type { AnnouncementView, CollectionView, ProductCardView } from "@/lib/catalog";

type HomePageProps = {
  announcements: AnnouncementView[];
  featuredProducts: ProductCardView[];
  collections: CollectionView[];
};

const categories = [
  {
    title: "Running",
    href: "/hombre?activity=Running",
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Training",
    href: "/mujer?activity=Training",
    image:
      "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Lifestyle",
    href: "/hombre?activity=Lifestyle",
    image:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Trail",
    href: "/coleccion/trail-lab",
    image:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Basketball",
    href: "/sale",
    image:
      "https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&w=1200&q=80",
  },
];

const memberBenefits = [
  "10 puntos por cada euro comprado",
  "Acceso anticipado a lanzamientos",
  "Envio premium en niveles superiores",
  "Regalos y recompensas de cumpleaños",
];

const trustStatements = [
  "Checkout protegido con Stripe y metodos de pago dinamicos.",
  "Envio premium con opciones estandar, express y recogida en punto.",
  "Programa Members listo para activar puntos, niveles y beneficios.",
];

export function HomePage({ announcements, featuredProducts, collections }: HomePageProps) {
  return (
    <div className="space-y-16 pb-16">
      <section className="hero">
        <Image
          src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1800&q=80"
          alt="SMURFX hero"
          fill
          priority
          className="hero-media"
        />
        <div className="hero-overlay" />
        <div className="hero-content">
          <div className="hero-kicker">SMURFX / Move in blue</div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Rinde con precision. Muevete en azul.
          </motion.h1>
          <p>
            Siluetas premium inspiradas en el pulso visual de un flagship global, creadas para
            running, training, trail y lifestyle.
          </p>
          <div className="hero-actions">
            <Button size="lg" href="/coleccion/new-arrivals">
              Comprar lanzamientos
            </Button>
            <Button variant="ghost" size="lg" href="/members">
              Explorar Members
            </Button>
          </div>
          <div className="hero-announcements">
            {announcements.slice(0, 3).map((item) => (
              <div key={item.id} className="hero-chip">
                <span>{item.message}</span>
                {item.ctaHref ? (
                  <Link href={item.ctaHref}>
                    {item.ctaLabel ?? "Ver"} <ChevronRight size={16} />
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="page-shell section-stack">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">Nuevos lanzamientos</span>
            <h2>Lo ultimo en ritmo, control y presencia.</h2>
          </div>
          <Button variant="secondary" href="/coleccion/new-arrivals">
            Ver todos <ArrowRight size={16} />
          </Button>
        </div>
        <div className="horizontal-scroll">
          {featuredProducts.map((product) => (
            <div key={product.id} className="scroll-card">
              <div className="scroll-image">
                <Image src={product.image} alt={product.name} fill className="object-cover" />
              </div>
              <div className="scroll-body">
                <div className="scroll-meta">
                  <span>{product.line}</span>
                  <span>{product.activity}</span>
                </div>
                <h3>{product.name}</h3>
                <p>{product.shortDescription}</p>
                <div className="scroll-actions">
                  <span>{product.priceLabel}</span>
                  <Link href={`/producto/${product.slug}`}>Descubrir</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="page-shell section-stack">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">Categorias</span>
            <h2>Compra por movimiento.</h2>
          </div>
        </div>
        <div className="category-grid">
          {categories.map((category) => (
            <Link key={category.title} href={category.href} className="category-card">
              <Image src={category.image} alt={category.title} fill className="object-cover" />
              <div className="category-overlay" />
              <div className="category-content">
                <span>{category.title}</span>
                <ArrowRight size={18} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="page-shell editorial-banner">
        <div className="editorial-copy">
          <span className="section-eyebrow">Editorial</span>
          <h2>SmurfAir y SmurfTrail llevan la temporada a otro nivel.</h2>
          <p>
            Dos familias creadas para sensaciones opuestas: ligereza y vuelo para asfalto;
            agarre y proteccion para terreno tecnico.
          </p>
          <div className="hero-actions">
            <Button href="/coleccion/blue-motion">
              Ver Blue Motion
            </Button>
            <Button variant="ghost" href="/coleccion/trail-lab">
              Explorar Trail Lab
            </Button>
          </div>
        </div>
        <div className="editorial-media">
          <Image
            src="https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=1400&q=80"
            alt="Editorial SMURFX"
            fill
            className="object-cover"
          />
        </div>
      </section>

      <section className="page-shell section-stack">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">Mas vendidos</span>
            <h2>Ocho iconos listos para salir.</h2>
          </div>
        </div>
        <div className="product-grid">
          {featuredProducts.map((product) => (
            <article key={`${product.id}-grid`} className="product-card-static">
              <div className="product-card-static-image">
                <Image src={product.image} alt={product.name} fill className="object-cover" />
              </div>
              <div className="product-card-static-body">
                <div className="scroll-meta">
                  <span>{product.line}</span>
                  <span>{product.gender}</span>
                </div>
                <h3>{product.name}</h3>
                <p>{product.shortDescription}</p>
                <div className="scroll-actions">
                  <span>{product.priceLabel}</span>
                  <Link href={`/producto/${product.slug}`}>Comprar</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="page-shell members-banner">
        <div>
          <span className="section-eyebrow">SmurfX Members</span>
          <h2>Beneficios reales desde el primer pedido.</h2>
          <p>
            Suma puntos por compra, reviews y referidos. Sube de Blue a Elite y desbloquea envio
            premium, acceso anticipado y recompensas exclusivas.
          </p>
        </div>
        <div className="members-grid">
          {memberBenefits.map((benefit) => (
            <div key={benefit} className="member-card">
              <Award size={18} />
              <span>{benefit}</span>
            </div>
          ))}
        </div>
        <Button variant="secondary" href="/members">
          Unirme ahora
        </Button>
      </section>

      <section className="page-shell section-stack">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">Colecciones destacadas</span>
            <h2>Historias visuales con foco de producto.</h2>
          </div>
        </div>
        <div className="collection-grid">
          {collections.map((collection) => (
            <Link key={collection.id} href={`/coleccion/${collection.slug}`} className="collection-card">
              <div className="collection-media">
                <Image src={collection.coverImage} alt={collection.name} fill className="object-cover" />
              </div>
              <div className="collection-body">
                <span className="section-eyebrow">{collection.name}</span>
                <h3>{collection.heroTitle ?? collection.name}</h3>
                <p>{collection.heroSubtitle ?? collection.story}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="page-shell review-strip">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">Confianza</span>
            <h2>Operacion preparada para salir.</h2>
          </div>
        </div>
        <div className="review-grid">
          {trustStatements.map((statement) => (
            <div key={statement} className="review-card">
              <div className="review-stars">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star key={index} size={16} fill="currentColor" />
                ))}
              </div>
              <p>{statement}</p>
              <strong>SMURFX</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
