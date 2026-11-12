// Configuración por variables de entorno. Sin secretos en el repositorio.
export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://lopp:lopp@127.0.0.1:5432/lopp_dev',
  secureCookies: process.env.COOKIE_SECURE === '1',
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  // SOLO para pruebas locales: permite rastrear hosts privados/loopback. NUNCA en producción.
  allowPrivateTargets: process.env.ALLOW_PRIVATE_TARGETS === '1',
  crawl: {
    maxPages: Number(process.env.CRAWL_MAX_PAGES || 25),
    maxDepth: Number(process.env.CRAWL_MAX_DEPTH || 2),
    delayMs: Number(process.env.CRAWL_DELAY_MS || 300),
    timeoutMs: Number(process.env.CRAWL_TIMEOUT_MS || 10000),
    maxBytes: Number(process.env.CRAWL_MAX_BYTES || 2_000_000),
    maxExternalChecks: Number(process.env.CRAWL_MAX_EXTERNAL_CHECKS || 15),
    userAgent: 'VIPTechLocalAnalyzer/0.1 (+auditoria-seo; contacto via VIP Tech Consulting)'
  },
  providers: {
    googlePlacesKey: process.env.GOOGLE_PLACES_API_KEY || '',
    pagespeedKey: process.env.PAGESPEED_API_KEY || '',
    pagespeedEnabled: process.env.PAGESPEED_ENABLED !== '0',
    dataforseoLogin: process.env.DATAFORSEO_LOGIN || '',
    dataforseoPassword: process.env.DATAFORSEO_PASSWORD || ''
  },
  defaultMonthlyCostLimitUsd: Number(process.env.DEFAULT_MONTHLY_COST_LIMIT_USD || 25),
  confirmCostAboveUsd: Number(process.env.CONFIRM_COST_ABOVE_USD || 0)
};
