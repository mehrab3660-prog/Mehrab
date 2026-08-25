import { BingImageSearchProvider, NullImageSearchProvider, resolveImageSearchProvider } from './image-search.provider';

describe('NullImageSearchProvider', () => {
  it('is never configured and always returns zero candidates', async () => {
    const provider = new NullImageSearchProvider();
    expect(await provider.isConfigured()).toBe(false);
    expect(await provider.search({ productName: 'x' }, 5)).toEqual([]);
  });
});

describe('BingImageSearchProvider', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => fetchSpy?.mockRestore());

  it('is configured only when an API key is present', async () => {
    expect(await new BingImageSearchProvider('key').isConfigured()).toBe(true);
    expect(await new BingImageSearchProvider('').isConfigured()).toBe(false);
  });

  it('maps a successful response into candidates, never claiming an official source', async () => {
    fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          value: [
            { contentUrl: 'https://supplier.example/a.jpg', hostPageUrl: 'https://supplier.example/product', name: 'Schneider C16', width: 800, height: 600, hostPageDisplayUrl: 'supplier.example' },
          ],
        }),
    });

    const provider = new BingImageSearchProvider('key');
    const results = await provider.search({ productName: 'کلید مینیاتوری', brandName: 'اشنایدر' }, 5);

    expect(results).toHaveLength(1);
    expect(results[0].imageUrl).toBe('https://supplier.example/a.jpg');
    expect(results[0].isOfficialSource).toBe(false); // never fabricated
    expect(results[0].sourceProvider).toBe('bing');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('bing.microsoft.com');
    expect((init.headers as Record<string, string>)['Ocp-Apim-Subscription-Key']).toBe('key');
  });

  it('degrades to an empty list instead of throwing when the API call fails', async () => {
    fetchSpy = jest.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('network down'));
    const provider = new BingImageSearchProvider('key');
    await expect(provider.search({ productName: 'x' }, 5)).resolves.toEqual([]);
  });

  it('degrades to an empty list on a non-2xx response', async () => {
    fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 500 });
    const provider = new BingImageSearchProvider('key');
    await expect(provider.search({ productName: 'x' }, 5)).resolves.toEqual([]);
  });
});

describe('resolveImageSearchProvider', () => {
  it('returns the Null provider when no key is configured', async () => {
    const settings = { resolve: jest.fn().mockResolvedValue(undefined) };
    const provider = await resolveImageSearchProvider(settings as any);
    expect(provider).toBeInstanceOf(NullImageSearchProvider);
  });

  it('returns the Bing provider when a key is configured and provider is bing (or unset)', async () => {
    const settings = { resolve: jest.fn((key: string) => Promise.resolve(key === 'imageSearchApiKey' ? 'k' : undefined)) };
    const provider = await resolveImageSearchProvider(settings as any);
    expect(provider).toBeInstanceOf(BingImageSearchProvider);
  });

  it('falls back to Null for an unrecognized provider name even with a key present', async () => {
    const settings = {
      resolve: jest.fn((key: string) => Promise.resolve(key === 'imageSearchApiKey' ? 'k' : key === 'imageSearchProvider' ? 'some-other-vendor' : undefined)),
    };
    const provider = await resolveImageSearchProvider(settings as any);
    expect(provider).toBeInstanceOf(NullImageSearchProvider);
  });
});
