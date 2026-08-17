import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { ProductsService } from './products.service';

function buildProduct(id: string, variantIds: string[]) {
  return {
    id,
    variants: variantIds.map((vid) => ({ id: vid })),
  };
}

function buildXlsxFile(rows: Record<string, unknown>[]): Express.Multer.File {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Products');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return { buffer } as Express.Multer.File;
}

function buildCsvFile(csvText: string): Express.Multer.File {
  return { buffer: Buffer.from(csvText, 'utf-8') } as Express.Multer.File;
}

describe('ProductsService', () => {
  let prisma: any;
  let search: any;
  let service: ProductsService;

  beforeEach(() => {
    prisma = {
      product: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
      review: { groupBy: jest.fn().mockResolvedValue([]) },
      stock: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({}) },
      brand: { findMany: jest.fn().mockResolvedValue([]) },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      warehouse: { findUnique: jest.fn() },
    };
    search = { indexProduct: jest.fn().mockResolvedValue(undefined) };
    service = new ProductsService(prisma, search);
  });

  describe('get() — stock aggregation', () => {
    it('sums available (quantity - reserved) stock across every variant/warehouse for the product', async () => {
      prisma.product.findFirst.mockResolvedValue(buildProduct('p1', ['v1', 'v2']));
      prisma.stock.findMany.mockResolvedValue([
        { productVariantId: 'v1', quantity: 10, reservedQuantity: 2 }, // warehouse A
        { productVariantId: 'v1', quantity: 5, reservedQuantity: 0 }, // warehouse B, same variant
        { productVariantId: 'v2', quantity: 3, reservedQuantity: 1 },
      ]);

      const result = await service.get('p1');
      // v1: (10-2) + (5-0) = 13, v2: (3-1) = 2 → total 15
      expect(result.totalStock).toBe(15);
    });

    it('never lets a single row with reserved > quantity push the total negative', async () => {
      prisma.product.findFirst.mockResolvedValue(buildProduct('p1', ['v1']));
      prisma.stock.findMany.mockResolvedValue([{ productVariantId: 'v1', quantity: 3, reservedQuantity: 5 }]);

      const result = await service.get('p1');
      expect(result.totalStock).toBe(0);
    });

    it('reports zero stock (not undefined/NaN) for a product with no stock rows at all', async () => {
      prisma.product.findFirst.mockResolvedValue(buildProduct('p1', ['v1']));
      prisma.stock.findMany.mockResolvedValue([]);

      const result = await service.get('p1');
      expect(result.totalStock).toBe(0);
    });

    it('throws NotFoundException for a missing product', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.get('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('list() — public visibility', () => {
    it('forces status=PUBLISHED for anonymous/customer callers regardless of the requested status filter', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.list({ status: 'DRAFT' } as any, undefined);

      const where = prisma.product.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('PUBLISHED');
    });

    it('lets staff requesters see the status filter they asked for', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.list({ status: 'DRAFT' } as any, { role: 'ADMIN' } as any);

      const where = prisma.product.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('DRAFT');
    });
  });

  describe('bulkImport', () => {
    it('rejects a file with no data rows', async () => {
      const file = buildXlsxFile([]);
      await expect(service.bulkImport(file)).rejects.toThrow(BadRequestException);
    });

    it('rejects when the given warehouseId does not exist', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);
      const file = buildXlsxFile([{ name: 'لامپ', slug: 'lamp-1', sku: 'SKU-1', basePrice: 10000 }]);
      await expect(service.bulkImport(file, 'missing-wh')).rejects.toThrow(BadRequestException);
    });

    it('creates a product per valid row and reports zero failures', async () => {
      let counter = 0;
      prisma.product.create.mockImplementation(() =>
        Promise.resolve({ id: `p${++counter}`, variants: [{ id: `v${counter}` }] }),
      );
      const file = buildXlsxFile([
        { name: 'لامپ ۱', slug: 'lamp-1', sku: 'SKU-1', basePrice: 10000 },
        { name: 'لامپ ۲', slug: 'lamp-2', sku: 'SKU-2', basePrice: 20000 },
      ]);

      const result = await service.bulkImport(file);

      expect(result).toEqual({ totalRows: 2, created: 2, failed: 0, errors: [] });
      expect(prisma.product.create).toHaveBeenCalledTimes(2);
    });

    it('reports a row missing a required column as a per-row error without aborting the batch', async () => {
      let counter = 0;
      prisma.product.create.mockImplementation(() =>
        Promise.resolve({ id: `p${++counter}`, variants: [{ id: `v${counter}` }] }),
      );
      const file = buildXlsxFile([
        { name: 'لامپ ۱', slug: 'lamp-1', sku: 'SKU-1', basePrice: 10000 },
        { name: 'لامپ بدون قیمت', slug: 'lamp-2', sku: 'SKU-2', basePrice: '' },
      ]);

      const result = await service.bulkImport(file);

      expect(result.created).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toMatchObject({ row: 3, message: expect.stringContaining('الزامی') });
    });

    it('resolves brand and category names case-insensitively', async () => {
      prisma.brand.findMany.mockResolvedValue([{ id: 'b1', name: 'برند الف' }]);
      prisma.category.findMany.mockResolvedValue([{ id: 'c1', name: 'روشنایی' }]);
      prisma.product.create.mockResolvedValue({ id: 'p1', variants: [{ id: 'v1' }] });
      const file = buildXlsxFile([
        { name: 'لامپ', slug: 'lamp-1', sku: 'SKU-1', basePrice: 10000, brand: 'برند الف', category: 'روشنایی' },
      ]);

      await service.bulkImport(file);

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ brandId: 'b1', categoryId: 'c1' }) }),
      );
    });

    it('reports an unknown brand name as a row error', async () => {
      prisma.brand.findMany.mockResolvedValue([{ id: 'b1', name: 'برند الف' }]);
      const file = buildXlsxFile([
        { name: 'لامپ', slug: 'lamp-1', sku: 'SKU-1', basePrice: 10000, brand: 'برند ناشناخته' },
      ]);

      const result = await service.bulkImport(file);

      expect(result.created).toBe(0);
      expect(result.errors[0].message).toContain('برند ناشناخته');
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('creates a stock row for the given warehouse when a quantity is provided', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({ id: 'wh1' });
      prisma.product.create.mockResolvedValue({ id: 'p1', variants: [{ id: 'v1' }] });
      const file = buildXlsxFile([{ name: 'لامپ', slug: 'lamp-1', sku: 'SKU-1', basePrice: 10000, quantity: 25 }]);

      await service.bulkImport(file, 'wh1');

      expect(prisma.stock.upsert).toHaveBeenCalledWith({
        where: { warehouseId_productVariantId: { warehouseId: 'wh1', productVariantId: 'v1' } },
        create: { warehouseId: 'wh1', productVariantId: 'v1', quantity: 25 },
        update: { quantity: { increment: 25 } },
      });
    });

    it('does not create a stock row when no warehouse was selected for the import', async () => {
      prisma.product.create.mockResolvedValue({ id: 'p1', variants: [{ id: 'v1' }] });
      const file = buildXlsxFile([{ name: 'لامپ', slug: 'lamp-1', sku: 'SKU-1', basePrice: 10000, quantity: 25 }]);

      await service.bulkImport(file);

      expect(prisma.stock.upsert).not.toHaveBeenCalled();
    });

    it('reports a duplicate slug/SKU (Prisma P2002) as a friendly message and keeps processing later rows', async () => {
      const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      });
      prisma.product.create
        .mockRejectedValueOnce(duplicateError)
        .mockResolvedValueOnce({ id: 'p2', variants: [{ id: 'v2' }] });
      const file = buildXlsxFile([
        { name: 'لامپ تکراری', slug: 'existing-slug', sku: 'SKU-DUP', basePrice: 10000 },
        { name: 'لامپ جدید', slug: 'lamp-new', sku: 'SKU-NEW', basePrice: 15000 },
      ]);

      const result = await service.bulkImport(file);

      expect(result.created).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0].message).toContain('تکراری');
    });

    // A .csv is plain text with no self-declared encoding, unlike a real
    // .xlsx (a ZIP archive that carries its own). Reading it the same way
    // as a binary workbook mangles non-ASCII text — this guards the fix.
    it('correctly decodes UTF-8 Persian text from a plain CSV file (not just real .xlsx)', async () => {
      prisma.product.create.mockResolvedValue({ id: 'p1', variants: [{ id: 'v1' }] });
      const file = buildCsvFile('name,slug,sku,basePrice\nلامپ کم‌مصرف,lamp-csv,SKU-CSV-1,10000\n');

      await service.bulkImport(file);

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'لامپ کم‌مصرف', slug: 'lamp-csv' }) }),
      );
    });

    it('strips a leading UTF-8 BOM from a CSV file instead of corrupting the first column name', async () => {
      prisma.product.create.mockResolvedValue({ id: 'p1', variants: [{ id: 'v1' }] });
      const file = buildCsvFile('﻿name,slug,sku,basePrice\nلامپ,lamp-bom,SKU-BOM-1,10000\n');

      const result = await service.bulkImport(file);

      expect(result.created).toBe(1);
      expect(result.failed).toBe(0);
    });
  });
});
