import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { BRAND } from "../src/lib/brand";

const prisma = new PrismaClient();

const SIZES_SHOE = ["38", "39", "40", "41", "42", "43", "44", "45"];
const SIZES_APPAREL = ["XS", "S", "M", "L", "XL"];

const COLORS = [
  { name: "Royal Smurf", hex: "#534AB7" },
  { name: "Lavender", hex: "#CECBF6" },
  { name: "Onyx", hex: "#0A0A0A" },
  { name: "Paper", hex: "#FFFFFF" },
  { name: "Volt", hex: "#D4F25A" },
  { name: "Cobalt", hex: "#1E3A8A" },
  { name: "Coral", hex: "#FF6F61" },
  { name: "Mist", hex: "#B7BEC9" }
];

const CATEGORIES = [
  { slug: "hombre", name: "Hombre", image: "/img/cat-hombre.svg" },
  { slug: "mujer", name: "Mujer", image: "/img/cat-mujer.svg" },
  { slug: "ninos", name: "Niños", image: "/img/cat-ninos.svg" },
  { slug: "sale", name: "Sale", image: "/img/cat-sale.svg" }
];
const ACTIVITY_CATS = [
  { slug: "running", name: "Running", image: "/img/act-running.svg" },
  { slug: "training", name: "Training", image: "/img/act-training.svg" },
  { slug: "lifestyle", name: "Lifestyle", image: "/img/act-lifestyle.svg" },
  { slug: "trail", name: "Trail", image: "/img/act-trail.svg" },
  { slug: "basketball", name: "Basketball", image: "/img/act-basketball.svg" }
];

const COLLECTIONS = [
  {
    slug: "blue-revolution",
    name: "Blue Revolution",
    description: "La esencia SMURFX en su forma más pura. Tonalidades morado eléctrico, líneas limpias.",
    heroImage: "/img/coll-blue.svg",
    story:
      "Blue Revolution nace de la calle. Nace del entrenamiento al amanecer, del último kilómetro, del salto que define el partido. Cada pieza está pensada para moverte sin distracción."
  },
  {
    slug: "ultra-glide",
    name: "Ultra Glide",
    description: "Ligereza extrema, amortiguación reactiva. Para los que viven entre kilómetros.",
    heroImage: "/img/coll-glide.svg",
    story:
      "Ultra Glide redefine la sensación al correr. Espuma propietaria, mediasuela esculpida y upper de malla técnica que respira."
  },
  {
    slug: "court-classics",
    name: "Court Classics",
    description: "El legado de SmurfForce, reinterpretado para la cancha y la calle.",
    heroImage: "/img/coll-court.svg",
    story:
      "Diseños icónicos con materiales premium y construcción atemporal. Cada par cuenta la historia del juego."
  }
];

function placeholderImage(line: string, color: string, idx: number) {
  return `/img/products/${line.toLowerCase()}-${color
    .toLowerCase()
    .replace(/\s+/g, "-")}-${idx}.svg`;
}

