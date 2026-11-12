# VIP Tech Local Opportunity Analyzer

Aplicación web interna para vender el **Método L.E.D. Local** (Localizable · Elegible · Dominante): registra prospectos, valida elegibilidad, audita website y Google Business Profile, compara competidores, prioriza oportunidades, proyecta tiempos y exporta PDF con marca «Powered by VIP Tech Consulting».

## Instalación
```bash
npm install
cp env.example .env    # variables de entorno (cárguelas con su gestor de secretos / shell)
export DATABASE_URL=postgres://...   # BD PostgreSQL vacía
npm run migrate
ADMIN_EMAIL=you@empresa.com ADMIN_PASSWORD='Clave-Segura-123' npm run create-admin
npm start              # http://localhost:3000
npm test               # 17 pruebas; requiere PostgreSQL (DATABASE_URL de una BD de pruebas, se TRUNCA)
```
Luego: Marca → cargar el logotipo oficial (PNG/JPEG); Usuarios → crear supervisores/ejecutivos.

## Estado por módulo
| Módulo | Estado |
|---|---|
| A Usuarios/roles (admin, supervisor, ejecutivo), sesiones, aislamiento en servidor | ✅ probado |
| B Registro y elegibilidad (website + GBP + actividad local; motivos y evidencia) | ✅ probado (sin Places no verifica la *existencia* del perfil; lo declara) |
| C Auditoría técnica (robots, sitemap, HTTP, redirecciones, canonicals, títulos, H1, duplicados, huérfanas, enlaces rotos, schema, NAP, contacto, servicios/ubicación, viewport) | ✅ probado contra sitio local de prueba |
| C Core Web Vitals / velocidad móvil | ⚙️ vía PageSpeed Insights/CrUX; **no probado** (sin Internet para esa API aquí) |
| D GBP (datos públicos) | ⚙️ Google Places (New) implementado, **no probado con credenciales reales**; datos privados pendientes |
| E Keywords | ✅ carga manual (sin dato ≠ sin ranking); ⏳ DataForSEO/Search Console/Semrush/Ahrefs pendientes |
| F Competencia | ✅ manual; ⚙️ descubrimiento con Places (no probado); ⏳ cuadrícula geográfica pendiente |
| G Oportunidades (fórmula en `docs/SCORING.md`) | ✅ probado |
| H Proyección (implementación vs. ventana de mejora separadas) | ✅ probado; ventana solo con evidencia suficiente |
| I Dashboard responsivo | ✅ verificado en navegador; mapa local pendiente |
| J PDF comercial y técnico | ✅ probado (marca, ejecutivo, paginación, enlaces) |
| K Seguimiento, historial, comparación de diagnósticos | ✅ probado |
| L Costos: caché, límites, confirmación | ✅ probado |

Ver `docs/ARCHITECTURE.md` (arquitectura, seguridad, limitaciones, despliegue) y `docs/API_RESEARCH.md` (APIs, permisos y costos a verificar).
