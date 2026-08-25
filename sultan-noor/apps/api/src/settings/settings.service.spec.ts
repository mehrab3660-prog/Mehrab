import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let prisma: any;
  let service: SettingsService;
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    prisma = { appSettings: { findUnique: jest.fn(), upsert: jest.fn() } };
    service = new SettingsService(prisma);
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('resolve', () => {
    it('prefers the DB value over the env var when both are set', async () => {
      process.env.ZARINPAL_MERCHANT_ID = 'from-env';
      prisma.appSettings.findUnique.mockResolvedValue({ zarinpalMerchantId: 'from-dashboard' });

      await expect(service.resolve('zarinpalMerchantId')).resolves.toBe('from-dashboard');
    });

    it('falls back to the env var when no row exists yet', async () => {
      process.env.ZARINPAL_MERCHANT_ID = 'from-env';
      prisma.appSettings.findUnique.mockResolvedValue(null);

      await expect(service.resolve('zarinpalMerchantId')).resolves.toBe('from-env');
    });

    it('falls back to the env var when the DB value was explicitly cleared (empty string)', async () => {
      process.env.ZARINPAL_MERCHANT_ID = 'from-env';
      prisma.appSettings.findUnique.mockResolvedValue({ zarinpalMerchantId: '' });

      await expect(service.resolve('zarinpalMerchantId')).resolves.toBe('from-env');
    });

    it('returns undefined when neither the DB nor the env var is set', async () => {
      delete process.env.ZARINPAL_MERCHANT_ID;
      prisma.appSettings.findUnique.mockResolvedValue(null);

      await expect(service.resolve('zarinpalMerchantId')).resolves.toBeUndefined();
    });
  });

  describe('getMasked', () => {
    it('never returns the raw secret value — only a masked preview of the last 4 characters', async () => {
      prisma.appSettings.findUnique.mockResolvedValue({ zarinpalMerchantId: 'super-secret-merchant-id-12345' });

      const result: any = await service.getMasked();
      expect(result.zarinpalMerchantId.preview).toBe('••••2345');
      expect(result.zarinpalMerchantId.preview).not.toContain('super-secret');
      expect(result.zarinpalMerchantId.configured).toBe(true);
      expect(result.zarinpalMerchantId.source).toBe('dashboard');
    });

    it('reports the env source and full (non-secret) value for non-secret settings like siteUrl', async () => {
      process.env.WEB_ORIGIN = 'https://example.com';
      prisma.appSettings.findUnique.mockResolvedValue(null);

      const result: any = await service.getMasked();
      expect(result.siteUrl).toEqual({ configured: true, source: 'env', preview: 'https://example.com' });
    });

    it('reports unconfigured when neither DB nor env has a value', async () => {
      delete process.env.OPENAI_API_KEY;
      prisma.appSettings.findUnique.mockResolvedValue(null);

      const result: any = await service.getMasked();
      expect(result.openaiApiKey).toEqual({ configured: false, source: null, preview: null });
    });
  });

  describe('update', () => {
    it('upserts only the provided fields and returns the fresh masked view', async () => {
      prisma.appSettings.upsert.mockResolvedValue({});
      prisma.appSettings.findUnique.mockResolvedValue({ zarinpalMerchantId: 'new-value-9999' });

      await service.update({ zarinpalMerchantId: 'new-value-9999' });

      expect(prisma.appSettings.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        create: { id: 1, zarinpalMerchantId: 'new-value-9999' },
        update: { zarinpalMerchantId: 'new-value-9999' },
      });
    });
  });
});
