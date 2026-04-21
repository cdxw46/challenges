import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../apps/web/generated/prisma/client";
import { ProductStatus, Role, SettingScope } from "../apps/web/generated/prisma/enums";

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL || ""),
});

const announcements = [
  { message: "Envio gratis desde 90 EUR", ctaLabel: "Comprar ahora", ctaHref: "/sale", sortOrder: 1 },
  { message: "SmurfX Members suma 10 puntos por cada euro", ctaLabel: "Descubrir Members", ctaHref: "/members", sortOrder: 2 },
  { message: "Nuevos lanzamientos SmurfAir y SmurfTrail", ctaLabel: "Ver lanzamientos", ctaHref: "/coleccion/new-arrivals", sortOrder: 3 },
];

const categories = [
  {
    name: "Hombre",
    slug: "hombre",
    description: "Equipacion premium para entrenamiento, running y lifestyle.",
    coverColor: "#534AB7",
    coverImage: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "Mujer",
    slug: "mujer",
    description: "Colecciones de alto rendimiento con ajuste tecnico.",
    coverColor: "#CECBF6",
    coverImage: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "Ninos",
    slug: "ninos",
    description: "Movimiento diario con comodidad y resistencia.",
    coverColor: "#18181B",
    coverImage: "https://images.unsplash.com/photo-1514986888952-8cd320577b68?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "Sale",
    slug: "sale",
    description: "Precio especial en iconos de temporada.",
    coverColor: "#7C3AED",
    coverImage: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=1200&q=80",
  },
  {
    name: "Running",
    slug: "running",
    description: "Zapatillas y apparel para kilometros sin limites.",
    coverColor: "#0F172A",
    coverImage: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
  },
];

const collections = [
  {
    name: "New Arrivals",
    slug: "new-arrivals",
    heroTitle: "Nuevos lanzamientos que elevan tu ritmo",
    heroSubtitle: "SmurfAir, SmurfRun y SmurfTrail en edicion premium.",
    story:
      "Una seleccion concebida para atletas que quieren ligereza, estabilidad y presencia visual sin ruido.",
    coverImage:
      "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=1400&q=80",
  },
  {
    name: "Blue Motion",
    slug: "blue-motion",
    heroTitle: "Move in blue",
    heroSubtitle: "Siluetas limpias, propulsion reactiva y color dominante.",
    story:
      "Blue Motion mezcla tonos profundos con capas tecnicas para una presencia minimalista de alto impacto.",
    coverImage:
      "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=1400&q=80",
  },
  {
    name: "Trail Lab",
    slug: "trail-lab",
    heroTitle: "Conquista cada terreno",
    heroSubtitle: "Traccion agresiva, proteccion y amortiguacion progresiva.",
    story:
      "Materiales resistentes al clima y suelas con agarre diseñado para rutas mixtas y terreno tecnico.",
    coverImage:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1400&q=80",
  },
];

const blogPosts = [
  {
    title: "Como elegir unas zapatillas de running segun tu pisada",
    slug: "como-elegir-zapatillas-running",
    excerpt: "Guia practica para combinar amortiguacion, estabilidad y respuesta.",
    content:
      "<p>La eleccion correcta empieza por entender tu ritmo, superficie y sensaciones. En SmurfX trabajamos con perfiles de pisada para adaptar soporte y geometria.</p><p>Busca equilibrio entre retorno de energia, ajuste del mediopie y durabilidad de suela.</p>",
    coverImage:
      "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=1200&q=80",
    tags: ["running", "guia", "smurfair"],
  },
  {
    title: "Recuperacion activa: la clave entre sesiones intensas",
    slug: "recuperacion-activa",
    excerpt: "Movilidad, respiracion y capas tecnicas para volver mejor.",
    content:
      "<p>La recuperacion no es una pausa: es parte del entrenamiento. Alterna movilidad, caminatas suaves y tejidos transpirables.</p>",
    coverImage:
      "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1200&q=80",
    tags: ["training", "recovery"],
  },
  {
    title: "Trail en primavera: capas inteligentes y agarre real",
    slug: "trail-primavera-capas-y-agarre",
    excerpt: "Que llevar cuando el terreno cambia a cada kilometro.",
    content:
      "<p>En trail, el clima manda. Prioriza una base ligera, capa repelente al agua y una suela preparada para barro y roca.</p>",
    coverImage:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    tags: ["trail", "outdoor"],
  },
];

