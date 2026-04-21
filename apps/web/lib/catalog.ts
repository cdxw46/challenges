import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ProductFilters } from "@smurfx/shared";

export type ProductCardView = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  shortDescription: string;
  line: string;
  activity: string;
  gender: string;
  image: string;
  secondaryImage: string;
  priceLabel: string;
  basePrice: number;
  compareAtPrice: number | null;
  isNew: boolean;
  isSale: boolean;
  ratingAverage: number;
  ratingCount: number;
  badge?: string;
  categoryName?: string | null;
  availableSizes: string[];
  colorHexes: string[];
};

export type AnnouncementView = {
  id: string;
  message: string;
  ctaLabel: string | null;
  ctaHref: string | null;
};

export type CollectionView = {
  id: string;
  name: string;
  slug: string;
  heroTitle: string | null;
  heroSubtitle: string | null;
  story: string | null;
  coverImage: string;
  productCount: number;
};

export type ListingResult = Awaited<ReturnType<typeof getProductListingView>>;
export type CollectionDetailView = Awaited<ReturnType<typeof getCollectionDetailView>>;
export type AccountOverview = Awaited<ReturnType<typeof getAccountOverview>>;

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value ?? 0);
}

function formatPrice(value: number, currency = "EUR", locale = "es-ES") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function mapProductCard(product: Awaited<ReturnType<typeof getFeaturedProducts>>[number]): ProductCardView {
  const images = product.images.map((image) => image.url);
  const variants = product.variants ?? [];
  const basePrice = toNumber(product.basePrice);
  const compareAtPrice = product.compareAtPrice ? toNumber(product.compareAtPrice) : null;

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    subtitle: product.subtitle,
    shortDescription: product.shortDescription,
    line: product.line,
    activity: product.activity,
    gender: product.gender,
    image: images[0] ?? "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
    secondaryImage: images[1] ?? images[0] ?? "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
    priceLabel: formatPrice(basePrice, product.currency),
    basePrice,
    compareAtPrice,
    isNew: product.isNew,
    isSale: product.isSale,
    ratingAverage: toNumber(product.ratingAverage),
    ratingCount: product.ratingCount,
    badge: product.isSale ? "Sale" : product.isNew ? "Nuevo" : undefined,
    categoryName: product.category?.name,
    availableSizes: variants.map((variant) => variant.size),
    colorHexes: [...new Set(variants.map((variant) => variant.colorHex))],
  };
}

function mapAnnouncement<T extends { id: string; message: string; ctaLabel: string | null; ctaHref: string | null }>(
  item: T,
): AnnouncementView {
  return {
    id: item.id,
    message: item.message,
    ctaLabel: item.ctaLabel,
    ctaHref: item.ctaHref,
  };
}

function mapCollection<T extends { id: string; name: string; slug: string; heroTitle: string | null; heroSubtitle: string | null; story: string | null; coverImage: string | null; products?: unknown[] }>(
  collection: T,
): CollectionView {
  return {
    id: collection.id,
    name: collection.name,
    slug: collection.slug,
    heroTitle: collection.heroTitle,
    heroSubtitle: collection.heroSubtitle,
    story: collection.story,
    coverImage:
      collection.coverImage ??
      "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=1400&q=80",
    productCount: collection.products?.length ?? 0,
  };
}

function buildProductWhere(filters: ProductFilters = {}) {
  return {
    status: "PUBLISHED" as const,
    ...(filters.category ? { category: { slug: filters.category } } : {}),
    ...(filters.gender ? { gender: filters.gender } : {}),
    ...(filters.line ? { line: filters.line } : {}),
    ...(filters.activity ? { activity: filters.activity } : {}),
    ...(typeof filters.sale === "boolean" ? { isSale: filters.sale } : {}),
    ...(typeof filters.isNew === "boolean" ? { isNew: filters.isNew } : {}),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" as const } },
            { subtitle: { contains: filters.q, mode: "insensitive" as const } },
            { shortDescription: { contains: filters.q, mode: "insensitive" as const } },
            { sku: { contains: filters.q, mode: "insensitive" as const } },
            { styleTags: { has: filters.q.toLowerCase() } },
          ],
        }
      : {}),
    ...(filters.priceMin || filters.priceMax
      ? {
          basePrice: {
            ...(filters.priceMin ? { gte: filters.priceMin } : {}),
            ...(filters.priceMax ? { lte: filters.priceMax } : {}),
          },
        }
      : {}),
  };
}

