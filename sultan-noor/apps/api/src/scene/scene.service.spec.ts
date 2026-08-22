import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SceneService } from './scene.service';

describe('SceneService', () => {
  let prisma: any;
  let settings: any;
  let products: any;
  let service: SceneService;

  beforeEach(() => {
    prisma = {
      sceneHotspot: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      product: { findUnique: jest.fn() },
    };
    settings = { resolve: jest.fn() };
    products = { getManyByIds: jest.fn() };
    service = new SceneService(prisma, settings, products);
  });

  describe('getPublicConfig', () => {
    it('is enabled by default when the setting is unset', async () => {
      settings.resolve.mockResolvedValue(undefined);
      await expect(service.getPublicConfig()).resolves.toEqual({ enabled: true });
    });

    it('is disabled only when explicitly set to the literal string "false"', async () => {
      settings.resolve.mockResolvedValue('false');
      await expect(service.getPublicConfig()).resolves.toEqual({ enabled: false });
    });
  });

  describe('listPublicHotspots — NO FAKE PRODUCTS enforcement', () => {
    it('drops a hotspot whose product no longer exists or is not PUBLISHED', async () => {
      prisma.sceneHotspot.findMany.mockResolvedValue([
        { id: 'h1', label: 'لامپ', icon: '💡', positionX: 1, positionY: 2, positionZ: 3, productId: 'p1' },
        { id: 'h2', label: 'پریز', icon: '🔌', positionX: 0, positionY: 0, positionZ: 0, productId: 'p2-deleted' },
      ]);
      // getManyByIds already filters to real, PUBLISHED products (reused from ProductsService)
      products.getManyByIds.mockResolvedValue([
        {
          id: 'p1',
          name: 'لامپ ال ای دی',
          slug: 'led-lamp',
          brand: { name: 'برند' },
          basePrice: '150000',
          totalStock: 5,
          images: [{ url: 'https://example.com/x.jpg' }],
          avgRating: 4.5,
          reviewCount: 3,
        },
      ]);

      const result = await service.listPublicHotspots();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('h1');
      expect(result[0].product.id).toBe('p1');
      expect(result[0].product.price).toBe(150000);
    });

    it('returns an empty list without querying products when there are no active hotspots', async () => {
      prisma.sceneHotspot.findMany.mockResolvedValue([]);
      const result = await service.listPublicHotspots();
      expect(result).toEqual([]);
      expect(products.getManyByIds).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('rejects a hotspot pointing at a product ID that does not exist in the real catalog', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ label: 'جعلی', positionX: 0, positionY: 0, positionZ: 0, productId: 'fake-id' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.sceneHotspot.create).not.toHaveBeenCalled();
    });

    it('creates a hotspot when the product is real', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.sceneHotspot.create.mockResolvedValue({ id: 'h1' });
      const result = await service.create({ label: 'لامپ', positionX: 1, positionY: 1, positionZ: 1, productId: 'p1' });
      expect(result).toEqual({ id: 'h1' });
      expect(prisma.sceneHotspot.create).toHaveBeenCalled();
    });
  });

  describe('update / remove', () => {
    it('throws NotFoundException when updating a hotspot that does not exist', async () => {
      prisma.sceneHotspot.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', { label: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when removing a hotspot that does not exist', async () => {
      prisma.sceneHotspot.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });

    it('rejects reassigning a hotspot to a fake product ID on update', async () => {
      prisma.sceneHotspot.findUnique.mockResolvedValue({ id: 'h1' });
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.update('h1', { productId: 'fake-id' })).rejects.toThrow(BadRequestException);
      expect(prisma.sceneHotspot.update).not.toHaveBeenCalled();
    });
  });
});
