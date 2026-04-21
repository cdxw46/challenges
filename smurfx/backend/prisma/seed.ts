import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create Categories
  const catRunning = await prisma.category.create({
    data: { name: 'Running', slug: 'running', description: 'Zapatillas de running' },
  });
  const catLifestyle = await prisma.category.create({
    data: { name: 'Lifestyle', slug: 'lifestyle', description: 'Zapatillas de uso diario' },
  });

  // Create Products
  const prod1 = await prisma.product.create({
    data: {
      name: 'SmurfAir Max 1',
      slug: 'smurfair-max-1',
      description: 'El clásico reinventado con tecnología de aire visible.',
      shortDesc: 'Vuela con estilo',
      price: 149.99,
      sku: 'SM-AIR-MAX-1',
      status: 'PUBLISHED',
      categoryId: catLifestyle.id,
      variants: {
        create: [
          { size: '40', color: 'Morado', stock: 10, sku: 'SM-AIR-MAX-1-40-M' },
          { size: '41', color: 'Morado', stock: 15, sku: 'SM-AIR-MAX-1-41-M' },
          { size: '42', color: 'Morado', stock: 5, sku: 'SM-AIR-MAX-1-42-M' },
        ],
      },
      images: {
        create: [
          { url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80', isPrimary: true, alt: 'SmurfAir Max 1' },
        ],
      },
    },
  });

  const prod2 = await prisma.product.create({
    data: {
      name: 'SmurfRun Pro',
      slug: 'smurfrun-pro',
      description: 'Para los corredores más exigentes. Ligereza y reactividad.',
      shortDesc: 'Sin límites',
      price: 189.99,
      sku: 'SM-RUN-PRO',
      status: 'PUBLISHED',
      categoryId: catRunning.id,
      variants: {
        create: [
          { size: '41', color: 'Blanco', stock: 20, sku: 'SM-RUN-PRO-41-B' },
          { size: '42', color: 'Blanco', stock: 25, sku: 'SM-RUN-PRO-42-B' },
        ],
      },
      images: {
        create: [
          { url: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=800&q=80', isPrimary: true, alt: 'SmurfRun Pro' },
        ],
      },
    },
  });

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
