import {
  NullImageGenerationProvider,
  OpenAiImageGenerationProvider,
  buildSafeProductVisualPrompt,
  resolveImageGenerationProvider,
  PRODUCT_VISUAL_PROMPT_VERSION,
} from './image-generation.provider';

describe('buildSafeProductVisualPrompt', () => {
  it('never asks for logos, brand marks, text, packaging or certification badges', () => {
    const prompt = buildSafeProductVisualPrompt({ productName: 'کلید مینیاتوری', categoryName: 'کلید و پریز' });
    expect(prompt.toLowerCase()).toContain('no text');
    expect(prompt.toLowerCase()).toContain('no logos');
    expect(prompt.toLowerCase()).toContain('no certification');
    expect(prompt.toLowerCase()).toContain('no packaging');
    expect(prompt.toLowerCase()).toContain('unbranded');
  });
});

describe('NullImageGenerationProvider', () => {
  it('is never configured and throws if called anyway', async () => {
    const provider = new NullImageGenerationProvider();
    expect(await provider.isConfigured()).toBe(false);
    await expect(provider.generate('x')).rejects.toThrow();
  });
});

describe('OpenAiImageGenerationProvider', () => {
  let fetchSpy: jest.SpyInstance;
  afterEach(() => fetchSpy?.mockRestore());

  it('is configured only with an API key', async () => {
    expect(await new OpenAiImageGenerationProvider('key').isConfigured()).toBe(true);
    expect(await new OpenAiImageGenerationProvider('').isConfigured()).toBe(false);
  });

  it('decodes a base64 image response and stamps the prompt version for audit', async () => {
    const b64 = Buffer.from('fake-image-bytes').toString('base64');
    fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ b64_json: b64 }] }),
    });

    const provider = new OpenAiImageGenerationProvider('key');
    const result = await provider.generate('a generic unbranded widget');

    expect(result.buffer.toString()).toBe('fake-image-bytes');
    expect(result.provider).toBe('openai');
    expect(result.promptVersion).toBe(PRODUCT_VISUAL_PROMPT_VERSION);
    expect(result.prompt).toBe('a generic unbranded widget');

    const [, init] = fetchSpy.mock.calls[0];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer key');
  });

  it('follows a returned URL when no b64_json is present', async () => {
    fetchSpy = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [{ url: 'https://openai.example/img.png' }] }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) });

    const provider = new OpenAiImageGenerationProvider('key');
    const result = await provider.generate('prompt');
    expect(Buffer.compare(result.buffer, Buffer.from([1, 2, 3]))).toBe(0);
  });

  it('throws on a failed generation response', async () => {
    fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 429 });
    const provider = new OpenAiImageGenerationProvider('key');
    await expect(provider.generate('x')).rejects.toThrow();
  });
});

describe('resolveImageGenerationProvider', () => {
  it('reuses the existing openaiApiKey setting — no separate key required', async () => {
    const settings = { resolve: jest.fn((key: string) => Promise.resolve(key === 'openaiApiKey' ? 'k' : undefined)) };
    const provider = await resolveImageGenerationProvider(settings as any);
    expect(provider).toBeInstanceOf(OpenAiImageGenerationProvider);
  });

  it('returns Null when openaiApiKey is not configured', async () => {
    const settings = { resolve: jest.fn().mockResolvedValue(undefined) };
    const provider = await resolveImageGenerationProvider(settings as any);
    expect(provider).toBeInstanceOf(NullImageGenerationProvider);
  });
});