const PRODUCT_TEMPLATES: Array<{
  line: (typeof BRAND.lines)[number]["slug"];
  base: string;
  variantTypes: ("shoe" | "apparel")[];
  activity: string;
  shortDesc: string;
  longDesc: string;
  category: string;
}> = [
  {
    line: "smurfair",
    base: "SmurfAir Max",
    variantTypes: ["shoe"],
    activity: "lifestyle",
    shortDesc: "La amortiguación visible que cambió el juego.",
    longDesc:
      "SmurfAir Max combina una unidad de aire visible en el talón con un upper técnico que envuelve el pie. Construcción premium, comodidad de pisada visible.",
    category: "lifestyle"
  },
  {
    line: "smurfforce",
    base: "SmurfForce 1",
    variantTypes: ["shoe"],
    activity: "basketball",
    shortDesc: "Icono atemporal de la cancha al asfalto.",
    longDesc:
      "Suela acolchada, piel premium y sello SmurfForce. Una silueta legendaria con la robustez de los originales.",
    category: "basketball"
  },
  {
    line: "smurfrun",
    base: "SmurfRun Pegasus",
    variantTypes: ["shoe"],
    activity: "running",
    shortDesc: "Tu compañero de kilómetros, sin excusas.",
    longDesc:
      "Mediasuela con espuma reactiva ZoomFlow, upper engineered mesh y placa estabilizadora interna para el rodaje diario.",
    category: "running"
  },
  {
    line: "smurfglide",
    base: "SmurfGlide Pro",
    variantTypes: ["shoe"],
    activity: "running",
    shortDesc: "Ligereza extrema, retorno energético máximo.",
    longDesc:
      "Espuma SuperFoam, placa de carbono SmurfPlate, upper en malla translúcida. Zapatilla de competición real.",
    category: "running"
  },
  {
    line: "smurftrail",
    base: "SmurfTrail Peak",
    variantTypes: ["shoe"],
    activity: "trail",
    shortDesc: "Conquista cualquier sendero.",
    longDesc:
      "Suela GripX con tacos multi-direccionales, protección contra rocas y construcción impermeable hasta el tobillo.",
    category: "trail"
  },
  {
    line: "smurfrun",
    base: "Camiseta TechRun",
    variantTypes: ["apparel"],
    activity: "running",
    shortDesc: "Tejido respirable de secado rápido.",
    longDesc:
      "Camiseta de running con tejido DryFlow, costuras planas y refuerzos antifricción en hombros.",
    category: "running"
  },
  {
    line: "smurfforce",
    base: "Sudadera Court Hood",
    variantTypes: ["apparel"],
    activity: "lifestyle",
    shortDesc: "Confort premium, estilo cancha.",
    longDesc:
      "Felpa cepillada interior, capucha forrada y bolsillo canguro. Estilo SmurfForce, comodidad para todo el día.",
    category: "lifestyle"
  },
  {
    line: "smurftrail",
    base: "Cortavientos PeakShell",
    variantTypes: ["apparel"],
    activity: "trail",
    shortDesc: "Protección ligera frente al viento y la lluvia.",
    longDesc:
      "Tejido ripstop impermeable, costuras selladas, bolsillos con cremallera. Se pliega en su propio bolsillo.",
    category: "trail"
  }
];

async function ensureCategory(slug: string, name: string, image?: string, parentId?: string | null) {
  return prisma.category.upsert({
    where: { slug },
    update: { name, image: image ?? undefined, parentId: parentId ?? undefined },
    create: { slug, name, image, parentId: parentId ?? undefined }
  });
}

async function ensureCollection(c: (typeof COLLECTIONS)[number]) {
  return prisma.collection.upsert({
    where: { slug: c.slug },
    update: { name: c.name, description: c.description, heroImage: c.heroImage, story: c.story },
    create: { ...c }
  });
}