function buildOrderBy(sort?: ProductFilters["sort"]) {
  switch (sort) {
    case "newest":
      return [{ launchAt: "desc" as const }, { createdAt: "desc" as const }];
    case "price-asc":
      return [{ basePrice: "asc" as const }];
    case "price-desc":
      return [{ basePrice: "desc" as const }];
    case "top-rated":
      return [{ ratingAverage: "desc" as const }, { ratingCount: "desc" as const }];
    default:
      return [{ isNew: "desc" as const }, { soldCount: "desc" as const }, { createdAt: "desc" as const }];
  }
}

export const getStoreShell = cache(async () => {
  const [announcements, menuItems, categories, collections, pages, settings] = await Promise.all([
    db.storeAnnouncement.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.menuItem.findMany({ orderBy: { sortOrder: "asc" } }),
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
    db.collection.findMany({ orderBy: { name: "asc" } }),
    db.staticPage.findMany(),
    db.setting.findMany(),
  ]);

  return { announcements, menuItems, categories, collections, pages, settings };
});

export const getStoreShellView = cache(async () => {
  const shell = await getStoreShell();
  return {
    ...shell,
    announcements: shell.announcements.map(mapAnnouncement),
    collections: shell.collections.map((collection) => mapCollection({ ...collection, products: [] })),
  };
});

export const getFeaturedProducts = cache(async () => {
  return db.product.findMany({
    where: { status: "PUBLISHED" },
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: 2 },
      variants: { orderBy: { sortOrder: "asc" } },
      category: true,
    },
    take: 8,
    orderBy: [{ isNew: "desc" }, { soldCount: "desc" }, { createdAt: "desc" }],
  });
});

export const getFeaturedProductViews = cache(async () => {
  const products = await getFeaturedProducts();
  return products.map(mapProductCard);
});

