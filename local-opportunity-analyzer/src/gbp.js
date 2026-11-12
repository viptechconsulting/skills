// Hallazgos de Google Business Profile a partir de datos PÚBLICOS (Places) comparados con website y competidores.
// Distingue "no visible por API" de "ausente". Funciones privadas (insights, mensajes) requieren GBP API autorizada.
const SRC = 'Google Places API (New) — datos públicos';
const digits = s => String(s || '').replace(/\D/g, '').slice(-10);
const host = u => { try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return null; } };

export function buildGbpFindings(gbp, prospect, competitors = [], fetchedAt = new Date().toISOString()) {
  const F = []; if (!gbp) return F;
  const mk = o => ({ area: 'gbp', relevance: 4, confidence: 0.85, source: SRC, observed_at: fetchedAt, ...o });
  if (!gbp.website) F.push(mk({ code: 'GBP_NO_WEBSITE', pillar: 'E', title: 'El perfil de Google no muestra sitio web', explanation: 'El perfil público no tiene enlace a website; se pierden visitas y señales de coherencia.', evidence: { website: null }, severity: 'alta', impact: 4, effort: 1, action: 'Agregar el website principal al perfil de Google Business.' }));
  else if (prospect.website && host(gbp.website) !== host(prospect.website)) F.push(mk({ code: 'GBP_WEBSITE_MISMATCH', pillar: 'E', title: 'El website del perfil no coincide con el registrado', explanation: 'Inconsistencia de entidad entre GBP y sitio.', evidence: { gbp: gbp.website, registrado: prospect.website }, severity: 'media', impact: 3, effort: 1, action: 'Unificar el website en GBP y en la ficha del prospecto.' }));
  if (gbp.phone && prospect.contact_phone && digits(gbp.phone) !== digits(prospect.contact_phone)) F.push(mk({ code: 'GBP_PHONE_MISMATCH', pillar: 'E', title: 'Teléfono del perfil distinto al registrado', explanation: 'La coherencia NAP es una señal local.', evidence: { gbp: gbp.phone, registrado: prospect.contact_phone }, severity: 'media', impact: 3, effort: 1, action: 'Unificar el teléfono principal en GBP, website y directorios.' }));
  if (!gbp.hasHours) F.push(mk({ code: 'GBP_NO_HOURS', pillar: 'E', title: 'Horarios no visibles en el perfil', explanation: 'La API pública no devolvió horarios; puede ser ausencia real o no visible.', evidence: { hasHours: false }, confidence: 0.7, severity: 'media', impact: 3, effort: 1, action: 'Cargar horarios regulares y especiales.' }));
  const cmp = competitors.filter(c => c.reviews != null);
  if (cmp.length >= 3 && gbp.reviews != null) {
    const med = [...cmp.map(c => c.reviews)].sort((a, b) => a - b)[Math.floor(cmp.length / 2)];
    if (gbp.reviews < med) F.push(mk({ code: 'GBP_REVIEWS_GAP', pillar: 'D', title: `Menos reseñas que la mediana de competidores (${gbp.reviews} vs ${med})`, explanation: 'Comparado con competidores comparables identificados por servicio y ciudad.', evidence: { prospecto: gbp.reviews, medianaCompetidores: med, competidores: cmp.map(c => ({ name: c.name, reviews: c.reviews })) }, severity: 'alta', impact: 4, effort: 3, relevance: 5, action: 'Programa continuo de solicitud de reseñas a clientes reales (sin incentivos prohibidos).' }));
  }
  const rated = competitors.filter(c => c.rating != null);
  if (rated.length >= 3 && gbp.rating != null) {
    const avg = rated.reduce((s, c) => s + c.rating, 0) / rated.length;
    if (gbp.rating + 0.2 < avg) F.push(mk({ code: 'GBP_RATING_GAP', pillar: 'E', title: `Calificación inferior al promedio de competidores (${gbp.rating} vs ${avg.toFixed(1)})`, explanation: 'Diferencia de reputación pública.', evidence: { prospecto: gbp.rating, promedio: Number(avg.toFixed(2)) }, severity: 'media', impact: 3, effort: 4, action: 'Responder reseñas, resolver causas recurrentes de queja y reforzar la solicitud de reseñas.' }));
  }
  const topCats = competitors.map(c => c.primaryCategory).filter(Boolean);
  if (gbp.primaryCategory && topCats.length >= 3) {
    const modal = Object.entries(topCats.reduce((m, c) => (m[c] = (m[c] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1])[0];
    if (modal[1] >= 2 && modal[0] !== gbp.primaryCategory) F.push(mk({ code: 'GBP_CATEGORY_DIFF', pillar: 'L', title: 'Categoría principal distinta a la mayoría de competidores', explanation: 'Verificar si la categoría principal refleja el servicio más rentable.', evidence: { prospecto: gbp.primaryCategory, competidores: topCats }, severity: 'media', impact: 3, effort: 1, confidence: 0.6, action: 'Evaluar cambio de categoría principal y añadir secundarias relevantes.' }));
  }
  F.push(mk({ code: 'GBP_PRIVATE_NOT_AVAILABLE', pillar: 'D', title: 'Datos privados de GBP no evaluados', explanation: 'Insights, llamadas, búsquedas y mensajes requieren conexión autorizada por el propietario del perfil (Business Profile API). Descripción, servicios, atributos y respuestas del propietario no están disponibles en Places API.', evidence: {}, severity: 'info', impact: 1, effort: 1, confidence: 1, action: 'Solicitar acceso de administrador/administrador de administración al perfil para una auditoría completa.' }));
  return F;
}