async function main() {
  console.log("→ Seeding SMURFX database...");

  // Categories: gender + activities + sale
  const cats: Record<string, string> = {};
  for (const c of CATEGORIES) cats[c.slug] = (await ensureCategory(c.slug, c.name, c.image)).id;
  for (const a of ACTIVITY_CATS) cats[a.slug] = (await ensureCategory(a.slug, a.name, a.image)).id;

  // Collections
  const colls: Record<string, string> = {};
  for (const c of COLLECTIONS) colls[c.slug] = (await ensureCollection(c)).id;

  // Pages
  for (const p of [
    { slug: "sobre-nosotros", title: "Sobre SMURFX", body: aboutBody() },
    { slug: "sostenibilidad", title: "Sostenibilidad", body: sustainabilityBody() },
    { slug: "envios-devoluciones", title: "Envíos y devoluciones", body: shippingBody() },
    { slug: "terminos", title: "Términos y condiciones", body: termsBody() },
    { slug: "privacidad", title: "Política de privacidad", body: privacyBody() },
    { slug: "ayuda", title: "Centro de ayuda", body: helpBody() },
    { slug: "guia-de-tallas", title: "Guía de tallas", body: sizeBody() },
    { slug: "empleo", title: "Trabaja con nosotros", body: careersBody() },
    { slug: "members", title: "SmurfX Members", body: membersBody() }
  ]) {
    await prisma.page.upsert({
      where: { slug: p.slug },
      update: { title: p.title, body: p.body },
      create: { slug: p.slug, title: p.title, body: p.body }
    });
  }

  // Blog
  const blogCat = await prisma.blogCategory.upsert({
    where: { slug: "running" },
    update: { name: "Running" },
    create: { slug: "running", name: "Running" }
  });
  const blogCat2 = await prisma.blogCategory.upsert({
    where: { slug: "lifestyle" },
    update: { name: "Lifestyle" },
    create: { slug: "lifestyle", name: "Lifestyle" }
  });
  for (const post of [
    {
      slug: "como-elegir-zapatilla-running",
      title: "Cómo elegir la zapatilla de running perfecta",
      excerpt: "Pisada, kilometraje, terreno: las claves antes de comprar.",
      authorName: "Equipo SMURFX",
      categoryId: blogCat.id,
      coverImage: "/img/blog-1.svg"
    },
    {
      slug: "lookbook-blue-revolution",
      title: "Lookbook: Blue Revolution SS25",
      excerpt: "Inspiración urbana en clave azul lavanda.",
      authorName: "Equipo SMURFX",
      categoryId: blogCat2.id,
      coverImage: "/img/blog-2.svg"
    },
    {
      slug: "training-en-casa",
      title: "Rutina de training en casa para empezar",
      excerpt: "30 minutos, sin equipamiento, máxima intensidad.",
      authorName: "Equipo SMURFX",
      categoryId: blogCat.id,
      coverImage: "/img/blog-3.svg"
    }
  ]) {
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: {},
      create: {
        ...post,
        body: blogBody(post.title),
        publishedAt: new Date()
      }
    });
  }

  // Products
  let createdCount = 0;
  let productOrder = 0;
  const allProducts: { id: string; line: string }[] = [];
  for (let i = 0; i < 50; i++) {
    const tpl = PRODUCT_TEMPLATES[i % PRODUCT_TEMPLATES.length];
    productOrder++;
    const colorsForProduct = COLORS.slice(0, 3 + (i % 4));
    const sizes = tpl.variantTypes.includes("shoe") ? SIZES_SHOE : SIZES_APPAREL;
    const gender = ["hombre", "mujer", "ninos"][i % 3];
    const lineLabel = BRAND.lines.find((l) => l.slug === tpl.line)!.name;
    const name = `${tpl.base} ${["", " Pro", " Lite", " Elite", " Edition"][i % 5]}`.trim();
    const slug = `${name.toLowerCase().replace(/\s+/g, "-")}-${gender}-${productOrder}`;
    const isSale = i % 5 === 0;
    const isNew = i < 12;
    const basePrice = +(79 + (i % 8) * 12 + (tpl.variantTypes.includes("shoe") ? 30 : 0)).toFixed(2);
    const salePrice = isSale ? +(basePrice * 0.8).toFixed(2) : null;

    const product = await prisma.product.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        name,
        shortDesc: tpl.shortDesc,
        description: tpl.longDesc,
        line: lineLabel,
        gender,
        activity: tpl.activity,
        basePrice,
        salePrice,
        isNew,
        status: "published",
        seoTitle: `${name} | SMURFX`,
        seoDesc: tpl.shortDesc,
        categories: {
          connect: [
            { id: cats[gender] },
            { id: cats[tpl.category] },
            ...(isSale ? [{ id: cats["sale"] }] : [])
          ]
        },
        collections: {
          connect: [{ id: colls[Object.keys(colls)[i % 3]] }]
        }
      }
    });
    allProducts.push({ id: product.id, line: lineLabel });

    // Images per color (placeholder SVGs generated below)
    let imgPos = 0;
    for (const color of colorsForProduct) {
      for (let k = 0; k < 2; k++) {
        await prisma.productImage.upsert({
          where: { id: `img_${product.id}_${color.name}_${k}`.replace(/\W/g, "_") },
          update: {},
          create: {
            id: `img_${product.id}_${color.name}_${k}`.replace(/\W/g, "_"),
            productId: product.id,
            url: `/api/img?line=${encodeURIComponent(lineLabel)}&color=${encodeURIComponent(
              color.hex
            )}&n=${k}&seed=${product.id}`,
            alt: `${name} - ${color.name} - vista ${k + 1}`,
            color: color.name,
            position: imgPos++
          }
        });
      }
    }
    // Variants: combinations color x size
    for (const color of colorsForProduct) {
      for (const size of sizes) {
        const sku = `${slug.toUpperCase().slice(0, 18)}-${color.name.slice(0, 3).toUpperCase()}-${size}`.replace(/\W/g, "");
        await prisma.productVariant.upsert({
          where: { sku },
          update: {},
          create: {
            productId: product.id,
            sku,
            size,
            color: color.name,
            colorHex: color.hex,
            stock: 5 + ((i + sizes.indexOf(size)) % 18)
          }
        });
      }
    }
    createdCount++;
  }
  console.log(`  ✓ ${createdCount} productos creados`);

  // Coupons
  for (const c of [
    { code: "WELCOME10", type: "percentage", value: 10, minSubtotal: 30 },
    { code: "SHIP0", type: "free_shipping", value: 0 },
    { code: "BLUE25", type: "percentage", value: 25, minSubtotal: 100 }
  ]) {
    await prisma.coupon.upsert({
      where: { code: c.code },
      update: {},
      create: { ...c, active: true }
    });
  }

  // Users
  const adminEmail = process.env.ADMIN_EMAIL || "admin@smurfx.com";
  const adminPass = process.env.ADMIN_PASSWORD || "Admin1234!";
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "superadmin" },
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPass, 12),
      firstName: "Admin",
      lastName: "SMURFX",
      role: "superadmin",
      emailVerified: true
    }
  });

  console.log("✓ Seed completado");
}

