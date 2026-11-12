// Costos, caché y límites. Evita análisis duplicados y exige confirmación para operaciones costosas.
import { createHash } from 'node:crypto';
import { one, q } from '../db.js';
import { config } from '../config.js';

// Costos ESTIMADOS por operación (USD). Verificar contra la tarifa vigente de cada proveedor antes de producción.
export const PROVIDER_COSTS = {
  pagespeed:      { estUsd: 0,      paid: false, label: 'Google PageSpeed Insights API (cuota gratuita)' },
  google_places:  { estUsd: 0.035,  paid: true,  label: 'Google Places API (New) — facturable por SKU' },
  dataforseo:     { estUsd: 0.01,   paid: true,  label: 'DataForSEO (pago por solicitud)' }
};
export const CACHE_TTL_HOURS = { pagespeed: 24, google_places: 24 * 7, dataforseo: 24 * 7 };

export const cacheKey = (provider, op, params) => `${provider}:${op}:${createHash('sha1').update(JSON.stringify(params)).digest('hex')}`;

export async function getCached(key) {
  return (await one('SELECT response, fetched_at FROM provider_cache WHERE cache_key=$1 AND expires_at>now()', [key]));
}
export async function setCached(key, provider, response) {
  await q(`INSERT INTO provider_cache(cache_key,provider,response,expires_at) VALUES($1,$2,$3,now()+($4||' hours')::interval)
           ON CONFLICT (cache_key) DO UPDATE SET response=$3,fetched_at=now(),expires_at=now()+($4||' hours')::interval`, [key, provider, response, String(CACHE_TTL_HOURS[provider] || 24)]);
}
export async function monthSpend(userId) {
  const r = await one(`SELECT COALESCE(SUM(est_cost_usd),0)::float AS s FROM provider_usage WHERE user_id=$1 AND cached=false AND created_at>=date_trunc('month',now())`, [userId]);
  return r.s;
}
export async function logUsage({ provider, operation, userId, prospectId, auditId, cached }) {
  const est = cached ? 0 : (PROVIDER_COSTS[provider]?.estUsd || 0);
  await q('INSERT INTO provider_usage(provider,operation,user_id,prospect_id,audit_id,est_cost_usd,cached) VALUES($1,$2,$3,$4,$5,$6,$7)', [provider, operation, userId, prospectId, auditId, est, !!cached]);
  return est;
}
/** Verifica límite mensual y confirmación explícita antes de gastar. Lanza Error con .status 402/409. */
export async function guardSpend({ provider, userId, confirmed }) {
  const meta = PROVIDER_COSTS[provider]; if (!meta) throw Object.assign(new Error('Proveedor desconocido'), { status: 400 });
  if (!meta.paid) return;
  if (meta.estUsd > config.confirmCostAboveUsd && !confirmed) throw Object.assign(new Error(`Operación con costo estimado de USD ${meta.estUsd} (${meta.label}). Requiere confirmación explícita.`), { status: 409, code: 'confirmation_required', estUsd: meta.estUsd });
  const u = await one('SELECT monthly_cost_limit_usd FROM users WHERE id=$1', [userId]);
  const limit = u?.monthly_cost_limit_usd != null ? Number(u.monthly_cost_limit_usd) : config.defaultMonthlyCostLimitUsd;
  const spent = await monthSpend(userId);
  if (spent + meta.estUsd > limit) throw Object.assign(new Error(`Límite mensual de costo alcanzado (USD ${spent.toFixed(2)} de ${limit.toFixed(2)}).`), { status: 402, code: 'limit_reached' });
}
