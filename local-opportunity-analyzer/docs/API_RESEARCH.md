# Investigación de APIs (Fase 1)

> Escrita desde conocimiento previo, **sin acceso a la documentación en vivo desde este entorno**. Verifique permisos, cuotas y tarifas vigentes antes de contratar; los costos del código son estimaciones.

| Fuente | Uso | Datos / limitación | Costo / acceso | Estado |
|---|---|---|---|---|
| Google Places API (New) | Perfil público de Maps, competidores | Rating, reseñas (muestra limitada), categoría, horarios, teléfono, web; no descripción del dueño, servicios, atributos ni insights | Facturable por SKU/campos; requiere clave | Implementado, no probado |
| Business Profile API | Datos privados | Requiere aprobación de Google y OAuth del dueño del perfil | Gratis con aprobación | Pendiente |
| Search Console API | Consultas/posiciones reales | OAuth del propietario del sitio | Gratis | Pendiente |
| PageSpeed Insights API | Lighthouse móvil + CrUX | Cuota anónima baja; clave gratuita; CrUX solo con tráfico suficiente | Gratis | Implementado, no probado |
| Keyword Planner | Volumen | Requiere cuenta Ads y developer token | Gratis con acceso | Pendiente |
| DataForSEO / Semrush / Ahrefs | Volumen, dificultad, SERP local, backlinks | Suscripción/créditos | De pago | Pendiente (carga manual hoy) |
| Cuadrícula de ranking local | Posición por punto geográfico | Proveedores especializados | De pago | Pendiente |

Regla de la app: cada hallazgo guarda fuente, fecha y confianza; ausencia de dato = «sin dato», nunca 0 ni «no rankea».
