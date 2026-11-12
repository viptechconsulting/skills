// Motor de oportunidades — fórmula documentada (ver docs/SCORING.md). Sin puntuaciones arbitrarias.
//
//   S = 100 × ( 0.35·(I/5) + 0.20·(R/5) + 0.20·C + 0.25·((6−E)/5) ) × D
//   I impacto potencial 1–5 · R relevancia comercial 1–5 · C confianza de evidencia 0–1
//   E esfuerzo 1–5 (más esfuerzo = menos puntos) · D factor de dependencia (0.85 si depende de otra acción abierta, si no 1)
//
//   Quick Win:               E ≤ 2 ∧ I ≥ 3 ∧ C ≥ 0.70
//   Prioridad alta:          (severidad crítica/alta ∨ S ≥ 65) y no Quick Win
//   Crecimiento estratégico: el resto con I ≥ 2
//   Informativo:             severidad info o I < 2
export const WEIGHTS = { impact: 0.35, relevance: 0.20, confidence: 0.20, ease: 0.25 };
export const DEPENDENCIES = {            // código → códigos de los que depende
  LOCATION_PAGE_MISSING: ['SITEMAP_MISSING'], SERVICE_PAGE_MISSING: [], NAP_PHONE_MISMATCH: [],
  SCHEMA_LOCALBUSINESS_MISSING: [], ORPHAN_PAGES: ['BROKEN_INTERNAL_LINKS']
};

export function scoreFinding(f, presentCodes = new Set()) {
  const dep = (DEPENDENCIES[f.code] || []).filter(c => presentCodes.has(c));
  const D = dep.length ? 0.85 : 1;
  const raw = 100 * (WEIGHTS.impact * f.impact / 5 + WEIGHTS.relevance * f.relevance / 5 + WEIGHTS.confidence * Number(f.confidence) + WEIGHTS.ease * (6 - f.effort) / 5) * D;
  const score = Math.round(raw * 10) / 10;
  let category;
  if (f.severity === 'info' || f.impact < 2) category = 'informativo';
  else if (f.effort <= 2 && f.impact >= 3 && Number(f.confidence) >= 0.7) category = 'quick_win';
  else if (['critica', 'alta'].includes(f.severity) || score >= 65) category = 'prioridad_alta';
  else category = 'crecimiento_estrategico';
  return { score, category, score_detail: { I: f.impact, R: f.relevance, C: Number(f.confidence), E: f.effort, D, dependsOn: dep, formula: 'S=100×(0.35·I/5+0.20·R/5+0.20·C+0.25·(6−E)/5)×D' } };
}

export function scoreAll(findings) {
  const present = new Set(findings.map(f => f.code));
  return findings.map(f => ({ ...f, ...scoreFinding(f, present) }));
}

// Puntaje de salud técnica 0–100 (descriptivo): penaliza según severidad. Documentado en docs/SCORING.md.
const PEN = { critica: 20, alta: 8, media: 3, baja: 1, info: 0 };
export function healthScore(findings) {
  // limita el aporte de repeticiones del mismo código para no castigar de más a sitios grandes
  const byCode = new Map();
  for (const f of findings) { const k = f.code; const arr = byCode.get(k) || []; arr.push(f); byCode.set(k, arr); }
  let pen = 0;
  for (const arr of byCode.values()) { const base = PEN[arr[0].severity] || 0; pen += base + Math.min(arr.length - 1, 4) * base * 0.25; }
  return Math.max(0, Math.round(100 - pen));
}
