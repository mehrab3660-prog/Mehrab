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

  // ── Smart Electrical Consultant (Sprint 7) demo catalog + rules ──
  // A second, pricier real brand so the PROFESSIONAL tier has a genuine
  // priority-brand candidate to pick, distinct from the economic/standard
  // picks — never fabricated, just a second real seeded brand/product line.
  const premiumBrand = await prisma.brand.upsert({
    where: { slug: 'barq-gostar-premium' },
    create: { name: 'برق‌گستر پریمیوم', slug: 'barq-gostar-premium' },
    update: {},
  });

  const switchCategory = await prisma.category.upsert({
    where: { slug: 'switches-outlets' },
    create: { name: 'کلید و پریز', slug: 'switches-outlets' },
    update: {},
  });

  async function seedConsultantProduct(opts: {
    name: string;
    slug: string;
    sku: string;
    price: number;
    stock: number;
    brandId: string;
    categoryId: string;
  }) {
    const p = await prisma.product.upsert({
      where: { slug: opts.slug },
      create: {
        name: opts.name,
        slug: opts.slug,
        status: 'PUBLISHED',
        basePrice: opts.price,
        brandId: opts.brandId,
        categoryId: opts.categoryId,
        variants: { create: [{ sku: opts.sku, attributes: {}, price: opts.price }] },
      },
      update: {},
    });
    const v = await prisma.productVariant.findFirstOrThrow({ where: { productId: p.id } });
    await prisma.stock.upsert({
      where: { warehouseId_productVariantId: { warehouseId: warehouse.id, productVariantId: v.id } },
      create: { warehouseId: warehouse.id, productVariantId: v.id, quantity: opts.stock },
      update: {},
    });
    return p;
  }

  const switchEco = await seedConsultantProduct({ name: 'کلید تک‌پل اقتصادی', slug: 'switch-1pole-economic', sku: 'SW-1P-ECO', price: 35000, stock: 300, brandId: brand.id, categoryId: switchCategory.id });
  const switchStd = await seedConsultantProduct({ name: 'کلید تک‌پل استاندارد', slug: 'switch-1pole-standard', sku: 'SW-1P-STD', price: 55000, stock: 300, brandId: brand.id, categoryId: switchCategory.id });
  const switchPro = await seedConsultantProduct({ name: 'کلید تک‌پل حرفه‌ای برق‌گستر', slug: 'switch-1pole-pro', sku: 'SW-1P-PRO', price: 95000, stock: 150, brandId: premiumBrand.id, categoryId: switchCategory.id });
  const socketStd = await seedConsultantProduct({ name: 'پریز برق استاندارد', slug: 'socket-standard', sku: 'SOC-STD', price: 40000, stock: 300, brandId: brand.id, categoryId: switchCategory.id });
  const socketEarthed = await seedConsultantProduct({ name: 'پریز ارت استاندارد', slug: 'socket-earthed-standard', sku: 'SOC-EARTH-STD', price: 48000, stock: 200, brandId: brand.id, categoryId: switchCategory.id });

  await prisma.consultantItemRule.upsert({
    where: { itemKey: 'LAMP' },
    create: { itemKey: 'LAMP', label: 'لامپ', categoryId: category.id, minQuantity: 1, maxQuantity: 100 },
    update: {},
  });
  // SOCKET vs SOCKET_EARTHED share a category and both contain the
  // substring "پریز" in their real names, so a plain keyword match can't
  // tell them apart — an explicit admin-curated allow-list of real product
  // ids (§12 "محصولات قابل پیشنهاد") is the honest, unambiguous way to
  // scope each rule instead of guessing from the name.
  await prisma.consultantItemRule.upsert({
    where: { itemKey: 'SWITCH' },
    create: {
      itemKey: 'SWITCH',
      label: 'کلید',
      categoryId: switchCategory.id,
      minQuantity: 1,
      maxQuantity: 60,
      priorityBrandIds: premiumBrand.id,
      allowedProductIdsJson: [switchEco.id, switchStd.id, switchPro.id],
    },
    update: {},
  });
  await prisma.consultantItemRule.upsert({
    where: { itemKey: 'SOCKET' },
    create: { itemKey: 'SOCKET', label: 'پریز', categoryId: switchCategory.id, minQuantity: 1, maxQuantity: 60, allowedProductIdsJson: [socketStd.id] },
    update: {},
  });
  await prisma.consultantItemRule.upsert({
    where: { itemKey: 'SOCKET_EARTHED' },
    create: { itemKey: 'SOCKET_EARTHED', label: 'پریز ارت', categoryId: switchCategory.id, minQuantity: 0, maxQuantity: 40, allowedProductIdsJson: [socketEarthed.id] },
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
