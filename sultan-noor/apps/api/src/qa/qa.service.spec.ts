import { NotFoundException } from '@nestjs/common';
import { QaService } from './qa.service';

function buildQuestionWithProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    body: 'این محصول چند وات است؟',
    product: {
      name: 'لامپ LED نه وات',
      description: 'لامپ کم‌مصرف LED با نور طبیعی',
      basePrice: 150000,
      brand: { name: 'سلطان نور' },
      category: { name: 'روشنایی' },
    },
    ...overrides,
  };
}

describe('QaService.suggestAnswer', () => {
  let prisma: any;
  let notifications: any;
  let settings: any;
  let service: QaService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = { question: { findUnique: jest.fn() } };
    notifications = { notify: jest.fn() };
    settings = { resolve: jest.fn() };
    service = new QaService(prisma, notifications, settings);
    fetchSpy = jest.spyOn(global, 'fetch' as any);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('throws NotFoundException when the question does not exist', async () => {
    prisma.question.findUnique.mockResolvedValue(null);
    await expect(service.suggestAnswer('missing')).rejects.toThrow(NotFoundException);
  });

  it('returns no suggestion with a clear reason when no Anthropic key is configured', async () => {
    prisma.question.findUnique.mockResolvedValue(buildQuestionWithProduct());
    settings.resolve.mockResolvedValue(undefined);

    const result = await service.suggestAnswer('q1');

    expect(result.suggestion).toBeNull();
    expect(result.reason).toContain('تنظیمات');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('grounds the prompt in the real product data, never inventing specs', async () => {
    prisma.question.findUnique.mockResolvedValue(buildQuestionWithProduct());
    settings.resolve.mockImplementation((key: string) => Promise.resolve(key === 'anthropicApiKey' ? 'sk-test' : undefined));
    fetchSpy.mockResolvedValue({ json: () => Promise.resolve({ content: [{ text: 'این لامپ ۹ وات است.' }] }) } as any);

    const result = await service.suggestAnswer('q1');

    expect(result.suggestion).toBe('این لامپ ۹ وات است.');
    const [, requestInit] = fetchSpy.mock.calls[0];
    const body = JSON.parse(requestInit.body);
    expect(body.messages[0].content).toContain('لامپ LED نه وات');
    expect(body.messages[0].content).toContain('این محصول چند وات است؟');
  });

  it('returns null with a reason instead of throwing when the Anthropic call fails', async () => {
    prisma.question.findUnique.mockResolvedValue(buildQuestionWithProduct());
    settings.resolve.mockImplementation((key: string) => Promise.resolve(key === 'anthropicApiKey' ? 'sk-test' : undefined));
    fetchSpy.mockRejectedValue(new Error('network down'));

    const result = await service.suggestAnswer('q1');

    expect(result.suggestion).toBeNull();
    expect(result.reason).toBeDefined();
  });
});
