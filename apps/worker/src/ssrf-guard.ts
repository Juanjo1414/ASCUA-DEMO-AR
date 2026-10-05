import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { WorkerError } from './errors.js';

// CN-002 (segunda capa): apps/web/app/api/jobs/route.ts ya exige que
// sourcePhoto empiece con la URL pública del bucket dish-photos, pero el
// worker no debería confiar ciegamente en eso — es la última línea antes
// de un fetch con credenciales de service role. Esto resuelve el host y
// rechaza rangos privados/loopback/link-local, para que ni un bug futuro
// en esa validación ni otro caller del worker abran un SSRF.
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
    normalized === '::1' || // loopback
    normalized.startsWith('fe80:') || // link-local
    normalized.startsWith('fc') || // unique local fc00::/7
    normalized.startsWith('fd') ||
    normalized.startsWith('::ffff:') // IPv4-mapped — se bloquea entera, más simple que desempacar el v4 y comparar contra los mismos rangos
  );
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WorkerError('WORKER_SSRF_INVALID_URL', `URL inválida: ${rawUrl}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new WorkerError('WORKER_SSRF_BLOCKED_SCHEME', `Esquema no permitido: ${url.protocol}`);
  }

  const hostname = url.hostname;

  if (isIP(hostname)) {
    const blocked = isIP(hostname) === 4 ? isPrivateIpv4(hostname) : isPrivateIpv6(hostname);
    if (blocked) {
      throw new WorkerError('WORKER_SSRF_BLOCKED_IP', `Dirección IP no permitida: ${hostname}`);
    }
    return;
  }

  if (hostname === 'localhost') {
    throw new WorkerError('WORKER_SSRF_BLOCKED_HOST', 'Host no permitido: localhost');
  }

  const resolved = await lookup(hostname, { all: true });
  for (const { address, family } of resolved) {
    const blocked = family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address);
    if (blocked) {
      throw new WorkerError(
        'WORKER_SSRF_BLOCKED_RESOLVED_IP',
        `${hostname} resuelve a una dirección no permitida: ${address}`
      );
    }
  }
}
