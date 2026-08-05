import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const superAdmin = await prisma.user.upsert({
    where: { phone: '09120000000' },
    create: { phone: '09120000000', fullName: 'مدیر سیستم', role: 'SUPER_ADMIN', isPhoneVerified: true },
    update: {},
  });

  const retailGroup = await prisma.customerGroup.upsert({
    where: { name: 'خرده‌فروشی' },
    create: { name: 'خرده‌فروشی', description: 'مشتریان عادی (B2C)' },
    update: {},
  });
  const wholesaleGroup = await prisma.customerGroup.upsert({
    where: { name: 'عمده‌فروشی طلایی' },
    create: { name: 'عمده‌فروشی طلایی', description: 'مشتریان B2B با تخفیف پلکانی' },
    update: {},
  });

  const warehouse = await prisma.warehouse.upsert({
    where: { name: 'انبار مرکزی تهران' },
    create: { name: 'انبار مرکزی تهران', address: 'تهران' },
    update: {},
  });

  const brand = await prisma.brand.upsert({
    where: { slug: 'sultan-noor-house' },
    create: { name: 'سلطان نور', slug: 'sultan-noor-house' },
    update: {},
  });

  const category = await prisma.category.upsert({
    where: { slug: 'lighting' },
    create: { name: 'روشنایی', slug: 'lighting' },
    update: {},
  });

  const product = await prisma.product.upsert({
    where: { slug: 'led-bulb-9w' },
    create: {
      name: 'لامپ LED نه وات',
      slug: 'led-bulb-9w',
      description: 'لامپ کم‌مصرف LED با نور طبیعی',
      status: 'PUBLISHED',
      basePrice: 150000,
      minWholesaleQty: 12,
      brandId: brand.id,
      categoryId: category.id,
      variants: { create: [{ sku: 'LED-9W-WHITE', attributes: { color: 'white' }, price: 150000 }] },
    },
    update: {},
  });

  const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId: product.id } });

  await prisma.stock.upsert({
    where: { warehouseId_productVariantId: { warehouseId: warehouse.id, productVariantId: variant.id } },
    create: { warehouseId: warehouse.id, productVariantId: variant.id, quantity: 200 },
    update: {},
  });

  await prisma.priceTier.upsert({
    where: { productId_customerGroupId_minQuantity: { productId: product.id, customerGroupId: wholesaleGroup.id, minQuantity: 12 } },
    create: { productId: product.id, customerGroupId: wholesaleGroup.id, minQuantity: 12, unitPrice: 120000 },
    update: {},
  });

  await prisma.banner.upsert({
    where: { id: 'seed-banner-home-hero' },
    create: {
      id: 'seed-banner-home-hero',
      title: 'جشنواره روشنایی سلطان نور',
      imageUrl: '/banners/hero.jpg',
      placement: 'HOME_HERO',
      position: 0,
    },
    update: {},
  });

  console.log('Seed complete:', { superAdmin: superAdmin.phone, retailGroup: retailGroup.name, wholesaleGroup: wholesaleGroup.name });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
