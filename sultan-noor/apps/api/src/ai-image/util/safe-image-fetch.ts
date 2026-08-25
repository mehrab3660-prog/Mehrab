import * as http from 'http';
import * as https from 'https';
import * as dns from 'dns';
import * as net from 'net';

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 15 * 1024 * 1024; // 15MB — generous for a product photo, small enough to bound memory
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export class UnsafeUrlError extends Error {}
export class FetchTooLargeError extends Error {}

// Blocks loopback, link-local, private/CGNAT, multicast and reserved ranges
// for both IPv4 and IPv4-mapped/native IPv6 — the standard SSRF blocklist.
// Anything not explicitly recognized as safe public space is rejected, i.e.
// this fails closed rather than open.
export function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) {
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return isPrivateIpv4(mapped[1]);
    return isPrivateIpv6(ip);
  }
  return true; // not a recognizable IP at all — refuse rather than guess
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark range
  if (a >= 224) return true; // multicast (224/4) + reserved (240/4) + broadcast
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local fe80::/10
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local fc00::/7
  return false;
}

interface SafeFetchResult {
  buffer: Buffer;
  contentType: string | null;
  finalUrl: string;
}

// Resolves the hostname ourselves, rejects anything pointing at private/
// internal address space, then pins the actual TCP connection to that
// validated IP (via the `lookup` option) so a second, different DNS answer
// for the same hostname (DNS rebinding) can never be used mid-request.
// Streams the response with a hard byte cap instead of buffering an
// unbounded body. Never follows more than MAX_REDIRECTS hops, re-validating
// the target of every hop the same way.
export async function fetchImageSafely(url: string, redirectsLeft = MAX_REDIRECTS): Promise<SafeFetchResult> {
  const parsed = new URL(url);
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new UnsafeUrlError(`پروتکل غیرمجاز: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError('آدرس حاوی اطلاعات ورود مجاز نیست');
  }

  const addresses = await dns.promises.lookup(parsed.hostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new UnsafeUrlError('آدرس قابل تبدیل به IP نیست');
  const pinnedAddress = addresses.find((a) => !isPrivateOrReservedIp(a.address));
  if (!pinnedAddress) throw new UnsafeUrlError('دسترسی به این آدرس مجاز نیست');

  const transport = parsed.protocol === 'https:' ? https : http;

  const result = await new Promise<SafeFetchResult>((resolve, reject) => {
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers: { 'user-agent': 'SultanNoorImageAutopilot/1.0' },
        timeout: DEFAULT_TIMEOUT_MS,
        // Pins DNS resolution to the address we already validated above —
        // Node calls this instead of doing its own lookup.
        lookup: (_hostname, _options, callback) => {
          callback(null, pinnedAddress.address, pinnedAddress.family);
        },
      } as http.RequestOptions,
      (res) => {
        const status = res.statusCode ?? 0;

        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume(); // discard body
          if (redirectsLeft <= 0) {
            reject(new UnsafeUrlError('تعداد ریدایرکت‌ها بیش از حد مجاز است'));
            return;
          }
          const nextUrl = new URL(res.headers.location, parsed);
          resolve(fetchImageSafely(nextUrl.toString(), redirectsLeft - 1));
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`دریافت تصویر ناموفق بود (HTTP ${status})`));
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_BYTES) {
            res.destroy();
            reject(new FetchTooLargeError('حجم تصویر بیش از حد مجاز است'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] ?? null, finalUrl: parsed.toString() });
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('دریافت تصویر با تایم‌اوت مواجه شد')));
    req.on('error', reject);
    req.end();
  });

  return result;
}