const staticPages = [
  {
    slug: "sobre-nosotros",
    title: "Sobre SmurfX",
    body:
      "<h2>Move in blue</h2><p>SmurfX nace para unir diseno minimalista, precision tecnica y cultura deportiva contemporanea.</p><p>Construimos producto con enfoque en rendimiento, ergonomia y durabilidad premium.</p>",
  },
  {
    slug: "sostenibilidad",
    title: "Sostenibilidad",
    body:
      "<h2>Materiales mejores, decisiones medibles</h2><p>Priorizamos fibras recicladas, embalaje reducido y optimizacion de rutas logisticas.</p>",
  },
  {
    slug: "envios-devoluciones",
    title: "Envios y devoluciones",
    body:
      "<p>Envio estandar 3-5 dias, express 1-2 dias y recogida en punto en zonas compatibles. Las devoluciones pueden solicitarse desde la cuenta del usuario.</p>",
  },
  {
    slug: "terminos",
    title: "Terminos y condiciones",
    body:
      "<p>Condiciones generales de compra, politica de promociones y uso de la plataforma SmurfX.</p>",
  },
  {
    slug: "privacidad",
    title: "Politica de privacidad",
    body:
      "<p>Tratamos datos personales con base legitima, minimizacion de datos y configuracion expresa de consentimientos.</p>",
  },
  {
    slug: "ayuda",
    title: "Centro de ayuda",
    body:
      "<p>Encuentra respuestas sobre tallas, pedidos, devoluciones, Members y pagos.</p>",
  },
  {
    slug: "guia-de-tallas",
    title: "Guia de tallas",
    body:
      "<p>Consulta medidas recomendadas para running, training y lifestyle. Usa el calculador para afinar ajuste.</p>",
  },
];

const settings = [
  {
    scope: SettingScope.STORE,
    key: "store.profile",
    value: {
      name: "SMURFX",
      claim: "Move in blue",
      email: "support@smurfx.com",
      phone: "+34 910 000 000",
      fiscalAddress: "Gran Via 100, Madrid, Espana",
      currency: "EUR",
      locale: "es",
    },
  },
  {
    scope: SettingScope.PAYMENT,
    key: "payment.methods",
    value: {
      stripe: true,
      paypal: true,
      klarna: true,
      bizum: true,
      applePay: true,
      googlePay: true,
    },
  },
  {
    scope: SettingScope.SEO,
    key: "seo.defaults",
    value: {
      title: "SMURFX - Move in blue",
      description: "Tienda online premium de zapatillas y ropa deportiva de alto rendimiento.",
      ogImage:
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
    },
  },
];

const shippingZones = [
  {
    name: "Espana",
    countries: ["ES"],
    freeThreshold: 90,
    methods: [
      { name: "Estandar", code: "standard", description: "3-5 dias laborables", price: 4.95, minDays: 3, maxDays: 5 },
      { name: "Express", code: "express", description: "1-2 dias laborables", price: 8.95, minDays: 1, maxDays: 2 },
      { name: "Same Day", code: "same-day", description: "Entrega hoy en zonas compatibles", price: 12.95, minDays: 0, maxDays: 1 },
      { name: "Recogida en punto", code: "pickup", description: "Recoge en punto asociado", price: 2.95, minDays: 2, maxDays: 4, isPickup: true },
    ],
  },
  {
    name: "Europa",
    countries: ["FR", "DE", "IT", "PT", "NL", "BE"],
    freeThreshold: 140,
    methods: [
      { name: "Estandar EU", code: "eu-standard", description: "4-7 dias laborables", price: 9.95, minDays: 4, maxDays: 7 },
      { name: "Express EU", code: "eu-express", description: "2-3 dias laborables", price: 14.95, minDays: 2, maxDays: 3 },
    ],
  },
];

