// Rule-based parsing of a customer's freeform preference text (§9) into a
// structured filter. Deliberately NOT an LLM call — a fixed set of Persian
// keyword patterns, so it is fully deterministic and testable, and carries
// zero prompt-injection risk (there is no prompt to inject into).
export interface ParsedPreferences {
  cheapestOnly: boolean;
  higherQuality: boolean;
  preferredBrandName: string | null;
}

const CHEAPEST_PATTERNS = ['ارزان‌ترین', 'ارزانترین', 'کمترین قیمت', 'اقتصادی‌ترین'];
const HIGHER_QUALITY_PATTERNS = ['کیفیت بالاتر', 'کیفیت بالا', 'حرفه‌ای‌تر', 'باکیفیت‌تر', 'گران‌ترین'];
// "فقط برند X" / "همه ... برند X باشند" — captures the brand name token
// that follows the word "برند".
const BRAND_PATTERN = /برند\s+([؀-ۿ\w-]+)/;

export function parsePreferences(text: string | null | undefined): ParsedPreferences {
  const normalized = (text ?? '').trim();
  const brandMatch = normalized.match(BRAND_PATTERN);
  return {
    cheapestOnly: CHEAPEST_PATTERNS.some((p) => normalized.includes(p)),
    higherQuality: HIGHER_QUALITY_PATTERNS.some((p) => normalized.includes(p)),
    preferredBrandName: brandMatch ? brandMatch[1] : null,
  };
}
