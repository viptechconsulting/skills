// Orquestador de auditorías: cola en proceso (concurrencia limitada) con estados pendiente/en_proceso/parcial/completado/fallido.
// Producción: sustituir por una cola persistente (pg-boss/BullMQ). Ver docs/ARCHITECTURE.md.
import { one, many, q } from './db.js';
import { crawlSite } from './crawler.js';
import { buildWebsiteFindings } from './findings.js';
import { buildGbpFindings } from './gbp.js';
import { scoreAll, healthScore } from './scoring.js';
import { projectImplementation, projectImprovement } from './projection.js';
import { runPageSpeed } from './providers/pagespeed.js';

const queue = []; let running = 0; const MAX = 2;

export async function recoverStuckAudits() {
  await q(`UPDATE audits SET status='fallido', error='Interrumpida por reinicio del servidor', finished_at=now() WHERE status IN ('en_proceso','pendiente')`);
}

export async function enqueueAudit(auditId) { queue.push(auditId); pump(); }
function pump() {
  while (running < MAX && queue.length) {
    const id = queue.shift(); running++;
    runAudit(id).catch(async e => { await q(`UPDATE audits SET status='fallido', error=$2, finished_at=now() WHERE id=$1`, [id, String(e.message).slice(0, 500)]); })
      .finally(() => { running--; pump(); });
  }
}
export const whenIdle = async () => { while (running || queue.length) await new Promise(r => setTimeout(r, 50)); };

const setProgress = (id, text) => q('UPDATE audits SET progress=$2 WHERE id=$1', [id, text]);

export async function runAudit(auditId) {
  const audit = await one('SELECT * FROM audits WHERE id=$1', [auditId]);
  const prospect = await one('SELECT * FROM prospects WHERE id=$1', [audit.prospect_id]);
  await q(`UPDATE audits SET status='en_proceso', started_at=now(), progress='Iniciando' WHERE id=$1`, [auditId]);
  const notes = []; let partial = false;

  // 1) Rastreo
  let crawl;
  try { crawl = await crawlSite(prospect.website, audit.config.crawl || {}, t => setProgress(auditId, t).catch(() => {})); }
  catch (e) { await q(`UPDATE audits SET status='fallido', error=$2, finished_at=now() WHERE id=$1`, [auditId, 'No se pudo rastrear el sitio: ' + e.message]); return; }
  if (!crawl.pages.some(p => p.status && p.status < 400)) { await q(`UPDATE audits SET status='fallido', error='El sitio no devolvió páginas rastreables', finished_at=now() WHERE id=$1`, [auditId]); return; }
  if (crawl.pages.some(p => p.error && p.transient)) { partial = true; notes.push('Algunas URLs fallaron por errores de red/timeout; resultados parciales.'); }
  for (const p of crawl.pages) await q('INSERT INTO audit_pages(audit_id,url,status,final_url,depth,data) VALUES($1,$2,$3,$4,$5,$6)', [auditId, p.url, p.status, p.finalUrl || null, p.depth, { ...p, data: p.data ? { ...p.data, textSample: undefined } : undefined, links: undefined }]);

  // 2) PageSpeed / CrUX
  await setProgress(auditId, 'Consultando PageSpeed Insights');
  const psi = await runPageSpeed(crawl.startUrl, { userId: audit.requested_by, prospectId: prospect.id, auditId });
  if (!psi.ok) notes.push(psi.reason);

  // 3) GBP / competencia guardada (Places se ejecuta aparte, con confirmación de costo)
  const gbpSnap = await one(`SELECT * FROM gbp_snapshots WHERE prospect_id=$1 ORDER BY fetched_at DESC LIMIT 1`, [prospect.id]);
  const competitors = await many('SELECT * FROM competitors WHERE prospect_id=$1', [prospect.id]);
  const keywords = await many('SELECT * FROM keywords WHERE prospect_id=$1', [prospect.id]);
  if (!gbpSnap) notes.push('Sin datos de Google Business Profile: ejecute la consulta de GBP (requiere Google Places configurado) o cárguelos manualmente.');
  if (!competitors.length) notes.push('Sin competidores registrados: la comparación competitiva no está disponible.');
  if (!keywords.length) notes.push('Sin keywords registradas: no hay brechas ni posiciones. La ausencia de datos no implica ausencia de ranking.');

  let findings = [...buildWebsiteFindings(crawl, prospect, psi.ok ? psi : null), ...(gbpSnap ? buildGbpFindings(gbpSnap.data, prospect, competitors.map(c => ({ name: c.name, rating: c.rating == null ? null : Number(c.rating), reviews: c.reviews, primaryCategory: c.primary_category })), gbpSnap.fetched_at.toISOString()) : [])];
  findings = scoreAll(findings);
  for (const f of findings) await q(`INSERT INTO findings(audit_id,area,pillar,code,title,explanation,url,evidence,severity,impact,effort,relevance,confidence,action,benefit,source,observed_at,score,category,score_detail)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [auditId, f.area, f.pillar || null, f.code, f.title, f.explanation, f.url || null, f.evidence || {}, f.severity, f.impact, f.effort, f.relevance, f.confidence, f.action, f.benefit || null, f.source, f.observed_at, f.score, f.category, f.score_detail]);

  const impl = projectImplementation(findings);
  const impr = projectImprovement({ keywords: keywords.map(k => ({ position: k.position, difficulty: k.difficulty })), competitors }, impl);
  const bySev = {}; for (const f of findings) bySev[f.severity] = (bySev[f.severity] || 0) + 1;
  const byCat = {}; for (const f of findings) byCat[f.category] = (byCat[f.category] || 0) + 1;
  const okPages = crawl.pages.filter(p => p.status && p.status < 400).length;
  const summary = { health: healthScore(findings.filter(f => f.area === 'website')), pagesCrawled: crawl.pages.length, pagesOk: okPages, pagesBroken: crawl.pages.filter(p => p.status >= 400).length,
    sitemapUrls: crawl.sitemapUrls.length, bySeverity: bySev, byCategory: byCat, pagespeed: psi.ok ? { ...psi.metrics, fetchedAt: psi.fetchedAt, cached: !!psi.cached } : { unavailable: psi.reason },
    projection: { implementation: impl, improvement: impr }, notes, crawl: { limits: crawl.limits, robots: crawl.robots, sitemaps: crawl.sitemaps, variants: crawl.variants, fetchedAt: crawl.fetchedAt },
    sources: ['Rastreo directo del sitio', ...(psi.ok ? ['Google PageSpeed Insights API v5 / CrUX'] : []), ...(gbpSnap ? [`GBP (${gbpSnap.source})`] : [])] };
  await q(`UPDATE audits SET status=$2, summary=$3, finished_at=now(), progress='Finalizado' WHERE id=$1`, [auditId, partial ? 'parcial' : 'completado', summary]);
  await q(`INSERT INTO prospect_history(prospect_id,user_id,kind,detail) VALUES($1,$2,'audit',$3)`, [prospect.id, audit.requested_by, `Auditoría ${partial ? 'parcial' : 'completada'} (${findings.length} hallazgos, salud técnica ${summary.health}/100)`]);
  await q(`UPDATE prospects SET pipeline_status='Diagnóstico realizado', updated_at=now() WHERE id=$1 AND pipeline_status IN ('Nuevo','Calificado')`, [prospect.id]);
}
