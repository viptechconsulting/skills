// Rastreador acotado: profundidad y páginas limitadas, pausa entre solicitudes, respeta robots.txt (User-agent: *).
import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import { config } from './config.js';
import { safeFetch } from './http.js';
import { normalizeUrl, UrlError } from './ssrf.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function parseRobots(text) {
  const rules = { disallow: [], allow: [], sitemaps: [], blocksAll: false };
  let applies = false, seenAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === 'sitemap') { rules.sitemaps.push(v); continue; }
    if (k === 'user-agent') { if (seenAgent && !applies) applies = false; applies = v === '*'; seenAgent = true; continue; }
    if (!applies) continue;
    if (k === 'disallow' && v) rules.disallow.push(v);
    if (k === 'allow' && v) rules.allow.push(v);
  }
  rules.blocksAll = rules.disallow.includes('/') && !rules.allow.length;
  return rules;
}
export function robotsAllows(rules, path) {
  let best = { len: -1, allow: true };
  for (const d of rules.disallow) if (path.startsWith(d) && d.length > best.len) best = { len: d.length, allow: false };
  for (const a of rules.allow) if (path.startsWith(a) && a.length >= best.len) best = { len: a.length, allow: true };
  return best.allow;
}

export function parseSitemapLocs(xml) {
  const locs = [...String(xml).matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi)].map(m => m[1].replace(/&amp;/g, '&'));
  return { locs, isIndex: /<sitemapindex/i.test(xml) };
}

function cleanText($) {
  $('script,style,noscript,template').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

export function extractPage(html, pageUrl) {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);
  const links = [];
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || /^(javascript:|#)/i.test(href)) return;
    if (/^mailto:/i.test(href) || /^tel:/i.test(href)) return;
    try { const u = new URL(href, pageUrl); if (!/^https?:$/.test(u.protocol)) return; u.hash = '';
      links.push({ href: u.toString(), text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 80), internal: u.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '') }); } catch {}
  });
  const jsonld = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try { const j = JSON.parse($(el).contents().text()); const walk = n => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') { if (n['@type']) jsonld.push(...[].concat(n['@type'])); if (n['@graph']) walk(n['@graph']); } }; walk(j); } catch { jsonld.push('__INVALID_JSON__'); }
  });
  const phones = new Set();
  $('a[href^="tel:"]').each((_, el) => phones.add(($(el).attr('href') || '').replace(/\D/g, '')));
  const imgs = $('img'); let missingAlt = 0; imgs.each((_, el) => { if (!($(el).attr('alt') || '').trim()) missingAlt++; });
  const telLinks = $('a[href^="tel:"]').length;
  const metaRobots = ($('meta[name="robots"]').attr('content') || '').toLowerCase();
  const text = cleanText($);
  const textPhones = [...text.matchAll(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g)].map(m => m[0].replace(/\D/g, '').slice(-10));
  const sentences = text.split(/[.!?¿¡]+\s/).filter(s => s.split(' ').length > 2);
  const avgSentenceWords = sentences.length ? Math.round(text.split(' ').length / sentences.length) : null;
  return {
    title: ($('title').first().text() || '').replace(/\s+/g, ' ').trim(),
    metaDescription: ($('meta[name="description"]').attr('content') || '').trim(),
    canonical: $('link[rel="canonical"]').attr('href') ? new URL($('link[rel="canonical"]').attr('href'), pageUrl).toString() : null,
    robotsMeta: metaRobots, noindex: /noindex/.test(metaRobots),
    lang: $('html').attr('lang') || null,
    viewport: !!$('meta[name="viewport"]').length,
    h1: $('h1').map((_, e) => $(e).text().replace(/\s+/g, ' ').trim()).get(),
    h2: $('h2').map((_, e) => $(e).text().replace(/\s+/g, ' ').trim()).get().slice(0, 30),
    h3: $('h3').map((_, e) => $(e).text().replace(/\s+/g, ' ').trim()).get().slice(0, 30),
    links, schemaTypes: [...new Set(jsonld)],
    telLinks, phones: [...new Set([...phones, ...textPhones].map(p => p.slice(-10)).filter(p => p.length === 10))],
    forms: $('form').length, images: imgs.length, imagesMissingAlt: missingAlt,
    wordCount: text ? text.split(' ').length : 0, avgSentenceWords,
    contentHash: createHash('sha1').update(text.toLowerCase()).digest('hex'),
    textSample: text.slice(0, 20000),
  };
}

