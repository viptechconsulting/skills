import http from 'node:http';
import { inflateSync } from 'node:zlib';

process.env.DATABASE_URL ||= 'postgres://lopp:lopp@127.0.0.1:5432/lopp_test';
process.env.PAGESPEED_ENABLED = '0';
process.env.CRAWL_DELAY_MS = '0';
process.env.ALLOW_PRIVATE_TARGETS = '1';
process.env.GOOGLE_PLACES_API_KEY = '';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Sitio de prueba determinista (no es un negocio real). */
export function startFixtureSite() {
  const page = (title, body, { viewport = false, extraHead = '' } = {}) => `<!doctype html><html lang="es"><head><title>${title}</title>${viewport ? '<meta name="viewport" content="width=device-width, initial-scale=1">' : ''}${extraHead}</head><body>${body}</body></html>`;
  const routes = {
    '/': () => page('Plomería en Miami | Acme Plumbing', `<h1>Acme Plumbing — plomería en Miami</h1><a href="tel:3055550142">(305) 555-0142</a>
      <a href="/servicios/destapes">Destapes</a> <a href="/sobre">Sobre</a> <a href="/roto">Roto</a> <a href="https://maps.app.goo.gl/abc123">Google Maps</a>
      <img src="/a.png"><p>Atendemos Miami y alrededores. Llámenos hoy.</p>`),
    '/servicios/destapes': () => page('Destapes de drenaje | Acme', `<h1>Destapes de drenaje en Miami</h1><p>Servicio rápido de destapes.</p><a href="/">Inicio</a>`, { viewport: true }),
    '/sobre': () => page('Plomería en Miami | Acme Plumbing', `<h1>Sobre nosotros</h1><h1>Nuestro equipo</h1><p>Texto único sobre nosotros y nuestro equipo de trabajo.</p>`),
    '/huerfana': () => page('Página huérfana', `<h1>Huérfana</h1><p>Nadie me enlaza.</p>`),
    '/robots.txt': () => ['text/plain', 'User-agent: *\nDisallow: /privado\nSitemap: SITE/sitemap.xml'],
    '/sitemap.xml': () => ['application/xml', '<?xml version="1.0"?><urlset><url><loc>SITE/</loc></url><url><loc>SITE/huerfana</loc></url></urlset>']
  };
  const server = http.createServer((req, res) => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const path = req.url.split('?')[0];
    if (path === '/redir') { res.writeHead(301, { location: '/sobre' }); return res.end(); }
    const r = routes[path];
    if (!r) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<html><title>404</title><body>No encontrado</body></html>'); }
    let out = r(); let type = 'text/html; charset=utf-8';
    if (Array.isArray(out)) [type, out] = out;
    res.writeHead(200, { 'content-type': type }); res.end(out.replaceAll('SITE', base));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) })));
}

/** Extrae texto aproximado de un PDF de pdfkit (inflate de streams + cadenas hex/literales). */
export function pdfText(buf) {
  const s = buf.toString('latin1'); let out = '';
  for (const m of s.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let c; try { c = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { continue; }
    for (const h of c.matchAll(/<([0-9a-fA-F]+)>/g)) out += Buffer.from(h[1], 'hex').toString('latin1');
    for (const l of c.matchAll(/\(((?:\\.|[^\\)])*)\)/g)) out += l[1];
    out += '\n';
  }
  return out;
}
export const pdfPages = buf => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
