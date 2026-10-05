import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// CN-005: GET /api/qr hace fetch(restaurant.logo_url) desde el servidor
// para componer el logo dentro del QR. El constraint SQL
// (restaurants_logo_url_scheme) ya obliga a http(s)://, pero eso no evita
// que el host resuelva a una dirección interna — esto es la segunda capa,
// antes del fetch, igual que apps/worker/src/ssrf-guard.ts.
const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  [ip4('0.0.0.0'), ip4('0.255.255.255')],
  [ip4('10.0.0.0'), ip4('10.255.255.255')],
  [ip4('100.64.0.0'), ip4('100.127.255.255')], // CGNAT
  [ip4('127.0.0.0'), ip4('127.255.255.255')], // loopback
  [ip4('169.254.0.0'), ip4('169.254.255.255')], // link-local (incluye metadata de nube)
  [ip4('172.16.0.0'), ip4('172.31.255.255')],
  [ip4('192.0.0.0'), ip4('192.0.0.255')],
  [ip4('192.168.0.0'), ip4('192.168.255.255')],
  [ip4('198.18.0.0'), ip4('198.19.255.255')],
];

function ip4(addr: string): number {
  return addr
    .split('.')
    .reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isPrivateIpv4(addr: string): boolean {
  const value = ip4(addr);
  return PRIVATE_IPV4_RANGES.some(([start, end]) => value >= start && value <= end);
}

function isPrivateIpv6(addr: string): boolean {
  const normalized = addr.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('::ffff:')
  );
}

export async function isPublicHttpUrl(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

  const hostname = url.hostname;

  if (hostname === 'localhost') return false;

  if (isIP(hostname)) {
    return isIP(hostname) === 4 ? !isPrivateIpv4(hostname) : !isPrivateIpv6(hostname);
  }

  try {
    const resolved = await lookup(hostname, { all: true });
    return resolved.every(({ address, family }) =>
      family === 4 ? !isPrivateIpv4(address) : !isPrivateIpv6(address)
    );
  } catch {
    // No resuelve: mejor no seguir con el fetch en vez de asumir que es seguro.
    return false;
  }
}
