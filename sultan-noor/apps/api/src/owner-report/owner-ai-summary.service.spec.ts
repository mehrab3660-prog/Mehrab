import { BadRequestException } from '@nestjs/common';
import { OwnerAiSummaryService } from './owner-ai-summary.service';

describe('OwnerAiSummaryService — narrates real numbers only, never computes them (§8)', () => {
  let settings: any;
  let aiUsage: any;
  let service: OwnerAiSummaryService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    settings = { resolve: jest.fn() };
    aiUsage = { checkBudget: jest.fn().mockResolvedValue(true), record: jest.fn() };
    service = new OwnerAiSummaryService(settings, aiUsage);
    fetchSpy = jest.spyOn(global, 'fetch' as any);
  });

  afterEach(() => fetchSpy.mockRestore());

  it('is ON by default when the setting is unset (standard convention)', async () => {
    settings.resolve.mockResolvedValue(undefined);
    expect(await service.isEnabled()).toBe(true);
  });

  it('is OFF only when explicitly set to the literal string "false"', async () => {
    settings.resolve.mockResolvedValue('false');
    expect(await service.isEnabled()).toBe(false);
  });

  it('refuses to call the AI provider at all when explicitly disabled', async () => {
    settings.resolve.mockImplementation(async (key: string) => (key === 'ownerReportAiSummaryEnabled' ? 'false' : undefined));

    await expect(service.summarize({ any: 'data' })).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails gracefully with a clear Persian message when no API key is configured — never crashes the store', async () => {
    settings.resolve.mockImplementation(async (key: string) => (key === 'anthropicApiKey' ? undefined : 'anthropic-model-x'));

    await expect(service.summarize({ any: 'data' })).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses to call the AI provider when the owner-report AI budget is exhausted', async () => {
    settings.resolve.mockImplementation(async (key: string) => (key === 'anthropicApiKey' ? 'key' : undefined));
    aiUsage.checkBudget.mockResolvedValue(false);

    await expect(service.summarize({ any: 'data' })).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the real report payload to the model and returns its plain-text narration', async () => {
    settings.resolve.mockImplementation(async (key: string) => (key === 'anthropicApiKey' ? 'key' : undefined));
    fetchSpy.mockResolvedValue({ json: () => Promise.resolve({ content: [{ text: 'فروش امروز نسبت به میانگین ۷ روز گذشته ۱۸٪ رشد داشته است.' }] }) } as any);

    const reportData = { sales: { today: { revenue: 1000000 } } };
    const summary = await service.summarize(reportData);

    expect(summary).toContain('۱۸٪');
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    expect(body.messages[0].content).toContain('1000000');
    expect(aiUsage.record).toHaveBeenCalledWith(true, expect.any(Number));
  });

  it('records a failed usage and throws without crashing when the AI call errors — the numeric report stays available separately', async () => {
    settings.resolve.mockImplementation(async (key: string) => (key === 'anthropicApiKey' ? 'key' : undefined));
    fetchSpy.mockRejectedValue(new Error('network down'));

    await expect(service.summarize({ any: 'data' })).rejects.toBeInstanceOf(BadRequestException);
    expect(aiUsage.record).toHaveBeenCalledWith(false, expect.any(Number));
  });
});