export const getCollections = cache(async () => {
  return db.collection.findMany({
    include: {
      products: {
        take: 4,
        include: {
          product: {
            include: {
              images: { orderBy: { sortOrder: "asc" }, take: 1 },
              variants: { orderBy: { sortOrder: "asc" } },
              category: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
});

export const getCollectionViews = cache(async () => {
  const collections = await getCollections();
  return collections.map(mapCollection);
});

export const getCollectionBySlugView = cache(async (slug: string) => {
  const collection = await db.collection.findUnique({
    where: { slug },
    include: {
      products: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            include: {
              images: { orderBy: { sortOrder: "asc" }, take: 2 },
              variants: { orderBy: { sortOrder: "asc" } },
              category: true,
            },
          },
        },
      },
    },
  });

  if (!collection) return null;

  return {
    ...mapCollection(collection),
    products: collection.products.map((entry) => mapProductCard(entry.product)),
  };
});

export const getProductListing = cache(async (filters: ProductFilters = {}) => {
  const where = buildProductWhere(filters);
  const [products, count, categories, collections] = await Promise.all([
    db.product.findMany({
      where,
      include: {
        images: { orderBy: { sortOrder: "asc" }, take: 2 },
        variants: { orderBy: { sortOrder: "asc" } },
        category: true,
      },
      orderBy: buildOrderBy(filters.sort),
      take: filters.limit ?? 24,
      skip: filters.offset ?? 0,
    }),
    db.product.count({ where }),
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
    db.collection.findMany({ orderBy: { name: "asc" } }),
  ]);

  return { products, count, categories, collections };
});

export const getProductListingView = cache(async (filters: ProductFilters = {}) => {
  const listing = await getProductListing(filters);
  return {
    ...listing,
    products: listing.products.map(mapProductCard),
    collections: listing.collections.map((collection) => mapCollection({ ...collection, products: [] })),
  };
});

export const getProductBySlug = cache(async (slug: string) => {
  return db.product.findUnique({
    where: { slug },
    include: {
      category: true,
      images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      variants: { orderBy: [{ colorName: "asc" }, { sortOrder: "asc" }] },
      reviews: {
        where: { approved: true },
        include: { user: true, votes: true },
        orderBy: { createdAt: "desc" },
      },
      collections: {
        include: { collection: true },
      },
    },
  });
});

export const getRelatedProducts = cache(async (productId: string, categoryId?: string | null, line?: string) => {
  return db.product.findMany({
    where: {
      id: { not: productId },
      status: "PUBLISHED",
      OR: [{ categoryId: categoryId ?? undefined }, { line }],
    },
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: 2 },
      variants: { orderBy: { sortOrder: "asc" } },
      category: true,
    },
    take: 4,
    orderBy: [{ soldCount: "desc" }, { ratingAverage: "desc" }],
  });
});

export const getBlogPosts = cache(async () => {
  return db.blogPost.findMany({
    where: { status: "PUBLISHED" },
    include: { category: true, author: true },
    orderBy: { publishedAt: "desc" },
  });
});

export const getBlogPostBySlug = cache(async (slug: string) => {
  return db.blogPost.findUnique({
    where: { slug },
    include: { category: true, author: true },
  });
});

export const getStaticPage = cache(async (slug: string) => {
  return db.staticPage.findUnique({ where: { slug } });
});

export const getJobs = cache(async () => {
  return db.jobOpening.findMany({
    where: { isActive: true },
    orderBy: [{ team: "asc" }, { createdAt: "desc" }],
  });
});

export const getMembersOverview = cache(async () => {
  const settings = await db.setting.findUnique({ where: { key: "store.profile" } });
  return {
    profile: settings?.value,
    tiers: [
      { name: "Blue", min: 0, max: 499, benefits: ["Acceso a Members", "Historial de puntos", "Birthday drop"] },
      { name: "Silver", min: 500, max: 1999, benefits: ["Envio preferente", "Drops anticipados", "10% sale extra"] },
      { name: "Gold", min: 2000, max: 4999, benefits: ["Envio gratis", "Atencion prioritaria", "Regalos Members"] },
      { name: "Elite", min: 5000, max: null, benefits: ["Acceso first look", "Invitaciones privadas", "Styling concierge"] },
    ],
  };
});

export const getAccountOverview = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    memberTier: user.memberTier,
    memberPoints: user.memberPoints,
    addresses: user.addresses.map((address) => ({
      id: address.id,
      firstName: address.firstName,
      lastName: address.lastName,
      line1: address.line1,
      city: address.city,
      province: address.province,
      postalCode: address.postalCode,
      country: address.country,
    })),
    orders: user.orders.map((order) => ({
      id: order.id,
      number: order.number,
      status: order.status,
      itemCount: order.items.reduce((acc, item) => acc + item.quantity, 0),
      total: formatPrice(toNumber(order.total), order.currency),
    })),
    wishlists: user.wishlists.map((entry) => ({
      product: {
        slug: entry.product.slug,
        name: entry.product.name,
      },
    })),
  };
});

export const getAdminOverview = cache(async () => {
  const [todaySalesAgg, recentOrders, lowStockVariants, userCount, productCount] = await Promise.all([
    db.order.aggregate({
      _sum: { total: true },
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        items: true,
        user: true,
      },
    }),
    db.productVariant.findMany({
      where: { stock: { lte: 5 } },
      take: 8,
      include: { product: true },
      orderBy: { stock: "asc" },
    }),
    db.user.count(),
    db.product.count(),
  ]);

  return {
    kpis: {
      todaySales: toNumber(todaySalesAgg._sum.total ?? 0),
      activeOrders: recentOrders.length,
      users: userCount,
      products: productCount,
    },
    recentOrders: recentOrders.map((order) => ({
      id: order.id,
      number: order.number,
      email: order.email,
      status: order.status,
      total: toNumber(order.total),
      items: order.items.length,
      createdAt: order.createdAt,
    })),
    lowStock: lowStockVariants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      productName: variant.product.name,
      size: variant.size,
      colorName: variant.colorName,
      stock: variant.stock,
    })),
  };
});

