---
name: seo-local
description: >
  Análisis de SEO local que cubre la optimización de Google Business Profile,
  consistencia NAP, salud de citas, señales de reseñas, marcado de schema
  local, calidad de páginas de ubicación, SEO multi-ubicación y
  recomendaciones específicas por sector. Detecta el tipo de negocio (físico,
  SAB, híbrido) y el vertical de sector. Úsala cuando el usuario diga "SEO
  local", "Google Business Profile", "GBP", "map pack", "local pack",
  "citas", "consistencia NAP", "área de servicio" o "multi-ubicación".
user-invocable: true
argument-hint: "[url]"
license: MIT
metadata:
  author: Palo Seco S.L.
  version: "2.2.4"
  category: seo
---

# Análisis de SEO Local (Marzo 2026)

## Estadísticas Clave

| Métrica | Valor | Fuente |
|---------|-------|--------|
| Cuota de peso de las señales de GBP en el local pack | 32% | Whitespark 2026 |
| Cuota de la proximidad en la varianza de ranking | 55,2% | Estudio de ML de Search Atlas |
| Cuota de señales de reseñas (sube desde 16%) | ~20% | Whitespark 2026 |
| Búsquedas de Google que buscan información local | 46% | Datos del sector |
| Búsquedas "cerca de mí" en móvil que llevan a una visita en 24h | 76% | Confirmado por Google |
| Uso de ChatGPT/IA para recomendaciones locales | 45% (sube desde 6%) | BrightLocal LCRS 2026 |
| Tasa de conversión local de ChatGPT | 15,9% | Seer Interactive |
| Tasa de conversión orgánica local de Google | 1,76% | Seer Interactive |
| Crecimiento de anuncios en el local pack (ene. 2025 a ene. 2026) | 1% a 22% | Sterling Sky |

---

## Detección del Tipo de Negocio

Detecta a partir de las señales de la página antes del análisis. Esto determina qué comprobaciones aplican.

### Negocio Físico
- Dirección física visible en el contenido de la página o el footer
- Mapa de Google embebido con pin/indicaciones
- "Visítanos en", "Ubicados en", "Ven a vernos"
- Dirección estructurada en el schema LocalBusiness

### Service Area Business (SAB)
- Sin dirección física visible
- Menciones de área de servicio: "sirviendo a [ciudad/región]", "el área de servicio incluye"
- "Vamos a donde estés", "Servicio a domicilio", "[Servicio] móvil"
- `areaServed` en el schema sin `address.streetAddress`

### Híbrido
- Presentes tanto la dirección física COMO el lenguaje de área de servicio
- "Visita nuestro showroom" combinado con "También damos servicio en [zonas]"

**Impacto en las comprobaciones**: los SAB se saltan la verificación de mapa embebido y la consistencia de dirección física. Los negocios físicos reciben las comprobaciones completas de NAP + mapa.

---

## Detección del Vertical de Sector

Detecta a partir de las señales de la página y los patrones de categoría de GBP. Dirige a las comprobaciones específicas del sector en `../seo/references/local-schema-types.md`.

| Vertical | Señales de Detección |
|----------|--------------------------|
| **Restaurante** | /menu, elementos de menú, reservas, tipos de cocina, pedido de comida, "comer allí", "para llevar" |
| **Sanidad** | seguro aceptado, pacientes, citas, NPI, términos médicos, "Dr.", aviso HIPAA |
| **Legal** | abogado, letrado, áreas de práctica, colegiación, resultados de casos, "consulta gratuita" |
| **Servicios para el Hogar** | área de servicio, servicio de urgencia, "presupuesto gratis", licenciado/asegurado/con fianza, "24/7" |
| **Inmobiliaria** | listados, MLS, propiedades en venta/alquiler, bio del agente, inmobiliaria, "puertas abiertas" |
| **Automoción** | inventario, VIN, prueba de conducción, concesionario, departamento de taller, "nuevo/usado/certificado" |

Si no se detecta ningún vertical, usa la vía de análisis genérica de `LocalBusiness`.

---

## Dimensiones de Análisis

### 1. Señales de GBP (25%)

