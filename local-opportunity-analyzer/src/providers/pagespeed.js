// Google PageSpeed Insights API v5 (incluye datos de campo CrUX cuando existen). Cuota gratuita; clave opcional.
import { config } from '../config.js';
import { cacheKey, getCached, setCached, logUsage } from './cost.js';

export async function runPageSpeed(url, { userId, prospectId, auditId } = {}) {
  if (!config.providers.pagespeedEnabled) return { ok: false, reason: 'PageSpeed deshabilitado (PAGESPEED_ENABLED=0)' };
  const key = cacheKey('pagespeed', 'mobile', { url });
  const cached = await getCached(key);
  if (cached) { await logUsage({ provider: 'pagespeed', operation: 'mobile', userId, prospectId, auditId, cached: true }); return { ...cached.response, cached: true, fetchedAt: cached.fetched_at }; }
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  api.searchParams.set('url', url); api.searchParams.set('strategy', 'mobile'); api.searchParams.set('category', 'performance');
  if (config.providers.pagespeedKey) api.searchParams.set('key', config.providers.pagespeedKey);
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60000);
    const res = await fetch(api, { signal: ctrl.signal }); clearTimeout(t);
    if (!res.ok) return { ok: false, reason: `PageSpeed API respondió ${res.status}${res.status === 429 ? ' (cuota agotada: configure PAGESPEED_API_KEY)' : ''}` };
    const j = await res.json();
    const cats = j.lighthouseResult?.categories?.performance;
    const lx = j.loadingExperience?.metrics || {};
    const out = { ok: true, url, fetchedAt: new Date().toISOString(), source: 'Google PageSpeed Insights API v5', metrics: {
      performanceScore: cats?.score != null ? Math.round(cats.score * 100) : null,
      lab: { lcpMs: j.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue ?? null, cls: j.lighthouseResult?.audits?.['cumulative-layout-shift']?.numericValue ?? null, tbtMs: j.lighthouseResult?.audits?.['total-blocking-time']?.numericValue ?? null },
      crux: Object.keys(lx).length ? { lcpMs: lx.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null, cls: lx.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null ? lx.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null, inpMs: lx.INTERACTION_TO_NEXT_PAINT?.percentile ?? null, category: j.loadingExperience?.overall_category } : null } };
    await setCached(key, 'pagespeed', out); await logUsage({ provider: 'pagespeed', operation: 'mobile', userId, prospectId, auditId, cached: false });
    return out;
  } catch (e) { return { ok: false, reason: 'PageSpeed no disponible: ' + (e.name === 'AbortError' ? 'timeout' : e.message) }; }
}
