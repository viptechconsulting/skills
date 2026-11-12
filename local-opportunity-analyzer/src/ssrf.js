// Validación de URLs y prevención de SSRF: solo http/https, puertos 80/443 (salvo pruebas),
// resolución DNS y rechazo de IPs privadas/loopback/link-local/metadata. Se revalida en cada redirección.
import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from './config.js';

export class UrlError extends Error {}

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224 || (a === 192 && b === 0);
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    const g = expandV6(l);
    if (g) {
      const v4 = (a, b) => `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
      const zeros5 = g.slice(0, 5).every(x => x === 0);
      if (zeros5 && g[5] === 0xffff) return isPrivateIp(v4(g[6], g[7]));         // ::ffff:a.b.c.d (mapeada)
      if (g.slice(0, 6).every(x => x === 0)) return true;                          // ::/96 compatible / :: / ::1
      if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every(x => x === 0)) return isPrivateIp(v4(g[6], g[7])); // NAT64
      if (g[0] === 0x2002) return isPrivateIp(v4(g[1], g[2]));                      // 6to4
      if ((g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00) return true; // ULA, link-local, multicast
      return false;
    }
    return true;
  }
  return true;
}

function expandV6(ip) {
  let s = ip; const m = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (m) { const p = m[1].split('.').map(Number); s = s.slice(0, -m[1].length) + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16); }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [], t = tail !== undefined && tail ? tail.split(':') : [];
  const fill = tail !== undefined ? 8 - h.length - t.length : 0;
  const all = [...h, ...Array(Math.max(fill, 0)).fill('0'), ...t];
  if (all.length !== 8) return null;
  return all.map(x => parseInt(x || '0', 16));
}

export function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw new UrlError('URL vacía');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { throw new UrlError('URL inválida'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new UrlError('Solo se permiten http/https');
  if (u.username || u.password) throw new UrlError('URLs con credenciales no permitidas');
  u.hash = '';
  return u;
}

/** Lanza UrlError si la URL no es segura de visitar. Devuelve URL normalizada. */
export async function assertSafeUrl(input) {
  const u = normalizeUrl(input);
  if (!config.allowPrivateTargets) {
    if (u.port && !['80', '443'].includes(u.port)) throw new UrlError('Puerto no permitido');
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new UrlError('Host no permitido');
    let addrs;
    if (net.isIP(host)) addrs = [{ address: host }];
    else {
      try { addrs = await dns.lookup(host, { all: true }); }
      catch (e) { const err = new UrlError('No se pudo resolver el dominio'); err.transient = e.code === 'EAI_AGAIN'; throw err; }
    }
    if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new UrlError('El destino resuelve a una IP privada o no permitida');
  }
  return u;
}
