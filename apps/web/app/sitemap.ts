import type { MetadataRoute } from "next";

const routes = [
  "",
  "/hombre",
  "/mujer",
  "/ninos",
  "/sale",
  "/members",
  "/blog",
  "/empleo",
  "/sobre-nosotros",
  "/sostenibilidad",
  "/envios-devoluciones",
  "/terminos",
  "/privacidad",
  "/ayuda",
  "/guia-de-tallas",
  "/carrito",
  "/checkout",
  "/cuenta",
  "/coleccion/new-arrivals",
  "/producto/smurfair-max-one-azul",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : 0.8,
  }));
}
