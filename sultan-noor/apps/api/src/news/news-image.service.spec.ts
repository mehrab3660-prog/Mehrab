import { NewsImageService } from './news-image.service';
import * as safeFetch from '../ai-image/util/safe-image-fetch';
import * as imageValidation from '../ai-image/util/image-validation';
import * as searchProviderModule from '../ai-image/providers/image-search.provider';
import * as genProviderModule from '../ai-image/providers/image-generation.provider';

describe('NewsImageService', () => {
  let settings: any;
  let imageProcessing: any;
  let service: NewsImageService;
  let fetchSpy: jest.SpyInstance;
  let validateSpy: jest.SpyInstance;
  let searchSpy: jest.SpyInstance;
  let genSpy: jest.SpyInstance;

  beforeEach(() => {
    settings = { resolve: jest.fn() };
    imageProcessing = { processForCatalog: jest.fn().mockResolvedValue({ url: 'https://cdn.example.com/processed.jpg' }) };
    service = new NewsImageService(settings, imageProcessing);
    fetchSpy = jest.spyOn(safeFetch, 'fetchImageSafely');
    validateSpy = jest.spyOn(imageValidation, 'validateImageBuffer');
    searchSpy = jest.spyOn(searchProviderModule, 'resolveImageSearchProvider');
    genSpy = jest.spyOn(genProviderModule, 'resolveImageGenerationProvider');
  });

  afterEach(() => jest.restoreAllMocks());

  it('prefers a real image from the source feed when it downloads and validates', async () => {
    fetchSpy.mockResolvedValue({ buffer: Buffer.from('img'), contentType: 'image/jpeg', finalUrl: 'https://source.example.com/a.jpg' });
    validateSpy.mockResolvedValue({ ok: true, width: 800, height: 600, format: 'jpeg' });

    const result = await service.resolveImage({ rawTitle: 'خبر', imageUrl: 'https://source.example.com/a.jpg' }, 'https://api.sultan-noor.com');

    expect(result).toEqual(expect.objectContaining({ imageSource: 'SOURCE', imageIsAiGenerated: false }));
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('falls back to a real web-search image when the source image is invalid', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('404')); // the source's own image fails
    searchSpy.mockResolvedValue({
      isConfigured: jest.fn().mockResolvedValue(true),
      search: jest.fn().mockResolvedValue([{ imageUrl: 'https://found.example.com/b.jpg', sourceUrl: 'https://found.example.com/article' }]),
    });
    fetchSpy.mockResolvedValueOnce({ buffer: Buffer.from('img'), contentType: 'image/jpeg', finalUrl: 'https://found.example.com/b.jpg' });
    validateSpy.mockResolvedValue({ ok: true, width: 800, height: 600, format: 'jpeg' });

    const result = await service.resolveImage({ rawTitle: 'خبر', imageUrl: 'https://source.example.com/a.jpg' }, 'https://api.sultan-noor.com');

    expect(result).toEqual(expect.objectContaining({ imageSource: 'SOURCE_SEARCH', imageIsAiGenerated: false, imageAttribution: 'https://found.example.com/article' }));
  });

  it('falls back to AI generation, always clearly marked, only once real options are exhausted', async () => {
    searchSpy.mockResolvedValue({ isConfigured: jest.fn().mockResolvedValue(false), search: jest.fn() });
    genSpy.mockResolvedValue({
      isConfigured: jest.fn().mockResolvedValue(true),
      generate: jest.fn().mockResolvedValue({ buffer: Buffer.from('generated'), provider: 'openai', promptVersion: 'v1', prompt: 'x' }),
    });

    const result = await service.resolveImage({ rawTitle: 'خبر بدون تصویر واقعی' }, 'https://api.sultan-noor.com');

    expect(result).toEqual(expect.objectContaining({ imageSource: 'AI_GENERATED', imageIsAiGenerated: true, imageAttribution: null }));
  });

  it('returns null (never a fabricated image) when nothing real is found and no generator is configured', async () => {
    searchSpy.mockResolvedValue({ isConfigured: jest.fn().mockResolvedValue(false), search: jest.fn() });
    genSpy.mockResolvedValue({ isConfigured: jest.fn().mockResolvedValue(false), generate: jest.fn() });

    const result = await service.resolveImage({ rawTitle: 'خبر بدون تصویر' }, 'https://api.sultan-noor.com');

    expect(result).toBeNull();
  });

  it('never asks the AI image prompt for a real logo, brand mark, or identifiable event', async () => {
    searchSpy.mockResolvedValue({ isConfigured: jest.fn().mockResolvedValue(false), search: jest.fn() });
    const generate = jest.fn().mockResolvedValue({ buffer: Buffer.from('generated'), provider: 'openai', promptVersion: 'v1', prompt: 'x' });
    genSpy.mockResolvedValue({ isConfigured: jest.fn().mockResolvedValue(true), generate });

    await service.resolveImage({ rawTitle: 'رونمایی از محصول جدید برند X' }, 'https://api.sultan-noor.com');

    const promptUsed = generate.mock.calls[0][0] as string;
    expect(promptUsed).toMatch(/no real company logos/i);
    expect(promptUsed).toMatch(/no identifiable real people/i);
  });
});
