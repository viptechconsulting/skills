# Arquitectura

**Stack:** Node ≥20 (ESM, JavaScript) + Express · PostgreSQL (`db/schema.sql`) · SPA sin dependencias (DOM, sin innerHTML) · pdfkit · cheerio. Se eligió sobre Next.js/TypeScript para un MVP ejecutable sin build; migrar a Next.js+TS es razonable si el producto crece.

**Seguridad implementada:** bcrypt (12) y política ≥12 caracteres; sesiones opacas hasheadas en BD, cookie HttpOnly+SameSite=Strict (+Secure con `COOKIE_SECURE=1`); CSRF por cabecera obligatoria; límite de intentos de login; CSP; control de acceso centralizado (`auth.visibleProspects`) en cada consulta de prospecto/auditoría/reporte; SSRF: solo http/https, puertos 80/443, DNS resuelto, IPs privadas/loopback/link-local/mapeadas/NAT64/6to4 rechazadas y revalidadas en cada redirección; límites de rastreo (páginas, profundidad, bytes, timeout, pausa), robots.txt respetado, un reintento ante fallos transitorios.

**Límites conocidos:**
- Permisos en el servidor; **sin Row-Level Security en PostgreSQL** todavía (recomendado antes de producción).
- DNS rebinding entre validación y conexión no mitigado (falta fijar la IP resuelta); usar egress filtering.
- Cola de auditorías en proceso (las pendientes se marcan fallidas al reiniciar); usar pg-boss/BullMQ en producción. Rastreo sin JavaScript.
- Limitador de login en memoria (una instancia). PDFs/logos en PostgreSQL (bytea).
- `npm run seed:demo` crea un único prospecto DEMO sin métricas inventadas.
- No existe ningún envío automático a terceros.

**Despliegue:** host Node + PostgreSQL gestionado tras HTTPS; variables según `env.example`; `npm run migrate`; `create-admin`. **No se ha desplegado nada.**
