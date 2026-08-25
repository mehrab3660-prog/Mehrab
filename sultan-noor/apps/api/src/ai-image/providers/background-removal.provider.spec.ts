import { NullBackgroundRemovalProvider, RemoveBgProvider, resolveBackgroundRemovalProvider } from './background-removal.provider';

describe('NullBackgroundRemovalProvider', () => {
  it('is never configured and throws if called anyway (callers must check isConfigured first)', async () => {
    const provider = new NullBackgroundRemovalProvider();
    expect(await provider.isConfigured()).toBe(false);
    await expect(provider.removeBackground(Buffer.from([1]))).rejects.toThrow();
  });
});

describe('RemoveBgProvider', () => {
  let fetchSpy: jest.SpyInstance;
  afterEach(() => fetchSpy?.mockRestore());

  it('is configured only with an API key', async () => {
    expect(await new RemoveBgProvider('key').isConfigured()).toBe(true);
    expect(await new RemoveBgProvider('').isConfigured()).toBe(false);
  });

  it('sends the image with the API key header and returns the processed bytes', async () => {
    const responseBytes = new Uint8Array([1, 2, 3, 4]);
    fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(responseBytes.buffer),
    });

    const provider = new RemoveBgProvider('key');
    const result = await provider.removeBackground(Buffer.from([9, 9, 9]));

    expect(Buffer.compare(result, Buffer.from(responseBytes))).toBe(0);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('remove.bg');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('key');
  });

  it('throws (does not silently succeed) on a failed response, so the caller can keep the original image', async () => {
    fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 402 });
    const provider = new RemoveBgProvider('key');
    await expect(provider.removeBackground(Buffer.from([1]))).rejects.toThrow();
  });
});

describe('resolveBackgroundRemovalProvider', () => {
  it('returns Null when unconfigured, RemoveBg when a key exists', async () => {
    const unconfigured = { resolve: jest.fn().mockResolvedValue(undefined) };
    expect(await resolveBackgroundRemovalProvider(unconfigured as any)).toBeInstanceOf(NullBackgroundRemovalProvider);

    const configured = { resolve: jest.fn().mockResolvedValue('k') };
    expect(await resolveBackgroundRemovalProvider(configured as any)).toBeInstanceOf(RemoveBgProvider);
  });
});