function classifyIntent(url, title, h1) {
  const s = (new URL(url).pathname + ' ' + title + ' ' + h1.join(' ')).toLowerCase();
  if (/(contact|cotiza|quote|appointment|cita|book|agenda|presupuesto|estimate)/.test(s)) return 'transaccional';
  if (/(blog|guia|guide|como |how |tips|faq|preguntas)/.test(s)) return 'informacional';
  if (/(servicio|service|repair|reparaci|install|instalaci|near me|cerca)/.test(s)) return 'comercial-local';
  return 'navegacional/otro';
}

export async function crawlSite(startUrl, opts = {}, onProgress = () => {}) {
  const c = { ...config.crawl, ...opts };
  const start = normalizeUrl(startUrl);
  const result = { startUrl: start.toString(), origin: start.origin, pages: [], robots: null, sitemaps: [], sitemapUrls: [], variants: {}, externalChecks: [], errors: [], limits: { maxPages: c.maxPages, maxDepth: c.maxDepth }, fetchedAt: new Date().toISOString() };

  // robots.txt
  let rules = { disallow: [], allow: [], sitemaps: [], blocksAll: false };
  try {
    const r = await safeFetch(start.origin + '/robots.txt', { accept: 'text/plain' });
    result.robots = { status: r.status, url: r.finalUrl };
    if (r.status === 200 && !/<html/i.test(r.body)) { rules = parseRobots(r.body); result.robots.blocksAll = rules.blocksAll; result.robots.sitemaps = rules.sitemaps; result.robots.disallow = rules.disallow.slice(0, 30); }
    else result.robots.present = false;
  } catch (e) { result.robots = { status: null, error: e.message }; result.errors.push({ step: 'robots', error: e.message }); }
  if (result.robots && result.robots.status === 200 && result.robots.present !== false) result.robots.present = true;

  // sitemap(s)
  const sitemapCandidates = [...new Set([...(rules.sitemaps || []), start.origin + '/sitemap.xml'])].slice(0, 5);
  for (const sm of sitemapCandidates) {
    try {
      const r = await safeFetch(sm, { accept: 'application/xml,text/xml,*/*' });
      const ok = r.status === 200 && /<(urlset|sitemapindex)/i.test(r.body);
      result.sitemaps.push({ url: sm, status: r.status, valid: ok });
      if (!ok) continue;
      let { locs, isIndex } = parseSitemapLocs(r.body);
      if (isIndex) {
        const sub = [];
        for (const l of locs.slice(0, 3)) { try { const rr = await safeFetch(l, { accept: 'application/xml,text/xml,*/*' }); if (rr.status === 200) sub.push(...parseSitemapLocs(rr.body).locs); } catch {} }
        locs = sub;
      }
      result.sitemapUrls.push(...locs);
    } catch (e) { result.sitemaps.push({ url: sm, status: null, error: e.message }); }
  }
  result.sitemapUrls = [...new Set(result.sitemapUrls)].slice(0, 500);

  // variantes http/https y www
  try {
    const h = new URL(start.toString()); const altHost = h.hostname.startsWith('www.') ? h.hostname.slice(4) : 'www.' + h.hostname;
    if (h.protocol === 'https:' && !c.skipHttpCheck) {
      const httpUrl = 'http://' + h.hostname + '/';
      try { const r = await safeFetch(httpUrl); result.variants.http = { url: httpUrl, finalUrl: r.finalUrl, status: r.status, redirectsToHttps: r.finalUrl.startsWith('https://') }; }
      catch (e) { result.variants.http = { url: httpUrl, error: e.message }; }
    }
    if (!c.skipWwwCheck) {
      const altUrl = h.protocol + '//' + altHost + '/';
      try { const r = await safeFetch(altUrl); result.variants.alt = { url: altUrl, finalUrl: r.finalUrl, status: r.status, sameHost: new URL(r.finalUrl).hostname === h.hostname }; }
      catch (e) { result.variants.alt = { url: altUrl, error: e.message }; }
    }
  } catch {}

  // BFS
  const seen = new Map(); const queue = [{ url: start.toString(), depth: 0, from: null }];
  const key = u => { const x = new URL(u); x.hash = ''; let p = x.pathname.replace(/\/+$/, '') || '/'; return x.hostname.replace(/^www\./, '') + p + x.search; };
  seen.set(key(start.toString()), true);
  const inbound = new Map();
  for (let i = 0; i < queue.length && result.pages.length < c.maxPages; i++) {
    const { url, depth, from } = queue[i];
    const pathname = new URL(url).pathname;
    if (!robotsAllows(rules, pathname) && depth > 0) { result.pages.push({ url, status: null, blockedByRobots: true, depth, from }); continue; }
    onProgress(`Rastreando ${result.pages.length + 1}/${c.maxPages}: ${url}`);
    let page = { url, depth, from, status: null };
    try {
      const r = await safeFetch(url);
      Object.assign(page, { status: r.status, finalUrl: r.finalUrl, redirects: r.redirects, contentType: r.contentType, ms: r.ms });
      if (r.status < 400 && /html/i.test(r.contentType)) {
        const ex = extractPage(r.body, r.finalUrl);
        page.data = ex; page.intent = classifyIntent(r.finalUrl, ex.title, ex.h1);
        for (const l of ex.links) {
          if (!l.internal) continue;
          const k = key(l.href);
          if (!inbound.has(k)) inbound.set(k, new Set());
          inbound.get(k).add(r.finalUrl);
          if (!seen.has(k) && depth < c.maxDepth && !/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|css|js)(\?|$)/i.test(l.href)) { seen.set(k, true); queue.push({ url: l.href, depth: depth + 1, from: r.finalUrl }); }
        }
      }
    } catch (e) { page.error = e.message; page.transient = !(e instanceof UrlError); }
    result.pages.push(page);
    await sleep(c.delayMs);
  }
  // sitemap URLs no rastreadas (hasta completar el límite)
  for (const u of result.sitemapUrls) {
    if (result.pages.length >= c.maxPages) break;
    let k; try { k = key(u); } catch { continue; }
    if (seen.has(k)) continue; seen.set(k, true);
    onProgress(`Rastreando (sitemap) ${u}`);
    let page = { url: u, depth: null, from: 'sitemap', status: null };
    try {
      const r = await safeFetch(u);
      Object.assign(page, { status: r.status, finalUrl: r.finalUrl, redirects: r.redirects, contentType: r.contentType, ms: r.ms });
      if (r.status < 400 && /html/i.test(r.contentType)) { page.data = extractPage(r.body, r.finalUrl); page.intent = classifyIntent(r.finalUrl, page.data.title, page.data.h1);
        for (const l of page.data.links) if (l.internal) { const kk = key(l.href); if (!inbound.has(kk)) inbound.set(kk, new Set()); inbound.get(kk).add(r.finalUrl); } }
    } catch (e) { page.error = e.message; }
    result.pages.push(page); await sleep(c.delayMs);
  }
  result.inboundCount = Object.fromEntries([...inbound].map(([k, v]) => [k, v.size]));
  result.keyFn = undefined;

  // enlaces externos (muestra limitada)
  const ext = new Map();
  for (const p of result.pages) for (const l of p.data?.links || []) if (!l.internal && !ext.has(l.href)) ext.set(l.href, p.url);
  for (const [href, src] of [...ext].slice(0, c.maxExternalChecks)) {
    try { const r = await safeFetch(href, { method: 'HEAD' }); result.externalChecks.push({ url: href, source: src, status: r.status }); }
    catch (e) { result.externalChecks.push({ url: href, source: src, status: null, error: e.message }); }
    await sleep(Math.min(c.delayMs, 150));
  }
  result.externalTotal = ext.size;
  result.internalKey = undefined;
  return result;
}
export { UrlError };
export function urlKey(u) { const x = new URL(u); x.hash = ''; const p = x.pathname.replace(/\/+$/, '') || '/'; return x.hostname.replace(/^www\./, '') + p + x.search; }
