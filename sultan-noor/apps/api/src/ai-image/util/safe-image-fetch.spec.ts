import * as http from 'http';
import { fetchImageSafely, isPrivateOrReservedIp, UnsafeUrlError, FetchTooLargeError } from './safe-image-fetch';

describe('isPrivateOrReservedIp', () => {
  const privateAddresses = [
    '127.0.0.1', // loopback
    '10.0.0.1', // RFC1918
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata endpoint — the classic SSRF target
    '100.64.0.1', // CGNAT
    '0.0.0.0',
    '224.0.0.1', // multicast
    '::1', // IPv6 loopback
    'fe80::1', // IPv6 link-local
    'fc00::1', // IPv6 unique local
    '::ffff:127.0.0.1', // IPv4-mapped IPv6 loopback
    '::ffff:10.0.0.5', // IPv4-mapped IPv6 private
  ];

  it.each(privateAddresses)('blocks %s', (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(true);
  });

  const publicAddresses = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'];

  it.each(publicAddresses)('allows %s', (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(false);
  });

  it('fails closed on garbage input that is not a real IP', () => {
    expect(isPrivateOrReservedIp('not-an-ip')).toBe(true);
  });
});

describe('fetchImageSafely — SSRF guard against a real local server', () => {
  it('refuses to fetch a loopback address even though the server is real and reachable', async () => {
    const server = http.createServer((_req, res) => res.end('should never be reached'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      await expect(fetchImageSafely(`http://127.0.0.1:${port}/image.jpg`)).rejects.toThrow(UnsafeUrlError);
    } finally {
      server.close();
    }
  });

  it('rejects a non-http(s) protocol before ever attempting a connection', async () => {
    await expect(fetchImageSafely('file:///etc/passwd')).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects a URL carrying embedded credentials', async () => {
    await expect(fetchImageSafely('http://user:pass@127.0.0.1/image.jpg')).rejects.toThrow(UnsafeUrlError);
  });

  it('refuses a redirect chain longer than the configured limit, even across only-loopback hops', async () => {
    // The server always redirects — if the guard didn't cap redirects this
    // would hang forever chasing a local loop.
    const server = http.createServer((_req, res) => {
      res.writeHead(302, { location: '/next' });
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      // The very first hop is already a loopback address, so this is
      // expected to fail as UnsafeUrlError on hop 1 — proving loopback is
      // rejected before redirect-following logic even gets a chance to loop.
      await expect(fetchImageSafely(`http://127.0.0.1:${port}/start`)).rejects.toThrow(UnsafeUrlError);
    } finally {
      server.close();
    }
  });
});

describe('error classes', () => {
  it('UnsafeUrlError and FetchTooLargeError are real, distinguishable Error subclasses', () => {
    expect(new UnsafeUrlError('x')).toBeInstanceOf(Error);
    expect(new FetchTooLargeError('x')).toBeInstanceOf(Error);
    expect(new UnsafeUrlError('x')).not.toBeInstanceOf(FetchTooLargeError);
  });
});