export const getCollectionBySlug = cache(async (slug: string) => {
  return db.collection.findUnique({
    where: { slug },
    include: {
      products: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            include: {
              images: { orderBy: { sortOrder: "asc" }, take: 2 },
              variants: { orderBy: { sortOrder: "asc" } },
              category: true,
            },
          },
        },
      },
    },
  });
});

export const getCollectionDetailView = cache(async (slug: string) => {
  const collection = await getCollectionBySlug(slug);
  if (!collection) return null;

  return {
    id: collection.id,
    name: collection.name,
    slug: collection.slug,
    heroTitle: collection.heroTitle,
    heroSubtitle: collection.heroSubtitle,
    story: collection.story,
    coverImage:
      collection.coverImage ??
      "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=1400&q=80",
    products: collection.products.map((entry) => mapProductCard(entry.product)),
  };
});

export type ProductDetailView = Awaited<ReturnType<typeof getProductDetailView>>;

export const getProductDetailView = cache(async (slug: string) => {
  const product = await getProductBySlug(slug);
  if (!product) return null;

  const groupedColors = product.variants.reduce<
    Array<{ colorName: string; colorHex: string; image: string; sizes: Array<{ size: string; stock: number; sku: string }> }>
  >((acc, variant) => {
    const existing = acc.find((item) => item.colorName === variant.colorName);
    const fallbackImage =
      product.images.find((image) => image.variantId === variant.id)?.url ??
      product.images.find((image) => image.colorHex === variant.colorHex)?.url ??
      product.images[0]?.url ??
      "";

    const sizeEntry = { size: variant.size, stock: variant.stock, sku: variant.sku };

    if (existing) {
      existing.sizes.push(sizeEntry);
      return acc;
    }

    acc.push({
      colorName: variant.colorName,
      colorHex: variant.colorHex,
      image: fallbackImage,
      sizes: [sizeEntry],
    });
    return acc;
  }, []);

  const related = await getRelatedProducts(product.id, product.categoryId, product.line);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    subtitle: product.subtitle,
    shortDescription: product.shortDescription,
    longDescription: product.longDescription,
    line: product.line,
    slogan: product.slogan,
    activity: product.activity,
    gender: product.gender,
    sku: product.sku,
    basePrice: toNumber(product.basePrice),
    compareAtPrice: product.compareAtPrice ? toNumber(product.compareAtPrice) : null,
    priceLabel: formatPrice(toNumber(product.basePrice), product.currency),
    compareAtPriceLabel: product.compareAtPrice ? formatPrice(toNumber(product.compareAtPrice), product.currency) : null,
    ratingAverage: toNumber(product.ratingAverage),
    ratingCount: product.ratingCount,
    badge: product.isSale ? "Sale" : product.isNew ? "Nuevo" : undefined,
    categoryName: product.category?.name ?? null,
    categorySlug: product.category?.slug ?? null,
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      colorHex: image.colorHex,
      isPrimary: image.isPrimary,
    })),
    colors: groupedColors,
    sizes: product.variants.map((variant) => ({ size: variant.size, stock: variant.stock, sku: variant.sku })),
    stockNotice: product.variants.reduce((min, variant) => Math.min(min, variant.stock), Infinity),
    features: Array.isArray(product.features) ? (product.features as string[]) : [],
    care: Array.isArray(product.care) ? (product.care as string[]) : [],
    shipping: Array.isArray(product.shipping) ? (product.shipping as string[]) : [],
    reviews: product.reviews.map((review) => ({
      id: review.id,
      title: review.title,
      body: review.body,
      rating: review.rating,
      helpfulCount: review.helpfulCount,
      verifiedPurchase: review.verifiedPurchase,
      createdAt: review.createdAt,
      author: `${review.user.firstName} ${review.user.lastName.slice(0, 1)}.`,
    })),
    collections: product.collections.map((entry) => ({
      id: entry.collection.id,
      name: entry.collection.name,
      slug: entry.collection.slug,
    })),
    related: related.map(mapProductCard),
  };
});
