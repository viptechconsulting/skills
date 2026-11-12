// Genera hallazgos de website a partir del resultado del rastreo. Función pura (testeable).
// Cada hallazgo: explicación, URL, evidencia, severidad, impacto (1-5), esfuerzo (1-5), acción, fuente, confianza.
import { urlKey } from './crawler.js';

const SRC_CRAWL = 'Rastreo directo del sitio (VIP Tech Local Analyzer)';
const mk = (o) => ({ area: 'website', relevance: 3, confidence: 0.9, source: SRC_CRAWL, ...o });
const digits = s => String(s || '').replace(/\D/g, '').slice(-10);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = s => norm(s).split(/[^a-z0-9]+/).filter(t => t.length > 2);

export function buildWebsiteFindings(crawl, prospect = {}, pagespeed = null) {
  const F = []; const when = crawl.fetchedAt;
  const ok = crawl.pages.filter(p => p.status && p.status < 400 && p.data);
  const home = crawl.pages[0] && crawl.pages[0].data ? crawl.pages[0] : ok[0];
  const add = f => F.push({ observed_at: when, ...f });

  // ---- Indexabilidad / robots / sitemap
  if (crawl.robots?.blocksAll) add(mk({ code: 'ROBOTS_BLOCKS_ALL', pillar: 'L', title: 'robots.txt bloquea todo el sitio', explanation: 'La regla "Disallow: /" para todos los agentes impide que los buscadores rastreen el sitio.', url: crawl.origin + '/robots.txt', evidence: { disallow: crawl.robots.disallow }, severity: 'critica', impact: 5, effort: 1, relevance: 5, action: 'Eliminar o acotar la regla Disallow: / en robots.txt.', benefit: 'Permite que Google descubra e indexe el sitio.' }));
  else if (crawl.robots && crawl.robots.present === false) add(mk({ code: 'ROBOTS_MISSING', pillar: 'L', title: 'No se encontró robots.txt', explanation: 'Sin robots.txt los buscadores rastrean sin guía y no se declara el sitemap.', url: crawl.origin + '/robots.txt', evidence: { status: crawl.robots.status }, severity: 'baja', impact: 2, effort: 1, action: 'Crear robots.txt que permita el rastreo y declare el sitemap.' }));
  const smOk = crawl.sitemaps.some(s => s.valid);
  if (!smOk && !crawl.sitemaps.some(s => s.error)) add(mk({ code: 'SITEMAP_MISSING', pillar: 'L', title: 'No se encontró un sitemap XML válido', explanation: 'Un sitemap ayuda a descubrir las páginas de servicios y ubicaciones.', url: crawl.origin + '/sitemap.xml', evidence: { sitemaps: crawl.sitemaps }, severity: 'media', impact: 3, effort: 1, action: 'Generar sitemap.xml y declararlo en robots.txt y Search Console.', benefit: 'Mejor descubrimiento e indexación de páginas.' }));
  for (const p of ok.filter(p => p.data.noindex)) add(mk({ code: 'NOINDEX', pillar: 'L', title: 'Página con meta robots noindex', explanation: 'La página pide no ser indexada. Es un problema si debería posicionar.', url: p.finalUrl || p.url, evidence: { robotsMeta: p.data.robotsMeta }, severity: p === home ? 'critica' : 'alta', impact: p === home ? 5 : 3, effort: 1, relevance: p === home ? 5 : 3, action: 'Quitar noindex si la página debe aparecer en Google.' }));

  // ---- HTTPS / www
  if (crawl.variants.http && !crawl.variants.http.error && !crawl.variants.http.redirectsToHttps) add(mk({ code: 'HTTP_NO_REDIRECT', pillar: 'L', title: 'La versión HTTP no redirige a HTTPS', explanation: 'Existen dos versiones del sitio accesibles (http y https), con riesgo de duplicidad y aviso de seguridad.', url: crawl.variants.http.url, evidence: crawl.variants.http, severity: 'alta', impact: 3, effort: 1, action: 'Redirección 301 de http a https en el servidor.' }));
  if (crawl.variants.alt && !crawl.variants.alt.error && crawl.variants.alt.status < 400 && !crawl.variants.alt.sameHost) add(mk({ code: 'WWW_DUPLICATE', pillar: 'L', title: 'Versiones www y no-www sirven contenido por separado', explanation: 'Ambas variantes responden sin redirigir a una versión preferida.', url: crawl.variants.alt.url, evidence: crawl.variants.alt, severity: 'media', impact: 3, effort: 1, action: 'Elegir una versión canónica y redirigir la otra con 301.' }));

  // ---- Códigos HTTP / redirecciones
  const broken = crawl.pages.filter(p => p.status >= 400 || (p.error && !p.blockedByRobots));
  for (const p of broken.slice(0, 20)) add(mk({ code: p.status >= 500 ? 'HTTP_5XX' : 'HTTP_4XX', pillar: 'L', title: p.status ? `Página responde ${p.status}` : 'Página inaccesible durante el rastreo', explanation: p.status ? 'URL enlazada o listada que no devuelve contenido.' : 'No se pudo cargar la URL (error de red/timeout). Puede ser temporal.', url: p.url, evidence: { status: p.status, error: p.error, linkedFrom: p.from }, severity: p.status >= 500 ? 'alta' : 'media', impact: 3, effort: 2, confidence: p.status ? 0.95 : 0.6, action: 'Restaurar la página, redirigirla con 301 a su equivalente o eliminar los enlaces que apuntan a ella.' }));
  for (const p of crawl.pages.filter(p => (p.redirects || []).length >= 2)) add(mk({ code: 'REDIRECT_CHAIN', pillar: 'L', title: 'Cadena de redirecciones', explanation: 'La URL pasa por 2 o más redirecciones antes de llegar al destino.', url: p.url, evidence: { chain: p.redirects, final: p.finalUrl }, severity: 'baja', impact: 2, effort: 1, action: 'Redirigir directamente a la URL final.' }));
  const brokenSet = new Set(broken.map(p => urlKey(p.url)));
  const linkingBroken = [];
  for (const p of ok) for (const l of p.data.links) if (l.internal && brokenSet.has(urlKey(l.href))) linkingBroken.push({ page: p.finalUrl, target: l.href });
  if (linkingBroken.length) add(mk({ code: 'BROKEN_INTERNAL_LINKS', pillar: 'L', title: `${linkingBroken.length} enlace(s) interno(s) apuntan a páginas rotas`, explanation: 'Los enlaces internos rotos desperdician rastreo y dañan la experiencia.', url: linkingBroken[0].page, evidence: { examples: linkingBroken.slice(0, 10) }, severity: 'media', impact: 3, effort: 2, action: 'Actualizar o eliminar los enlaces rotos.' }));
  const extBroken = crawl.externalChecks.filter(e => e.status >= 400 && e.status !== 405 && e.status !== 403 && e.status !== 429);
  if (extBroken.length) add(mk({ code: 'BROKEN_EXTERNAL_LINKS', pillar: 'E', title: `${extBroken.length} enlace(s) externo(s) rotos en la muestra revisada`, explanation: `Se revisó una muestra de ${crawl.externalChecks.length} de ${crawl.externalTotal} enlaces externos.`, url: extBroken[0].source, evidence: { broken: extBroken }, severity: 'baja', impact: 1, effort: 1, confidence: 0.8, action: 'Reemplazar o quitar los enlaces externos rotos.' }));

  // ---- Títulos, metas, encabezados, canonicals
  const dupGroup = (getter) => { const m = new Map(); for (const p of ok) { const v = (getter(p.data) || '').trim().toLowerCase(); if (!v) continue; (m.get(v) || m.set(v, []).get(v)).push(p.finalUrl); } return [...m].filter(([, u]) => u.length > 1); };
  for (const p of ok) {
    const d = p.data;
    if (!d.title) add(mk({ code: 'TITLE_MISSING', pillar: 'L', title: 'Página sin título SEO', explanation: 'El <title> es el principal elemento de relevancia y el texto del resultado en Google.', url: p.finalUrl, evidence: {}, severity: p === home ? 'alta' : 'media', impact: 4, effort: 1, action: 'Redactar un título único con servicio + ciudad.' }));
    if (!d.metaDescription) add(mk({ code: 'META_MISSING', pillar: 'E', title: 'Página sin meta description', explanation: 'Google puede generar el fragmento por su cuenta; una descripción propia mejora el CTR.', url: p.finalUrl, evidence: {}, severity: 'baja', impact: 2, effort: 1, action: 'Escribir una descripción persuasiva con llamada a la acción.' }));
    if (!d.h1.length) add(mk({ code: 'H1_MISSING', pillar: 'L', title: 'Página sin H1', explanation: 'El H1 declara el tema principal de la página.', url: p.finalUrl, evidence: {}, severity: 'media', impact: 3, effort: 1, action: 'Añadir un único H1 descriptivo.' }));
    else if (d.h1.length > 1) add(mk({ code: 'H1_MULTIPLE', pillar: 'L', title: 'Más de un H1', explanation: 'Varias etiquetas H1 diluyen la jerarquía.', url: p.finalUrl, evidence: { h1: d.h1 }, severity: 'baja', impact: 1, effort: 1, action: 'Dejar un H1 y bajar el resto a H2.' }));
    if (!d.canonical) add(mk({ code: 'CANONICAL_MISSING', pillar: 'L', title: 'Sin etiqueta canonical', explanation: 'Ayuda a evitar duplicados por parámetros o variantes.', url: p.finalUrl, evidence: {}, severity: 'baja', impact: 1, effort: 1, action: 'Añadir rel=canonical autorreferenciado.' }));
    else if (urlKey(d.canonical) !== urlKey(p.finalUrl)) add(mk({ code: 'CANONICAL_OTHER', pillar: 'L', title: 'Canonical apunta a otra URL', explanation: 'Si no es intencional, la página puede quedar fuera del índice.', url: p.finalUrl, evidence: { canonical: d.canonical }, severity: 'media', impact: 3, effort: 1, confidence: 0.8, action: 'Verificar que el canonical sea el deseado.' }));
    if (!d.viewport) add(mk({ code: 'NO_VIEWPORT', pillar: 'E', title: 'Sin meta viewport (no optimizada para móvil)', explanation: 'Sin viewport la página se muestra como escritorio en teléfonos.', url: p.finalUrl, evidence: {}, severity: 'alta', impact: 4, effort: 1, relevance: 4, action: 'Añadir <meta name="viewport" content="width=device-width, initial-scale=1">.' }));
    if (d.imagesMissingAlt > 0) add(mk({ code: 'IMG_ALT', pillar: 'L', title: `${d.imagesMissingAlt} imagen(es) sin texto alternativo`, explanation: 'El alt ayuda a accesibilidad y a Google Imágenes.', url: p.finalUrl, evidence: { total: d.images, sinAlt: d.imagesMissingAlt }, severity: 'baja', impact: 1, effort: 1, action: 'Describir cada imagen relevante en el atributo alt.' }));
  }
  for (const [v, urls] of dupGroup(d => d.title)) add(mk({ code: 'TITLE_DUPLICATE', pillar: 'L', title: 'Títulos SEO duplicados', explanation: 'Varias páginas comparten título, compitiendo entre sí.', url: urls[0], evidence: { title: v, urls }, severity: 'media', impact: 3, effort: 2, action: 'Diferenciar los títulos por servicio y ubicación.' }));
  for (const [v, urls] of dupGroup(d => d.metaDescription)) add(mk({ code: 'META_DUPLICATE', pillar: 'E', title: 'Meta descriptions duplicadas', explanation: 'Descripciones idénticas en varias páginas.', url: urls[0], evidence: { description: v, urls }, severity: 'baja', impact: 2, effort: 2, action: 'Escribir descripciones únicas.' }));
  for (const [v, urls] of dupGroup(d => d.wordCount > 30 ? d.contentHash : '')) add(mk({ code: 'DUPLICATE_CONTENT', pillar: 'L', title: 'Contenido idéntico en varias URLs', explanation: 'El texto visible es exactamente igual en estas páginas.', url: urls[0], evidence: { urls }, severity: 'media', impact: 3, effort: 3, action: 'Consolidar con 301/canonical o diferenciar el contenido.' }));

  // ---- Páginas huérfanas (listadas en sitemap pero no enlazadas desde lo rastreado)
  const orphans = (crawl.sitemapUrls || []).filter(u => { try { const k = urlKey(u); return !(crawl.inboundCount?.[k]) && k !== urlKey(crawl.startUrl); } catch { return false; } });
  if (orphans.length) add(mk({ code: 'ORPHAN_PAGES', pillar: 'L', title: `${orphans.length} página(s) del sitemap sin enlaces internos detectados`, explanation: 'Solo se evaluaron los enlaces de las páginas rastreadas; con el límite de rastreo puede haber falsos positivos.', url: orphans[0], evidence: { examples: orphans.slice(0, 15), crawledPages: crawl.pages.length }, severity: 'baja', impact: 2, effort: 2, confidence: crawl.pages.length >= crawl.limits.maxPages ? 0.5 : 0.75, action: 'Enlazar estas páginas desde menús o páginas relacionadas.' }));

  // ---- Local: servicios, ubicación, schema, NAP, contacto
  const allText = ok.map(p => norm([p.data.title, p.data.h1.join(' '), new URL(p.finalUrl).pathname].join(' '))).join(' | ');
  const city = norm(prospect.city || '');
  for (const svc of (prospect.services || [])) {
    const t = tokens(svc); if (!t.length) continue;
    const page = ok.find(p => { const s = norm([p.data.title, p.data.h1.join(' '), new URL(p.finalUrl).pathname].join(' ')); return t.every(x => s.includes(x.slice(0, Math.max(4, x.length - 2)))); });
    if (!page) add(mk({ code: 'SERVICE_PAGE_MISSING', pillar: 'L', title: `Sin página dedicada para el servicio «${svc}»`, explanation: 'No se encontró una página cuyo título, H1 o URL trate este servicio (dentro de lo rastreado).', url: crawl.startUrl, evidence: { service: svc, pagesRevisadas: ok.length }, severity: 'alta', impact: 4, effort: 3, relevance: 5, confidence: crawl.pages.length >= crawl.limits.maxPages ? 0.65 : 0.8, action: `Crear una página de servicio para «${svc}» con la ciudad objetivo, pruebas de confianza y llamada a la acción.`, benefit: 'Permite posicionar búsquedas comerciales específicas del servicio.' }));
  }
  if (city) {
    const homeHasCity = home && norm([home.data.title, home.data.h1.join(' ')].join(' ')).includes(city);
    if (!homeHasCity) add(mk({ code: 'CITY_NOT_IN_HOME', pillar: 'L', title: 'La ciudad objetivo no aparece en el título ni H1 de la home', explanation: 'Las señales geográficas en título/H1 ayudan a asociar el negocio con la búsqueda local.', url: home?.finalUrl || crawl.startUrl, evidence: { ciudad: prospect.city, title: home?.data.title, h1: home?.data.h1 }, severity: 'media', impact: 3, effort: 1, relevance: 5, action: 'Incluir servicio + ciudad en el título y H1 de la home.' }));
    const locPage = ok.find(p => p !== home && norm([p.data.title, p.data.h1.join(' '), new URL(p.finalUrl).pathname].join(' ')).includes(city));
    if (!locPage) add(mk({ code: 'LOCATION_PAGE_MISSING', pillar: 'L', title: 'No hay página específica de ubicación/área de servicio', explanation: 'Ninguna página rastreada (además de la home) menciona la ciudad en título, H1 o URL.', url: crawl.startUrl, evidence: { ciudad: prospect.city }, severity: 'media', impact: 3, effort: 3, relevance: 5, confidence: 0.75, action: 'Crear páginas de ubicación/zonas de servicio con contenido útil y local (no duplicado).' }));
  }
  const types = new Set(ok.flatMap(p => p.data.schemaTypes));
  const localTypes = [...types].filter(t => /LocalBusiness|Plumber|Electrician|HVACBusiness|RoofingContractor|Dentist|Attorney|LegalService|HomeAndConstructionBusiness|AutoRepair|Locksmith|MovingCompany|ProfessionalService|Store|Restaurant|MedicalBusiness|HealthAndBeautyBusiness|GeneralContractor|Organization/.test(t));
  if (types.has('__INVALID_JSON__')) add(mk({ code: 'SCHEMA_INVALID_JSON', pillar: 'E', title: 'JSON-LD con formato inválido', explanation: 'Hay un bloque de datos estructurados que no se puede interpretar.', url: crawl.startUrl, evidence: {}, severity: 'media', impact: 2, effort: 1, action: 'Corregir la sintaxis del JSON-LD.' }));
  if (!localTypes.length) add(mk({ code: 'SCHEMA_LOCALBUSINESS_MISSING', pillar: 'E', title: 'Sin datos estructurados de negocio local', explanation: 'No se detectó LocalBusiness (u otro subtipo) en JSON-LD.', url: crawl.startUrl, evidence: { tiposDetectados: [...types] }, severity: 'media', impact: 3, effort: 2, relevance: 4, action: 'Agregar JSON-LD LocalBusiness con NAP, horarios, área de servicio y perfiles.', benefit: 'Refuerza la coherencia de entidad y la elegibilidad para resultados enriquecidos (sin garantía).' }));

  const sitePhones = new Set(ok.flatMap(p => p.data.phones));
  const given = digits(prospect.contact_phone);
  if (given && home) {
    if (![...sitePhones].includes(given)) add(mk({ code: 'NAP_PHONE_MISMATCH', pillar: 'E', title: 'El teléfono registrado no aparece en el sitio', explanation: 'La coherencia NAP (nombre, dirección, teléfono) entre sitio y Google Business Profile es una señal local.', url: home.finalUrl, evidence: { registrado: prospect.contact_phone, detectadosEnSitio: [...sitePhones] }, severity: 'media', impact: 3, effort: 1, relevance: 4, confidence: 0.8, action: 'Mostrar el mismo teléfono que en GBP, en header/footer y en formato clicable.' }));
  }
  if (sitePhones.size > 2) add(mk({ code: 'NAP_MULTIPLE_PHONES', pillar: 'E', title: 'Varios teléfonos distintos en el sitio', explanation: 'Puede ser legítimo (varias sucursales); confirmar coherencia con GBP.', url: home?.finalUrl || crawl.startUrl, evidence: { telefonos: [...sitePhones] }, severity: 'info', impact: 1, effort: 1, confidence: 0.6, action: 'Confirmar el teléfono principal y su uso consistente.' }));
  if (prospect.address && home) {
    const streetNum = norm(prospect.address).match(/\d+\s+[a-z]+/)?.[0];
    const found = streetNum && ok.some(p => norm(p.data.textSample).includes(streetNum));
    if (streetNum && !found) add(mk({ code: 'NAP_ADDRESS_NOT_FOUND', pillar: 'E', title: 'La dirección registrada no aparece en el sitio', explanation: 'No se encontró el número y calle de la dirección en las páginas rastreadas.', url: home.finalUrl, evidence: { direccion: prospect.address }, severity: 'media', impact: 3, effort: 1, relevance: 4, confidence: 0.65, action: 'Publicar la dirección (o área de servicio) tal como figura en GBP.' }));
  }
  if (home) {
    if (!ok.some(p => p.data.telLinks > 0) ) add(mk({ code: 'NO_TEL_LINK', pillar: 'E', title: 'Ningún teléfono clicable (tel:) en el sitio', explanation: 'En móvil, el contacto con un toque reduce fricción.', url: home.finalUrl, evidence: {}, severity: 'media', impact: 4, effort: 1, relevance: 5, action: 'Convertir el teléfono en enlace tel: visible en header y footer.', benefit: 'Más facilidad de contacto desde móvil.' }));
    const contactPage = ok.find(p => /contact|contacto|cotiza|quote|cita/i.test(new URL(p.finalUrl).pathname));
    if (!ok.some(p => p.data.forms > 0) && !contactPage) add(mk({ code: 'NO_CONTACT_PATH', pillar: 'E', title: 'No se detectó formulario ni página de contacto', explanation: 'Sin una vía clara de contacto se pierden prospectos que no quieren llamar.', url: home.finalUrl, evidence: {}, severity: 'alta', impact: 4, effort: 2, relevance: 5, confidence: 0.75, action: 'Añadir formulario corto y página de contacto enlazada en el menú.' }));
    if (home.data.avgSentenceWords && home.data.avgSentenceWords > 30) add(mk({ code: 'READABILITY', pillar: 'E', title: 'Frases muy largas en la home (legibilidad)', explanation: 'Promedio de palabras por oración alto; indicador orientativo, no medida de calidad.', url: home.finalUrl, evidence: { palabrasPorOracion: home.data.avgSentenceWords }, severity: 'baja', impact: 1, effort: 2, confidence: 0.5, action: 'Reescribir con frases más cortas y subtítulos claros.' }));
  }

  // ---- PageSpeed / CrUX
  if (pagespeed?.ok) {
    const m = pagespeed.metrics;
    if (m.performanceScore != null && m.performanceScore < 90) add(mk({ code: 'PSI_MOBILE_SLOW', pillar: 'E', title: `Velocidad móvil: puntaje ${m.performanceScore}/100`, explanation: 'Lighthouse (laboratorio, móvil) vía PageSpeed Insights. Es una medición de laboratorio, no de usuarios reales.', url: pagespeed.url, evidence: m, severity: m.performanceScore < 50 ? 'alta' : 'media', impact: m.performanceScore < 50 ? 4 : 3, effort: 3, relevance: 4, confidence: 0.85, source: 'Google PageSpeed Insights API', action: 'Optimizar imágenes, JS/CSS bloqueante y servidor según el reporte de PSI.' }));
    if (m.crux?.lcpMs && m.crux.lcpMs > 2500) add(mk({ code: 'CWV_LCP', pillar: 'E', title: `LCP real (CrUX) de ${(m.crux.lcpMs / 1000).toFixed(1)} s`, explanation: 'Datos de campo de usuarios reales de Chrome (percentil 75). Umbral "bueno": ≤ 2.5 s.', url: pagespeed.url, evidence: m.crux, severity: 'alta', impact: 3, effort: 3, relevance: 3, confidence: 0.9, source: 'Chrome UX Report vía PageSpeed Insights API', action: 'Mejorar el elemento más grande (imagen hero, fuentes, servidor).' }));
    if (m.crux?.cls != null && m.crux.cls > 0.1) add(mk({ code: 'CWV_CLS', pillar: 'E', title: `CLS real (CrUX) de ${m.crux.cls}`, explanation: 'Desplazamiento de diseño en usuarios reales. Umbral "bueno": ≤ 0.1.', url: pagespeed.url, evidence: m.crux, severity: 'media', impact: 2, effort: 2, confidence: 0.9, source: 'Chrome UX Report vía PageSpeed Insights API', action: 'Reservar espacio para imágenes/anuncios y evitar inyecciones tardías.' }));
    if (m.crux?.inpMs && m.crux.inpMs > 200) add(mk({ code: 'CWV_INP', pillar: 'E', title: `INP real (CrUX) de ${m.crux.inpMs} ms`, explanation: 'Capacidad de respuesta a interacciones. Umbral "bueno": ≤ 200 ms.', url: pagespeed.url, evidence: m.crux, severity: 'media', impact: 2, effort: 3, confidence: 0.9, source: 'Chrome UX Report vía PageSpeed Insights API', action: 'Reducir JavaScript de hilo principal y tareas largas.' }));
  }
  return F;
}
