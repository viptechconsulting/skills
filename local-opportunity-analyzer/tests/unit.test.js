import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { assertSafeUrl, isPrivateIp, normalizeUrl } from '../src/ssrf.js';
import { parseRobots, robotsAllows, parseSitemapLocs, crawlSite } from '../src/crawler.js';
import { buildWebsiteFindings } from '../src/findings.js';
import { scoreFinding, scoreAll, healthScore } from '../src/scoring.js';
import { projectImplementation, projectImprovement, UNAVAILABLE } from '../src/projection.js';
import { isGbpUrl } from '../src/eligibility.js';
import { startFixtureSite } from './helpers.js';

test('SSRF: rechaza destinos privados, esquemas y puertos no permitidos', async () => {
  config.allowPrivateTargets = false;
  try {
    for (const bad of ['http://127.0.0.1/', 'http://localhost/', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'file:///etc/passwd', 'ftp://example.com/', 'http://user:pw@example.com/', 'http://example.com:8080/', 'http://intranet.internal/'])
      await assert.rejects(() => assertSafeUrl(bad), `debía rechazar ${bad}`);
    assert.ok(isPrivateIp('172.16.0.1') && isPrivateIp('100.64.0.1') && isPrivateIp('fd00::1') && !isPrivateIp('8.8.8.8'));
    assert.equal(normalizeUrl('example.com/x#frag').toString(), 'https://example.com/x');
  } finally { config.allowPrivateTargets = true; }
});

test('robots.txt y sitemap se interpretan correctamente', () => {
  const r = parseRobots('User-agent: Googlebot\nDisallow: /g\nUser-agent: *\nDisallow: /privado\nAllow: /privado/ok\nSitemap: https://x.com/s.xml');
  assert.ok(!robotsAllows(r, '/privado/a') && robotsAllows(r, '/privado/ok/x') && robotsAllows(r, '/') && r.sitemaps.length === 1);
  assert.ok(parseRobots('User-agent: *\nDisallow: /').blocksAll);
  assert.deepEqual(parseSitemapLocs('<urlset><url><loc> https://a.com/a?x=1&amp;y=2 </loc></url></urlset>').locs, ['https://a.com/a?x=1&y=2']);
});

test('URLs de GBP/Maps: formato válido e inválido', () => {
  for (const ok of ['https://maps.app.goo.gl/abc', 'https://www.google.com/maps/place/Acme', 'https://g.page/acme', 'https://maps.google.com/?cid=123', 'https://goo.gl/maps/xyz']) assert.ok(isGbpUrl(ok), ok);
  for (const no of ['https://acme.com', 'https://facebook.com/acme', 'https://www.google.com/', 'no es url ::']) assert.ok(!isGbpUrl(no), no);
});

test('Rastreo del sitio de prueba + hallazgos con evidencia', async () => {
  const site = await startFixtureSite();
  try {
    const crawl = await crawlSite(site.url + '/', { maxPages: 15, maxDepth: 2, delayMs: 0 });
    assert.ok(crawl.pages.length >= 4);
    assert.ok(crawl.pages.some(p => p.url.endsWith('/roto') && p.status === 404));
    assert.ok(crawl.sitemapUrls.some(u => u.endsWith('/huerfana')));
    const prospect = { city: 'Miami', services: ['Destapes', 'Plomería de emergencia'], contact_phone: '(305) 555-0199', address: '' };
    const F = buildWebsiteFindings(crawl, prospect);
    const codes = new Set(F.map(f => f.code));
    for (const c of ['HTTP_4XX', 'BROKEN_INTERNAL_LINKS', 'NO_VIEWPORT', 'TITLE_DUPLICATE', 'H1_MULTIPLE', 'SCHEMA_LOCALBUSINESS_MISSING', 'SERVICE_PAGE_MISSING', 'NAP_PHONE_MISMATCH', 'IMG_ALT'])
      assert.ok(codes.has(c), `falta hallazgo ${c}; hay: ${[...codes].join(',')}`);
    assert.ok(!codes.has('NO_TEL_LINK'), 'el sitio sí tiene tel:');
    const svc = F.filter(f => f.code === 'SERVICE_PAGE_MISSING');
    assert.equal(svc.length, 1); assert.match(svc[0].title, /emergencia/);        // «Destapes» sí tiene página
    for (const f of F) { assert.ok(f.explanation && f.action && f.source && f.evidence && f.observed_at, f.code); assert.ok(f.impact >= 1 && f.impact <= 5 && f.effort >= 1 && f.effort <= 5); }
    const orphan = F.find(f => f.code === 'ORPHAN_PAGES'); assert.ok(orphan && orphan.evidence.examples.some(u => u.endsWith('/huerfana')));
  } finally { await site.close(); }
});

test('Puntuación: fórmula documentada y categorías', () => {
  const qw = scoreFinding({ impact: 4, relevance: 5, confidence: 0.9, effort: 1, severity: 'media', code: 'X' });
  assert.equal(qw.score, Math.round(100 * (0.35 * 4 / 5 + 0.2 * 5 / 5 + 0.2 * 0.9 + 0.25 * 5 / 5) * 10) / 10);
  assert.equal(qw.category, 'quick_win');
  assert.equal(scoreFinding({ impact: 4, relevance: 5, confidence: 0.8, effort: 3, severity: 'alta', code: 'X' }).category, 'prioridad_alta');
  assert.equal(scoreFinding({ impact: 3, relevance: 3, confidence: 0.6, effort: 4, severity: 'media', code: 'X' }).category, 'crecimiento_estrategico');
  assert.equal(scoreFinding({ impact: 1, relevance: 3, confidence: 1, effort: 1, severity: 'info', code: 'X' }).category, 'informativo');
  const d = scoreFinding({ impact: 3, relevance: 3, confidence: 0.9, effort: 3, severity: 'media', code: 'ORPHAN_PAGES' }, new Set(['BROKEN_INTERNAL_LINKS']));
  assert.equal(d.score_detail.D, 0.85);
  assert.ok(healthScore([{ code: 'a', severity: 'critica' }]) < healthScore([{ code: 'a', severity: 'baja' }]));
});

test('Proyección: implementación con supuestos; mejora no disponible sin evidencia', () => {
  const F = scoreAll([{ code: 'A', title: 'a', impact: 4, relevance: 4, confidence: 0.9, effort: 2, severity: 'alta' }, { code: 'B', title: 'b', impact: 3, relevance: 3, confidence: 0.9, effort: 3, severity: 'media' }]);
  const impl = projectImplementation(F);
  assert.equal(impl.totalHours, 6 + 16);
  assert.ok(impl.scenarios.favorable.weeksToComplete <= impl.scenarios.base.weeksToComplete && impl.scenarios.base.weeksToComplete <= impl.scenarios.conservador.weeksToComplete);
  assert.deepEqual(impl.scenarios.base.milestones.map(m => m.days), [30, 60, 90, 180]);
  assert.equal(impl.scenarios.base.milestones[3].pctHours, 100);
  const none = projectImprovement({ keywords: [], competitors: [] }, impl);
  assert.equal(none.available, false); assert.equal(none.message, UNAVAILABLE);
  const kws = Array.from({ length: 5 }, () => ({ position: 12, difficulty: 40 })); const comps = [1, 2, 3];
  const ok = projectImprovement({ keywords: kws, competitors: comps }, impl);
  assert.ok(ok.available && ok.heuristic && ok.scenarios.favorable.afterImplementationWeeks < ok.scenarios.conservador.afterImplementationWeeks);
});