const jobs = [
  {
    title: "Senior Ecommerce Designer",
    slug: "senior-ecommerce-designer",
    team: "Design",
    location: "Madrid",
    modality: "Hybrid",
    description: "Disena experiencias premium para storefront, checkout y loyalty.",
    requirements: "Portfolio fuerte en e-commerce, systems thinking, Figma avanzado.",
  },
  {
    title: "Fullstack Commerce Engineer",
    slug: "fullstack-commerce-engineer",
    team: "Engineering",
    location: "Remote EU",
    modality: "Remote",
    description: "Construye catalogo, pagos, admin y automatizaciones operativas.",
    requirements: "TypeScript, React, SSR, pagos, SQL y seguridad aplicada.",
  },
];

const products = [
  {
    name: "SmurfAir Max One",
    slug: "smurfair-max-one-azul",
    subtitle: "Running premium",
    shortDescription: "Amortiguacion reactiva y upper ligero para kilometros fluidos.",
    longDescription:
      "La SmurfAir Max One combina espuma reactiva, estructura estabilizadora y upper tecnico con ventilacion mapeada para sesiones de running diarias.",
    line: "SmurfAir",
    slogan: "Vuela",
    activity: "Running",
    gender: "Hombre",
    sku: "SFX-AIR-001",
    basePrice: 189,
    compareAtPrice: 219,
    isNew: true,
    status: ProductStatus.PUBLISHED,
    styleTags: ["running", "daily trainer", "premium"],
    categorySlug: "hombre",
    features: [
      "Espuma reactiva de alto retorno",
      "Malla tecnica con soporte en mediopie",
      "Suela de traccion multidireccion",
    ],
    care: ["Limpiar con pano humedo", "No lavar a maquina", "Secar a la sombra"],
    shipping: ["Envio gratis desde 90 EUR", "Devolucion ampliada para Members"],
    variants: [
      {
        sku: "SFX-AIR-001-42-BLUE",
        size: "42",
        colorName: "Deep Purple",
        colorHex: "#534AB7",
        stock: 12,
        weightGrams: 740,
        isDefault: true,
        images: [
          "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
        ],
      },
      {
        sku: "SFX-AIR-001-43-LAV",
        size: "43",
        colorName: "Lavender Blue",
        colorHex: "#CECBF6",
        stock: 8,
        weightGrams: 740,
        images: [
          "https://images.unsplash.com/photo-1543508282-6319a3e2621f?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1543508282-6319a3e2621f?auto=format&fit=crop&w=900&q=80",
        ],
      },
    ],
    reviews: [],
  },
  {
    name: "SmurfForce Elite",
    slug: "smurfforce-elite-negro",
    subtitle: "Training power",
    shortDescription: "Base estable, soporte lateral y energia controlada.",
    longDescription:
      "Pensada para sesiones de fuerza y circuitos intensos, la SmurfForce Elite aporta firmeza, agarre y proteccion lateral.",
    line: "SmurfForce",
    slogan: "Domina",
    activity: "Training",
    gender: "Mujer",
    sku: "SFX-FORCE-002",
    basePrice: 159,
    compareAtPrice: 179,
    isNew: true,
    status: ProductStatus.PUBLISHED,
    styleTags: ["training", "gym", "stability"],
    categorySlug: "mujer",
    features: ["Base de alta estabilidad", "Refuerzos laterales", "Suela adherente indoor/outdoor"],
    care: ["Limpieza puntual", "No secadora"],
    shipping: ["Entrega express disponible"],
    variants: [
      {
        sku: "SFX-FORCE-002-38-BLK",
        size: "38",
        colorName: "Obsidian",
        colorHex: "#111111",
        stock: 6,
        weightGrams: 680,
        isDefault: true,
        images: [
          "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=900&q=80",
        ],
      },
      {
        sku: "SFX-FORCE-002-39-BLUE",
        size: "39",
        colorName: "Deep Purple",
        colorHex: "#534AB7",
        stock: 5,
        weightGrams: 680,
        images: [
          "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=900&q=80",
        ],
      },
    ],
    reviews: [],
  },
  {
    name: "SmurfRun Flow",
    slug: "smurfrun-flow-lavanda",
    subtitle: "Speed trainer",
    shortDescription: "Velocidad contenida con geometria rapida y upper ligero.",
    longDescription:
      "Drop afinado, rocker delantero y espuma flexible para transiciones rapidas en entrenos vivos.",
    line: "SmurfRun",
    slogan: "Sin limites",
    activity: "Running",
    gender: "Mujer",
    sku: "SFX-RUN-003",
    basePrice: 149,
    compareAtPrice: 169,
    isNew: false,
    status: ProductStatus.PUBLISHED,
    styleTags: ["tempo", "running"],
    categorySlug: "mujer",
    features: ["Rocker dinamico", "Upper de secado rapido"],
    care: ["No sumergir", "Lavar a mano"],
    shipping: ["Entrega standard y express"],
    variants: [
      {
        sku: "SFX-RUN-003-37-LAV",
        size: "37",
        colorName: "Lavender Blue",
        colorHex: "#CECBF6",
        stock: 4,
        weightGrams: 610,
        isDefault: true,
        images: [
          "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=900&q=80",
        ],
      },
    ],
    reviews: [],
  },
  {
    name: "SmurfGlide Knit Hoodie",
    slug: "smurfglide-knit-hoodie-azul",
    subtitle: "Lifestyle layer",
    shortDescription: "Capa ligera premium con patron limpio y tacto suave.",
    longDescription:
      "Sudadera tecnica lifestyle con tejido compacto, capucha estructurada y branding tonal minimalista.",
    line: "SmurfGlide",
    slogan: "Deslizate",
    activity: "Lifestyle",
    gender: "Hombre",
    sku: "SFX-GLIDE-004",
    basePrice: 119,
    compareAtPrice: 139,
    isNew: false,
    status: ProductStatus.PUBLISHED,
    styleTags: ["hoodie", "lifestyle"],
    categorySlug: "hombre",
    features: ["Tejido tecnico suave", "Patron relajado premium"],
    care: ["Lavar en frio", "No lejia"],
    shipping: ["Envio gratis desde 90 EUR"],
    variants: [
      {
        sku: "SFX-GLIDE-004-M-BLUE",
        size: "M",
        colorName: "Deep Purple",
        colorHex: "#534AB7",
        stock: 10,
        weightGrams: 420,
        isDefault: true,
        images: [
          "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80",
        ],
      },
    ],
    reviews: [],
  },
  {
    name: "SmurfTrail Ridge",
    slug: "smurftrail-ridge-negro",
    subtitle: "Trail control",
    shortDescription: "Agarre tecnico y proteccion para rutas mixtas.",
    longDescription:
      "La SmurfTrail Ridge combina chasis protector, tacos pronunciados y ajuste seguro para caminos tecnicos.",
    line: "SmurfTrail",
    slogan: "Conquista",
    activity: "Trail",
    gender: "Hombre",
    sku: "SFX-TRAIL-005",
    basePrice: 174,
    compareAtPrice: 199,
    isNew: true,
    status: ProductStatus.PUBLISHED,
    styleTags: ["trail", "outdoor"],
    categorySlug: "hombre",
    features: ["Suela de agarre tecnico", "Refuerzo antiabrasion", "Lengueta sellada"],
    care: ["Cepillado en seco", "Secado natural"],
    shipping: ["Entrega express disponible"],
    variants: [
      {
        sku: "SFX-TRAIL-005-42-BLK",
        size: "42",
        colorName: "Obsidian",
        colorHex: "#111111",
        stock: 7,
        weightGrams: 790,
        isDefault: true,
        images: [
          "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
        ],
      },
    ],
    reviews: [],
  },
];

