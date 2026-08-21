import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SeoProblem {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  entityType: 'Product' | 'Category' | 'BlogPost';
  entityId: string;
  entityName: string;
  field: string;
  message: string;
}

const META_TITLE_MIN = 10;
const META_TITLE_MAX = 60;
const META_DESCRIPTION_MIN = 50;
const META_DESCRIPTION_MAX = 160;
const DESCRIPTION_MIN = 100;
const BLOG_CONTENT_MIN = 200;

// Pure, rule-based checks against real Product/Category/BlogPost rows — no
// AI involved, so nothing here is ever a guess. Every problem points at a
// real row the admin can go fix (directly, or via a Sprint 4 SEO
// suggestion). Deliberately does not attempt to verify canonical tags or
// indexability from the API — those are set at render time in the Next.js
// page components (already covered by the site's existing metadata setup)
// and are not something a database query can honestly confirm or deny.
@Injectable()
export class SeoAuditService {
  constructor(private prisma: PrismaService) {}

  async run(): Promise<SeoProblem[]> {
    const [products, categories, blogPosts] = await Promise.all([
      this.prisma.product.findMany({
        where: { status: 'PUBLISHED' },
        select: { id: true, name: true, metaTitle: true, metaDescription: true, searchKeywords: true, description: true, images: { select: { id: true, altText: true } } },
      }),
      this.prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true, description: true } }),
      this.prisma.blogPost.findMany({
        where: { isPublished: true },
        select: { id: true, title: true, slug: true, content: true, metaTitle: true, metaDescription: true },
      }),
    ]);

    const problems: SeoProblem[] = [];

    problems.push(...this.auditProducts(products));
    problems.push(...this.auditCategories(categories));
    problems.push(...(await this.auditBlogPosts(blogPosts)));

    return problems;
  }

  private auditProducts(
    products: {
      id: string;
      name: string;
      metaTitle: string | null;
      metaDescription: string | null;
      searchKeywords: string | null;
      description: string | null;
      images: { id: string; altText: string | null }[];
    }[],
  ): SeoProblem[] {
    const problems: SeoProblem[] = [];

    const titleGroups = new Map<string, string[]>();
    const descriptionGroups = new Map<string, string[]>();

    for (const p of products) {
      if (!p.metaTitle) {
        problems.push({ severity: 'HIGH', entityType: 'Product', entityId: p.id, entityName: p.name, field: 'metaTitle', message: 'عنوان سئو تنظیم نشده است' });
      } else {
        if (p.metaTitle.length < META_TITLE_MIN || p.metaTitle.length > META_TITLE_MAX) {
          problems.push({
            severity: 'LOW',
            entityType: 'Product',
            entityId: p.id,
            entityName: p.name,
            field: 'metaTitle',
            message: `طول عنوان سئو نامناسب است (${p.metaTitle.length} کاراکتر — بازه‌ی مناسب ${META_TITLE_MIN} تا ${META_TITLE_MAX})`,
          });
        }
        const key = p.metaTitle.trim().toLowerCase();
        titleGroups.set(key, [...(titleGroups.get(key) ?? []), p.id]);
      }

      if (!p.metaDescription) {
        problems.push({ severity: 'HIGH', entityType: 'Product', entityId: p.id, entityName: p.name, field: 'metaDescription', message: 'توضیح متا تنظیم نشده است' });
      } else {
        if (p.metaDescription.length < META_DESCRIPTION_MIN || p.metaDescription.length > META_DESCRIPTION_MAX) {
          problems.push({
            severity: 'LOW',
            entityType: 'Product',
            entityId: p.id,
            entityName: p.name,
            field: 'metaDescription',
            message: `طول توضیح متا نامناسب است (${p.metaDescription.length} کاراکتر — بازه‌ی مناسب ${META_DESCRIPTION_MIN} تا ${META_DESCRIPTION_MAX})`,
          });
        }
        const key = p.metaDescription.trim().toLowerCase();
        descriptionGroups.set(key, [...(descriptionGroups.get(key) ?? []), p.id]);
      }

      if (!p.searchKeywords) {
        problems.push({ severity: 'MEDIUM', entityType: 'Product', entityId: p.id, entityName: p.name, field: 'searchKeywords', message: 'کلمات کلیدی جستجو تنظیم نشده است' });
      }

      if (!p.description || p.description.trim().length < DESCRIPTION_MIN) {
        problems.push({ severity: 'MEDIUM', entityType: 'Product', entityId: p.id, entityName: p.name, field: 'description', message: 'توضیحات محصول خیلی کوتاه یا ناقص است' });
      }

      const missingAlt = p.images.filter((img) => !img.altText || !img.altText.trim());
      if (missingAlt.length > 0) {
        problems.push({
          severity: 'MEDIUM',
          entityType: 'Product',
          entityId: p.id,
          entityName: p.name,
          field: 'images.altText',
          message: `${missingAlt.length} تصویر بدون متن جایگزین (alt) دارد`,
        });
      }
    }

    for (const [, ids] of titleGroups) {
      if (ids.length > 1) {
        for (const id of ids) {
          const p = products.find((x) => x.id === id)!;
          problems.push({ severity: 'MEDIUM', entityType: 'Product', entityId: id, entityName: p.name, field: 'metaTitle', message: `عنوان سئو با ${ids.length - 1} محصول دیگر تکراری است` });
        }
      }
    }
    for (const [, ids] of descriptionGroups) {
      if (ids.length > 1) {
        for (const id of ids) {
          const p = products.find((x) => x.id === id)!;
          problems.push({ severity: 'MEDIUM', entityType: 'Product', entityId: id, entityName: p.name, field: 'metaDescription', message: `توضیح متا با ${ids.length - 1} محصول دیگر تکراری است` });
        }
      }
    }

    return problems;
  }

  private auditCategories(categories: { id: string; name: string; description: string | null }[]): SeoProblem[] {
    return categories
      .filter((c) => !c.description || c.description.trim().length < DESCRIPTION_MIN)
      .map((c) => ({
        severity: 'LOW' as const,
        entityType: 'Category' as const,
        entityId: c.id,
        entityName: c.name,
        field: 'description',
        message: 'توضیحات دسته‌بندی تنظیم نشده یا خیلی کوتاه است',
      }));
  }

  private async auditBlogPosts(
    posts: { id: string; title: string; slug: string; content: string; metaTitle: string | null; metaDescription: string | null }[],
  ): Promise<SeoProblem[]> {
    const problems: SeoProblem[] = [];
    if (posts.length === 0) return problems;

    const [productSlugs, blogSlugs] = await Promise.all([
      this.prisma.product.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true } }).then((r) => new Set(r.map((p) => p.slug))),
      this.prisma.blogPost.findMany({ select: { slug: true } }).then((r) => new Set(r.map((p) => p.slug))),
    ]);

    for (const post of posts) {
      if (!post.metaTitle) {
        problems.push({ severity: 'HIGH', entityType: 'BlogPost', entityId: post.id, entityName: post.title, field: 'metaTitle', message: 'عنوان سئو مقاله تنظیم نشده است' });
      }
      if (!post.metaDescription) {
        problems.push({ severity: 'HIGH', entityType: 'BlogPost', entityId: post.id, entityName: post.title, field: 'metaDescription', message: 'توضیح متا مقاله تنظیم نشده است' });
      }
      if (post.content.trim().length < BLOG_CONTENT_MIN) {
        problems.push({ severity: 'MEDIUM', entityType: 'BlogPost', entityId: post.id, entityName: post.title, field: 'content', message: 'محتوای مقاله خیلی کوتاه یا ناقص است' });
      }

      for (const brokenSlug of this.findBrokenInternalLinks(post.content, productSlugs, blogSlugs)) {
        problems.push({
          severity: 'HIGH',
          entityType: 'BlogPost',
          entityId: post.id,
          entityName: post.title,
          field: 'content',
          message: `لینک داخلی به یک صفحه‌ی ناموجود اشاره می‌کند: ${brokenSlug}`,
        });
      }
    }

    return problems;
  }

  // Scans rendered content for /products/<slug> and /blog/<slug> references
  // and flags any that don't match a real, existing slug. Intentionally
  // simple (a path regex, not an HTML parser) — good enough to catch a
  // stale link after a product/post is renamed or removed.
  private findBrokenInternalLinks(content: string, productSlugs: Set<string>, blogSlugs: Set<string>): string[] {
    const broken: string[] = [];
    const pattern = /\/(products|blog)\/([\w؀-ۿ-]+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) {
      const [full, section, slug] = match;
      const exists = section === 'products' ? productSlugs.has(slug) : blogSlugs.has(slug);
      if (!exists) broken.push(full);
    }
    return broken;
  }
}
