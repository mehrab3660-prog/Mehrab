import { SeoAuditService } from './seo-audit.service';

function buildProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p1',
    name: 'محصول تست',
    metaTitle: 'عنوان سئوی محصول تست خوب',
    metaDescription: 'این یک توضیح متای کاملاً استاندارد و با طول مناسب برای موتورهای جستجو است که همه چیز را پوشش می‌دهد.',
    searchKeywords: 'کلید, پریز',
    description: 'ا'.repeat(120),
    images: [{ id: 'img1', altText: 'یک تصویر محصول' }],
    ...overrides,
  };
}

describe('SeoAuditService', () => {
  let prisma: any;
  let service: SeoAuditService;

  beforeEach(() => {
    prisma = {
      product: { findMany: jest.fn().mockResolvedValue([]) },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      blogPost: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new SeoAuditService(prisma);
  });

  it('only audits PUBLISHED products, not drafts/archived', async () => {
    await service.run();
    expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({ status: 'PUBLISHED' });
  });

  it('flags a product with no metaTitle as HIGH severity', async () => {
    prisma.product.findMany.mockResolvedValue([buildProduct({ metaTitle: null })]);
    const problems = await service.run();
    expect(problems).toContainEqual(expect.objectContaining({ entityId: 'p1', field: 'metaTitle', severity: 'HIGH', message: expect.stringContaining('تنظیم نشده') }));
  });

  it('flags a metaTitle that is too short or too long as LOW severity, not missing', async () => {
    prisma.product.findMany.mockResolvedValue([buildProduct({ metaTitle: 'کوتاه' })]);
    const problems = await service.run();
    expect(problems).toContainEqual(expect.objectContaining({ entityId: 'p1', field: 'metaTitle', severity: 'LOW' }));
  });

  it('flags a product with no metaDescription as HIGH severity', async () => {
    prisma.product.findMany.mockResolvedValue([buildProduct({ metaDescription: null })]);
    const problems = await service.run();
    expect(problems).toContainEqual(expect.objectContaining({ entityId: 'p1', field: 'metaDescription', severity: 'HIGH' }));
  });

  it('flags missing searchKeywords', async () => {
    prisma.product.findMany.mockResolvedValue([buildProduct({ searchKeywords: null })]);
    const problems = await service.run();
    expect(problems).toContainEqual(expect.objectContaining({ entityId: 'p1', field: 'searchKeywords' }));
  });

  it('flags a description that is too short', async () => {
    prisma.product.findMany.mockResolvedValue([buildProduct({ description: 'کوتاه' })]);
    const problems = await service.run();
    expect(problems).toContainEqual(expect.objectContaining({ entityId: 'p1', field: 'description' }));
  });

  it('flags any image missing alt text', async () => {
    prisma.product.findMany.mockResolvedValue([buildProduct({ images: [{ id: 'i1', altText: null }, { id: 'i2', altText: 'خوب' }] })]);
    const problems = await service.run();
    expect(problems).toContainEqual(expect.objectContaining({ entityId: 'p1', field: 'images.altText', message: expect.stringContaining('1') }));
  });

  it('reports a fully well-formed product with zero problems', async () => {
    prisma.product.findMany.mockResolvedValue([buildProduct()]);
    const problems = await service.run();
    expect(problems.filter((p) => p.entityId === 'p1')).toEqual([]);
  });

  it('flags duplicate metaTitle across two different products', async () => {
    prisma.product.findMany.mockResolvedValue([
      buildProduct({ id: 'p1', metaTitle: 'همین عنوان تکراری است' }),
      buildProduct({ id: 'p2', metaTitle: 'همین عنوان تکراری است' }),
    ]);
    const problems = await service.run();
    expect(problems.filter((p) => p.field === 'metaTitle' && p.message.includes('تکراری'))).toHaveLength(2);
  });

  it('flags duplicate metaDescription across two different products', async () => {
    const dup = 'یک توضیح متای کاملاً یکسان و تکراری بین دو محصول مختلف که هر دو از آن استفاده کرده‌اند به اشتباه.';
    prisma.product.findMany.mockResolvedValue([buildProduct({ id: 'p1', metaDescription: dup }), buildProduct({ id: 'p2', metaDescription: dup })]);
    const problems = await service.run();
    expect(problems.filter((p) => p.field === 'metaDescription' && p.message.includes('تکراری'))).toHaveLength(2);
  });

  it('flags a category with no description', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 'c1', name: 'کلید و پریز', description: null }]);
    const problems = await service.run();
    expect(problems).toContainEqual(expect.objectContaining({ entityType: 'Category', entityId: 'c1', field: 'description' }));
  });

  it('flags a published blog post missing metaTitle/metaDescription', async () => {
    prisma.blogPost.findMany.mockImplementation(({ where }: any) =>
      where?.isPublished
        ? Promise.resolve([{ id: 'b1', title: 'مقاله', slug: 'maghale', content: 'م'.repeat(300), metaTitle: null, metaDescription: null }])
        : Promise.resolve([]),
    );
    const problems = await service.run();
    expect(problems.filter((p) => p.entityType === 'BlogPost' && p.entityId === 'b1')).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'metaTitle' }), expect.objectContaining({ field: 'metaDescription' })]),
    );
  });

  it('flags a blog post whose content is too short', async () => {
    prisma.blogPost.findMany.mockImplementation(({ where }: any) =>
      where?.isPublished
        ? Promise.resolve([{ id: 'b1', title: 'مقاله', slug: 'maghale', content: 'خیلی کوتاه', metaTitle: 'x', metaDescription: 'y' }])
        : Promise.resolve([]),
    );
    const problems = await service.run();
    expect(problems).toContainEqual(expect.objectContaining({ entityId: 'b1', field: 'content', message: expect.stringContaining('کوتاه') }));
  });

  it('flags a broken internal link inside blog content pointing at a non-existent product slug', async () => {
    prisma.blogPost.findMany.mockImplementation(({ where }: any) =>
      where?.isPublished
        ? Promise.resolve([
            {
              id: 'b1',
              title: 'مقاله',
              slug: 'maghale',
              content: `${'م'.repeat(250)} به /products/does-not-exist مراجعه کنید`,
              metaTitle: 'x',
              metaDescription: 'y',
            },
          ])
        : Promise.resolve([]),
    );
    prisma.product.findMany.mockImplementation(({ select }: any) => (select?.slug ? Promise.resolve([{ slug: 'real-product' }]) : Promise.resolve([])));
    const problems = await service.run();
    expect(problems).toContainEqual(expect.objectContaining({ entityId: 'b1', field: 'content', message: expect.stringContaining('does-not-exist') }));
  });

  it('never flags an internal link that points at a real, existing product slug', async () => {
    prisma.blogPost.findMany.mockImplementation(({ where }: any) =>
      where?.isPublished
        ? Promise.resolve([
            { id: 'b1', title: 'مقاله', slug: 'maghale', content: `${'م'.repeat(250)} به /products/real-product مراجعه کنید`, metaTitle: 'x', metaDescription: 'y' },
          ])
        : Promise.resolve([]),
    );
    prisma.product.findMany.mockImplementation(({ select }: any) => (select?.slug ? Promise.resolve([{ slug: 'real-product' }]) : Promise.resolve([])));
    const problems = await service.run();
    expect(problems.filter((p: any) => p.entityId === 'b1' && p.message.includes('ناموجود'))).toEqual([]);
  });
});