async function main() {
  await prisma.reviewVote.deleteMany();
  await prisma.membersTransaction.deleteMany();
  await prisma.review.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.collectionProduct.deleteMany();
  await prisma.product.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.category.deleteMany();
  await prisma.shippingMethod.deleteMany();
  await prisma.shippingZone.deleteMany();
  await prisma.storeAnnouncement.deleteMany();
  await prisma.blogPost.deleteMany();
  await prisma.blogCategory.deleteMany();
  await prisma.staticPage.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.jobApplication.deleteMany();
  await prisma.jobOpening.deleteMany();
  await prisma.notificationSubscription.deleteMany();
  await prisma.savedSearch.deleteMany();
  await prisma.emailTemplate.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.address.deleteMany();
  await prisma.customerNote.deleteMany();
  await prisma.adminAuditLog.deleteMany();
  await prisma.wishlist.deleteMany();
  await prisma.couponUse.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.user.deleteMany();

  for (const item of announcements) {
    await prisma.storeAnnouncement.create({ data: item });
  }

  for (const item of settings) {
    await prisma.setting.create({ data: item });
  }

  const blogCategory = await prisma.blogCategory.create({
    data: {
      name: "Performance Journal",
      slug: "performance-journal",
      description: "Guias, entrenamiento y cultura de producto SmurfX.",
    },
  });

  for (const page of staticPages) {
    await prisma.staticPage.create({ data: page });
  }

  for (const collection of collections) {
    await prisma.collection.create({ data: collection });
  }

  for (const job of jobs) {
    await prisma.jobOpening.create({ data: job });
  }

  const categoryMap = new Map<string, string>();
  for (const category of categories) {
    const created = await prisma.category.create({ data: category });
    categoryMap.set(category.slug, created.id);
  }

  const adminPasswordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "Admin1234!", 12);

  const admin = await prisma.user.create({
    data: {
      email: process.env.ADMIN_EMAIL || "admin@smurfx.com",
      passwordHash: adminPasswordHash,
      firstName: "Admin",
      lastName: "SmurfX",
      role: Role.SUPERADMIN,
      emailVerifiedAt: new Date(),
      marketingOptIn: false,
      memberTier: "ELITE",
      memberPoints: 6000,
    },
  });

  await prisma.address.createMany({
    data: [
      {
        userId: admin.id,
        firstName: "Admin",
        lastName: "SmurfX",
        line1: "Gran Via 100",
        city: "Madrid",
        province: "Madrid",
        postalCode: "28013",
        country: "ES",
        phone: "+34910000000",
        isDefaultShipping: true,
        isDefaultBilling: true,
      },
    ],
  });

  for (const zone of shippingZones) {
    const createdZone = await prisma.shippingZone.create({
      data: {
        name: zone.name,
        countries: zone.countries,
        freeThreshold: zone.freeThreshold,
      },
    });

    for (const method of zone.methods) {
      await prisma.shippingMethod.create({
        data: {
          zoneId: createdZone.id,
          name: method.name,
          code: method.code,
          description: method.description,
          price: method.price,
          minDays: method.minDays,
          maxDays: method.maxDays,
          isPickup: method.isPickup ?? false,
          carrier: method.isPickup ? "Pickup Network" : "SMURFX Express",
        },
      });
    }
  }

  const createdCollections = await prisma.collection.findMany();
  const collectionMap = new Map(createdCollections.map((item) => [item.slug, item.id]));

  for (const article of blogPosts) {
    await prisma.blogPost.create({
      data: {
        ...article,
        categoryId: blogCategory.id,
        authorId: admin.id,
        publishedAt: new Date(),
      },
    });
  }

  for (const product of products) {
    const createdProduct = await prisma.product.create({
      data: {
        name: product.name,
        slug: product.slug,
        subtitle: product.subtitle,
        shortDescription: product.shortDescription,
        longDescription: product.longDescription,
        line: product.line,
        slogan: product.slogan,
        activity: product.activity,
        gender: product.gender,
        sku: product.sku,
        basePrice: product.basePrice,
        compareAtPrice: product.compareAtPrice,
        isNew: product.isNew,
        isSale: Boolean(product.compareAtPrice && product.compareAtPrice > product.basePrice),
        status: product.status,
        styleTags: product.styleTags,
        features: product.features,
        care: product.care,
        shipping: product.shipping,
        seoTitle: `${product.name} | SMURFX`,
        seoDescription: product.shortDescription,
        categoryId: categoryMap.get(product.categorySlug),
        ratingAverage: product.reviews.length
          ? product.reviews.reduce((acc, review) => acc + review.rating, 0) / product.reviews.length
          : 0,
        ratingCount: product.reviews.length,
      },
    });

    let primaryVariantId = "";

    for (const [index, variant] of product.variants.entries()) {
      const createdVariant = await prisma.productVariant.create({
        data: {
          productId: createdProduct.id,
          sku: variant.sku,
          size: variant.size,
          colorName: variant.colorName,
          colorHex: variant.colorHex,
          stock: variant.stock,
          weightGrams: variant.weightGrams,
          isDefault: variant.isDefault,
          sortOrder: index,
        },
      });

      if (!primaryVariantId || variant.isDefault) {
        primaryVariantId = createdVariant.id;
      }

      for (const [imageIndex, imageUrl] of variant.images.entries()) {
        await prisma.productImage.create({
          data: {
            productId: createdProduct.id,
            variantId: createdVariant.id,
            url: imageUrl,
            alt: `${product.name} ${variant.colorName}`,
            sortOrder: imageIndex,
            isPrimary: imageIndex === 0,
            colorHex: variant.colorHex,
          },
        });
      }

      await prisma.inventoryMovement.create({
        data: {
          variantId: createdVariant.id,
          userId: admin.id,
          quantity: variant.stock,
          type: "IN",
          reason: "Inventario inicial",
        },
      });
    }

    if (product.activity === "Trail") {
      await prisma.collectionProduct.create({
        data: { collectionId: collectionMap.get("trail-lab")!, productId: createdProduct.id, sortOrder: 1 },
      });
    }

    await prisma.collectionProduct.create({
      data: { collectionId: collectionMap.get("new-arrivals")!, productId: createdProduct.id, sortOrder: 1 },
    });

    if (product.line === "SmurfAir" || product.line === "SmurfGlide") {
      await prisma.collectionProduct.create({
        data: { collectionId: collectionMap.get("blue-motion")!, productId: createdProduct.id, sortOrder: 2 },
      });
    }

    void primaryVariantId;
  }

  await prisma.emailTemplate.createMany({
    data: [
      {
        key: "welcome",
        subject: "Bienvenido a SMURFX",
        html: "<h1>Bienvenido a SMURFX</h1><p>Gracias por unirte a Move in blue.</p>",
      },
      {
        key: "order-confirmation",
        subject: "Tu pedido SMURFX esta confirmado",
        html: "<h1>Pedido confirmado</h1><p>Gracias por comprar en SMURFX.</p>",
      },
      {
        key: "password-reset",
        subject: "Recupera tu acceso a SMURFX",
        html: "<h1>Restablece tu contrasena</h1><p>Usa el enlace temporal enviado por seguridad.</p>",
      },
    ],
  });

  await prisma.menuItem.createMany({
    data: [
      { label: "Hombre", href: "/hombre", group: "shop", sortOrder: 1 },
      { label: "Mujer", href: "/mujer", group: "shop", sortOrder: 2 },
      { label: "Ninos", href: "/ninos", group: "shop", sortOrder: 3 },
      { label: "Sale", href: "/sale", group: "shop", sortOrder: 4 },
      { label: "Colecciones", href: "/coleccion/new-arrivals", group: "shop", sortOrder: 5 },
      { label: "Members", href: "/members", group: "brand", sortOrder: 6 },
      { label: "Blog", href: "/blog", group: "brand", sortOrder: 7 },
    ],
  });

  await prisma.coupon.createMany({
    data: [
      {
        code: "MOVEINBLUE10",
        description: "10% en tu primera compra",
        type: "PERCENTAGE",
        amount: 10,
        maxUses: 500,
        maxUsesPerUser: 1,
        firstOrderOnly: true,
      },
      {
        code: "FREESHIP",
        description: "Envio gratis",
        type: "FREE_SHIPPING",
        amount: 0,
        maxUses: 1000,
        freeShipping: true,
      },
    ],
  });

  console.log("SMURFX seed complete");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