La categoría principal es el **factor individual más importante del local pack** (Whitespark #1, puntuación: 193). Una categoría principal incorrecta es el **factor negativo #1** (puntuación: 176).

**Comprobar:**
- Embed o referencia de GBP detectable en la página (iframe de Maps, place ID, widget de reseñas)
- Adecuación de la categoría principal (inferir del contenido de la página frente a los datos visibles de GBP)
- Evidencia de categorías secundarias (óptimo: 4 adicionales según BrightLocal)
- Presencia de posts de GBP (sin impacto directo en el ranking según WebFX, pero activa Post Justifications)
- Evidencia de fotos/vídeo (45% más solicitudes de indicaciones con fotos, Agency Jet)
- Contenido de P&R: comprueba si la sección de P&R de GBP está disponible para la categoría/región del negocio; optimiza preguntas y respuestas del propietario cuando esté disponible
- Elegibilidad para la insignia Google Verified (sustituyó a Guaranteed/Screened en oct. 2025)
- Estrategia de URL de enlace de GBP: NO enlazar a la página más fuerte de la web (Actualización de Diversidad de Sterling Sky -- riesgo de suprimir los rankings orgánicos)
- Visibilidad del horario del negocio en la página (los negocios abiertos en el momento de la búsqueda posicionan mejor, factor #5)

**Guía de puntuación:**
- Completo: embed de GBP presente, señales de categoría alineadas, posts activos, fotos presentes
- Parcial: algunas señales de GBP presentes pero incompletas
- Bajo: sin integración visible de GBP en la web

### 2. Reseñas y Reputación (20%)

La velocidad de reseñas importa más que el recuento total. La **regla de los 18 días** (Sterling Sky): los rankings caen en picado si no hay reseñas nuevas durante 3 semanas.

**Comprobar:**
- Recuento total de reseñas de Google visible en la página o el schema (umbral mágico: 10, Sterling Sky)
- Valoración en estrellas (31% de los consumidores solo usan negocios de 4,5+, 68% solo de 4+, BrightLocal 2026)
- Indicadores de recencia de reseñas (74% solo les importan las reseñas de los últimos 3 meses)
- `aggregateRating` en el schema (ratingValue, reviewCount, bestRating)
- Presencia en reseñas de terceros (los consumidores usan una media de 6 sitios de reseñas, BrightLocal 2026)
- Patrones de respuesta del propietario (el 88% usaría un negocio que responde, BrightLocal)
- Detección de review gating: cualquier preselección de satisfacción antes de dirigir a la plataforma de reseñas está prohibida por Google (política de engagement falso) y por la FTC (53.088$/infracción)

**Específico por sector:**
- Sanidad: HIPAA prohíbe confirmar/negar que quien reseña es paciente en las respuestas
- Legal: consideraciones de secreto profesional abogado-cliente en las respuestas a reseñas

**Guía de puntuación:**
- Completo: 10+ reseñas, 4,5+ estrellas, actividad reciente, respuestas del propietario, presencia multiplataforma
- Parcial: algunas reseñas pero con carencias en recencia, valoración o tasa de respuesta
- Bajo: <10 reseñas, sin actividad reciente, sin respuestas, solo una plataforma

### 3. SEO On-Page Local (20%)

Las páginas de servicio dedicadas son el **factor orgánico local #1 Y el factor de visibilidad en IA #2** (Whitespark 2026).

**Comprobar:**
- El title tag contiene keywords de ciudad/servicio
- Etiqueta H1 con intención local (ciudad + servicio)
- NAP (Nombre, Dirección, Teléfono) visible en el HTML de la página (footer, sección de contacto, cabecera)
- Páginas de servicio dedicadas (una página por cada servicio principal)
- Calidad de la página de ubicación para sitios multi-ubicación:
  - **>60-70% de contenido único** como mínimo (consenso del sector, sin umbral confirmado por Google)
  - **Test de intercambio**: si puedes cambiar el nombre de la ciudad y el contenido sigue teniendo sentido, es una página puerta (método de RicketyRoo). Una empresa de HVAC perdió el 80% de sus rankings + 63% de su tráfico tras la Actualización de Core de marzo de 2024 por este patrón
  - Fotos locales, testimonios específicos de la zona, FAQs locales
- Mapa de Google embebido (refuerzo de señal geográfica, no factor de ranking directo -- usar lazy-load para mitigar el impacto en velocidad)
- Botón de clic para llamar (enlace `tel:`) y formulario de contacto por encima del pliegue
- Arquitectura de enlazado interno: hub-and-spoke, toda página crítica a 3 clics como máximo de la home
- 2-5 enlaces internos contextuales por cada 1.000 palabras con anchor text descriptivo

**Específico multi-ubicación:**
- Buscador de tiendas con URLs individuales rastreables (se prefiere SSR/SSG frente a CSR)
- Estructura de subdirectorio: `dominio.com/ubicaciones/nombre-ciudad/` (los subdirectorios consolidan mejor el link equity, Bruce Clay: aumento de tráfico del 50%+)
- Cada página de ubicación tiene su propio schema LocalBusiness único con `@id`

**Guía de puntuación:**
- Completo: ciudad en título + H1, NAP visible, páginas de servicio dedicadas, sin patrones de página puerta, buen enlazado interno
- Parcial: algunas señales locales pero faltan páginas de servicio o hay riesgo de página puerta
- Bajo: título/H1 genéricos, NAP no visible, páginas de ubicación escasas

### 4. Consistencia NAP y Citas (15%)

Las citas están perdiendo peso para el ranking del pack tradicional, pero **3 de los 5 principales factores de visibilidad en IA están relacionados con citas** (Whitespark 2026). La actualización de documentación de Google de julio de 2025 eliminó "directorios" de la definición de prominencia.

**Comprobar:**
- Extracción de NAP: compara Nombre, Dirección, Teléfono de:
  1. HTML visible de la página (footer, página de contacto)
  2. Schema JSON-LD de LocalBusiness
  3. Cualquier dato de GBP visible
  - Marca cualquier discrepancia entre estas tres fuentes
- Presencia de citas en directorios de Nivel 1 (comprobar vía WebFetch o patrones de búsqueda site:):
  - Señales de Google Business Profile en la página
  - Yelp: `site:yelp.com "Nombre del Negocio"`
  - BBB: `site:bbb.org "Nombre del Negocio"`
  - Referencias a la página de negocio de Facebook
- Conciencia sobre **Apple Maps / fichas de negocio de Apple**: reclamar y mantener los listados de Apple al día; trata cualquier afirmación sobre el lanzamiento/rebranding de una "plataforma unificada" de Apple Business como procedente de TechRadar y verifícala contra la fuente oficial de Apple antes de darla por buena.
- Conciencia de Bing Places (impulsa ChatGPT, Copilot, Alexa -- se recomienda reclamarlo y optimizarlo)
- Recomendaciones de directorios específicos del sector: carga `../seo/references/local-schema-types.md` para las fuentes de citas por vertical
- Conciencia de agregadores de datos: Data Axle, Foursquare, Neustar/TransUnion (se recomienda el envío para distribución posterior)

**Guía de puntuación:**
- Completo: NAP consistente entre página/schema, citas de Nivel 1 detectadas, directorios del sector presentes
- Parcial: NAP presente pero con inconsistencias, faltan algunas citas
- Bajo: discrepancias en el NAP, sin citas detectables, sin dirección en el schema

### 5. Marcado de Schema Local (10%)

El schema NO es un factor de ranking directo (confirmado por John Mueller). Pero habilita rich results (aumento del 43% en CTR, caso de estudio de Webstix) y ayuda a los sistemas de IA a interpretar la información del negocio.

**Comprobar:**
- Presencia de schema LocalBusiness (extraer bloques JSON-LD)
- Propiedades obligatorias: `name`, `address` con las subpropiedades de PostalAddress
- Propiedades recomendadas: `geo` (mínimo 5 decimales, Confirmado), `openingHoursSpecification`, `telephone`, `url`, `priceRange` (<100 caracteres), `image`, `aggregateRating`
- **Subtipo correcto para el sector** -- carga `../seo/references/local-schema-types.md`:
  - Restaurante usando `Restaurant`, no el genérico `LocalBusiness`
  - Legal usando `LegalService`, no el obsoleto `Attorney`
  - Concesionario usando `AutoDealer`, no el obsoleto `VehicleListing`
  - Sanidad usando `MedicalClinic`/`Hospital`/`Dentist`, no el genérico `MedicalBusiness`
- Específico de SAB: `areaServed` con ciudades con nombre (recomendado, no está en la lista oficial de Google pero sí soportado por Schema.org)
- Multi-ubicación: cada página de ubicación tiene su propio LocalBusiness con `@id` único, vinculado vía `branchOf` a la Organization de la home
- Patrones de schema específicos del sector (según `../seo/references/local-schema-types.md`):
  - Restaurante: Menu + MenuSection + MenuItem + ReserveAction (nota: las acciones de Reserva/Pedido no son rich results soportados por Google; su valor es aportar datos de negocio legibles por máquina)
  - Sanidad: Physician (Person) + MedicalSpecialty + sameAs al NPI
  - Legal: LegalService + Person + Service (áreas de práctica)
  - Servicios para el Hogar: Subtipo + areaServed + Service
  - Inmobiliaria: RealEstateAgent + Person + RealEstateListing
  - Automoción: AutoDealer + Car + Offer (schemas de departamento separados)

**Guía de puntuación:**
- Completo: subtipo correcto, todas las propiedades recomendadas, patrones específicos del sector, JSON-LD válido
- Parcial: LocalBusiness presente pero con tipo genérico o faltan propiedades recomendadas
- Bajo: sin schema local, o schema con errores/contenido de relleno

### 6. Señales de Enlaces y Autoridad Local (10%)

Los enlaces están perdiendo peso para el local pack pero siguen representando **~26% del ranking orgánico local** (Whitespark 2026, grupo de factores #2). La presencia en listas "best of" es el **factor de citación de visibilidad en IA #1**.

**Comprobar:**
- Indicadores de backlinks locales detectables desde la página:
  - Menciones o enlaces de la Cámara de Comercio (Trust Flow alto, ~80% más visitas de consumidores, GlueUp)
  - Acreditación/insignia de BBB (Google usa BBB para verificación de negocios)
  - Menciones en prensa/noticias locales
  - Señales de implicación comunitaria (patrocinios, eventos locales, colaboraciones)
- Presencia en listas "best of" (principal factor de visibilidad en IA según Whitespark 2026)
- Señales de PR digital: el 66,2% de los profesionales de PR ya monitorizan las citaciones en IA como KPI (BuzzStream 2026)
- Las menciones de marca correlacionan **3 veces más fuerte** con la visibilidad en IA que los backlinks tradicionales (Ahrefs: correlación de 0,664 vs 0,218)
- Benchmark de velocidad de enlaces: 5-10 enlaces locales de calidad al mes para pequeños negocios (consenso)

**Guía de puntuación:**
- Completo: señales de autoridad local visibles (cámara, BBB, prensa), implicación comunitaria evidente
- Parcial: algunas señales de autoridad pero indicadores de enlaces locales limitados
- Bajo: sin señales de autoridad local detectables

---

## Impacto de la Búsqueda con IA en lo Local

**No dupliques el análisis de seo-geo.** Proporciona contexto de IA específico para lo local y recomienda `/seo geo <url>` para el análisis completo.

Datos clave de IA local:
- Los AI Overviews aparecen en hasta el 68% de las búsquedas locales (Whitespark Q2 2025)
- ChatGPT convierte al 15,9% frente al 1,76% del orgánico de Google (Seer Interactive)
- 3 de los 5 principales factores de visibilidad en IA están relacionados con citas (Whitespark 2026)
- ChatGPT NO accede directamente a GBP -- se nutre del índice de Bing, Yelp, TripAdvisor, BBB, Reddit
- Bing Places es crítico: impulsa ChatGPT, Copilot, Alexa
- Cambios observados por terceros en la interfaz local de IA (móvil, EE.UU.) podrían mostrar solo 1-2 negocios, un 32% menos que antes (Sterling Sky)

**Recomendación**: ejecuta `/seo geo <url>` para un análisis completo de visibilidad en búsqueda con IA que incluye puntuación de citabilidad, comprobación de llms.txt y auditoría de menciones de marca.

---

## Archivos de Referencia

Cárgalos bajo demanda según se necesiten:
- `../seo/references/local-seo-signals.md`: factores de ranking, benchmarks de reseñas, niveles de citas, estado de funciones de GBP, actualizaciones de algoritmo
- `../seo/references/local-schema-types.md`: subtipos de LocalBusiness por sector, patrones de schema, fuentes de citas por vertical

---

## Salida

Genera `LOCAL-SEO-ANALYSIS-{dominio}.md` con:

1. **Puntuación de SEO Local: XX/100** con tabla de desglose por dimensión
2. **Tipo de negocio**: físico / SAB / híbrido
3. **Vertical de sector detectado** + hallazgos específicos del sector
4. **Checklist de optimización de GBP** (señales detectadas vs. faltantes)
5. **Instantánea de salud de reseñas** (valoración, recuento, indicadores de velocidad, patrones de respuesta)
6. **Auditoría de consistencia NAP** (discrepancias entre página y schema, comparación entre fuentes)
7. **Comprobación de presencia de citas** (estado en directorios de Nivel 1)
8. **Estado del schema local** (presente/ausente/mal formado + solución lista para usar)
9. **Calidad de la página de ubicación** (si es multi-ubicación: % de contenido único, riesgo de página puerta, buscador de tiendas)
10. **Top 10 de acciones priorizadas** (Crítico > Alto > Medio > Bajo)
11. **Descargo de limitaciones**: qué NO pudo evaluar este análisis (ranking geo-grid, Domain Authority, backlinks completos, datos de GBP Insights, posición en tiempo real del local pack) y qué herramientas de pago pueden cubrir esas carencias

---

## Quick Wins

1. Reclamar y optimizar Apple Maps / fichas de negocio de Apple; verificar cualquier afirmación sobre lanzamiento/rebranding de Apple Business contra la fuente oficial de Apple primero
2. Reclamar y optimizar Bing Places (impulsa ChatGPT, Copilot, Alexa)
3. Corregir cualquier discrepancia de NAP entre página, schema y GBP
4. Añadir schema LocalBusiness con el subtipo de sector correcto
5. Añadir coordenadas `geo` con precisión de 5+ decimales
6. Asegurar que el número de teléfono usa enlace `tel:` para clic-para-llamar
7. Añadir keyword de ciudad + servicio al title tag y al H1

## Esfuerzo Medio

1. Crear una página dedicada para cada servicio principal (Whitespark: factor orgánico local #1)
2. Construir una estrategia de generación de reseñas manteniendo una cadencia mínima de 18 días
3. Enviar a tres agregadores de datos (Data Axle, Foursquare, Neustar/TransUnion) para distribución posterior
4. Reclamar listados en directorios específicos del sector (según recomendaciones por vertical)
5. Añadir patrones de schema específicos del sector (Menu para restaurantes, Physician para sanidad, etc.)
6. Implementar enlazado interno hub-and-spoke para páginas de servicio/ubicación

## Alto Impacto

1. Construir una estrategia de PR digital local dirigida a listas "best of" (factor de visibilidad en IA #1)
2. Desarrollar contenido único y no intercambiable para cada página de ubicación (>60% único)
3. Establecer presencia en las plataformas de las que se nutre ChatGPT (Yelp, TripAdvisor, BBB, Reddit)
4. Buscar la membresía en la Cámara de Comercio y BBB (señales de autoridad + verificación)
5. Crear contenido de implicación comunitaria (patrocinios, eventos locales, colaboraciones)

---

## Integración con DataForSEO (Opcional)

Si las herramientas DataForSEO MCP están disponibles, usa `business_data_business_listings_search` para la extracción de datos de GBP/fichas de negocio en vivo y la auditoría de citas en directorios, y `serp_organic_live_advanced` para posiciones del local pack en tiempo real.

---

## Manejo de Errores

| Escenario | Acción |
|-----------|--------|
| URL inaccesible (fallo de DNS, conexión rechazada) | Informa el error con claridad. No inventes el contenido del sitio. Sugiere al usuario verificar la URL y volver a intentarlo. |
| No se detectaron señales locales en la página | Informa de que no se encontraron indicadores de negocio local. Sugiere al usuario confirmar que es un negocio local y proporcionar la URL de la ficha de GBP si está disponible. |
| NAP no encontrado en el HTML de la página | Comprueba el schema y las meta etiquetas. Si sigue ausente, márcalo como problema Crítico. Recomienda añadir un NAP visible en el footer y la página de contacto. |
| Vertical de sector poco claro | Presenta los dos verticales detectados más probables con sus señales de apoyo. Pide al usuario que confirme antes de aplicar recomendaciones específicas del sector. |
| Multi-ubicación con 50+ páginas de ubicación | Aplica los controles de calidad del orquestador seo: AVISO a partir de 30+ páginas (exigir 60%+ de contenido único), PARADA OBLIGATORIA a partir de 50+ páginas (requiere justificación del usuario antes de continuar). |

## Integración con el Framework FLOW

Para optimización local guiada por prompts, usa `/seo flow local <url>` — los 11 prompts de la etapa local de FLOW cubren la optimización de GBP, meta descriptions, title tags y flujos estructurados de auditoría local.