function blogBody(title: string) {
  return `<p>${title} es uno de los temas más buscados por los runners y entusiastas del deporte. En esta guía te contamos todo lo que necesitas saber.</p><h2>Por qué importa</h2><p>Elegir bien marca la diferencia entre disfrutar y sufrir. La elección correcta protege tus articulaciones, mejora tu rendimiento y prolonga la vida útil del producto.</p><h2>Claves rápidas</h2><ul><li>Define tu objetivo: rodaje suave, intervalos o competición.</li><li>Mide bien tu pie y considera anchura, no solo talla.</li><li>Prueba con calcetín técnico, no de algodón.</li><li>Sustituye según kilometraje (zapatillas) o uso (ropa).</li></ul>`;
}
function aboutBody() {
  return `<p>SMURFX nace para mover. Cada pieza está pensada para liberar la siguiente versión de ti. Diseño minimalista, ingeniería premium, propósito claro.</p><h2>Nuestros valores</h2><ul><li>Movimiento sin compromiso.</li><li>Diseño con propósito, sin decoración.</li><li>Materiales y procesos responsables.</li></ul>`;
}
function sustainabilityBody() {
  return `<p>Nuestro compromiso es reducir la huella de cada par. Trabajamos con materiales reciclados, embalajes compostables y rutas logísticas optimizadas.</p>`;
}
function shippingBody() {
  return `<h2>Envío estándar</h2><p>3-5 días laborables. Gratis a partir de 50€.</p><h2>Express</h2><p>1-2 días laborables.</p><h2>Devoluciones</h2><p>Hasta 30 días. Recogida gratuita en tu domicilio.</p>`;
}
function termsBody() {
  return `<p>Estos términos rigen el uso de smurfx.com. Al usar el sitio aceptas estas condiciones. Para cualquier duda contacta con legal@smurfx.com.</p>`;
}
function privacyBody() {
  return `<p>Tratamos tus datos conforme al RGPD. Solo guardamos lo imprescindible. Puedes ejercer tus derechos en privacidad@smurfx.com.</p>`;
}
function helpBody() {
  return `<h2>Pedidos</h2><p>Recibirás un email tras cada cambio de estado.</p><h2>Devoluciones</h2><p>Inicia el proceso desde tu cuenta o como invitado con el número de pedido.</p>`;
}
function sizeBody() {
  return `<h2>Calzado (EU)</h2><p>Mide la longitud del pie en cm y consulta la tabla.</p><h2>Ropa</h2><p>Toma medidas de pecho, cintura y cadera para acertar la talla.</p>`;
}
function careersBody() {
  return `<p>Buscamos personas que se mueven. Posiciones abiertas: Product Designer, Senior Backend, Brand Manager, Retail Lead.</p>`;
}
function membersBody() {
  return `<p>SmurfX Members es nuestro programa de fidelización. Acumula puntos por cada compra, valoración y referido. Sube de nivel y desbloquea beneficios.</p>`;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
