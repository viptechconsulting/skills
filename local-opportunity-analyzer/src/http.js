// Cliente HTTP seguro para rastreo: redirecciones manuales revalidadas (anti-SSRF), timeout, límite de tamaño,
// un reintento controlado ante errores transitorios.
import { config } from './config.js';
import { assertSafeUrl, UrlError } from './ssrf.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function once(url, { method = 'GET', maxRedirects = 5, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5' } = {}) {
  const chain = [];
  let current = (await assertSafeUrl(url)).toString();
  for (let i = 0; i <= maxRedirects; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), config.crawl.timeoutMs);
    let res;
    try {
      res = await fetch(current, { method, redirect: 'manual', signal: ctrl.signal,
        headers: { 'user-agent': config.crawl.userAgent, accept } });
    } finally { clearTimeout(t); }
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.get('location')) {
      chain.push({ url: current, status: res.status });
      let next;
      try { next = new URL(res.headers.get('location'), current).toString(); } catch { throw new UrlError('Redirección inválida'); }
      await res.body?.cancel();
      current = (await assertSafeUrl(next)).toString();
      continue;
    }
    let body = '';
    const type = res.headers.get('content-type') || '';
    if (method === 'GET' && res.body && /text|xml|json|html/i.test(type)) {
      const reader = res.body.getReader(); const dec = new TextDecoder(); let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length; body += dec.decode(value, { stream: true });
        if (bytes > config.crawl.maxBytes) { await reader.cancel(); break; }
      }
    } else await res.body?.cancel();
    return { url, finalUrl: current, status: res.status, headers: Object.fromEntries(res.headers), body, redirects: chain, contentType: type };
  }
  throw new UrlError('Demasiadas redirecciones');
}

export async function safeFetch(url, opts = {}) {
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await once(url, opts); r.ms = Date.now() - started; return r;
    } catch (e) {
      const transient = !(e instanceof UrlError) || e.transient;
      if (attempt >= 1 || !transient) { e.url = url; throw e; }
      await sleep(500);
    }
  }
}
