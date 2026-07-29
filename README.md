# Lynkro Outbound

MVP de llamadas salientes con inteligencia artificial: un agente de voz (Twilio
+ OpenAI Realtime) llama a prospectos, califica, agenda citas en GoHighLevel,
transfiere a un humano cuando corresponde y registra un resultado
estructurado — todo bajo reglas de elegibilidad y cumplimiento que **nunca**
dependen del criterio del modelo (ver `IMPLEMENTATION_PLAN.md` para la
arquitectura completa).

> Este repositorio también contiene contenido de marketing de Lynkro
> (`carousel-lynkro-tipo-i/`, `stories/`) previo a este proyecto, sin relación
> con el software. El monorepo de Lynkro Outbound vive en `apps/` y `packages/`.

## Índice

- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Variables de entorno](#variables-de-entorno)
- [Desarrollo local](#desarrollo-local)
- [Modo simulación](#modo-simulación)
- [Configuración de integraciones](#configuración-de-integraciones)
- [Túnel para webhooks de Twilio](#túnel-para-webhooks-de-twilio)
- [Pruebas](#pruebas)
- [Docker](#docker)
- [Primera llamada de prueba end-to-end](#primera-llamada-de-prueba-end-to-end)
- [Cumplimiento y aviso legal](#cumplimiento-y-aviso-legal)
- [Solución de problemas](#solución-de-problemas)

## Arquitectura

Monorepo pnpm con TypeScript estricto:

```
apps/
  web/      Next.js 14 (App Router) — panel administrativo
  api/      Fastify — API de negocio, webhooks de Twilio, puente WS Twilio<->OpenAI Realtime
  worker/   BullMQ — programación de llamadas, reintentos, mantenimiento
packages/
  shared/   Zod, tipos de dominio, máquina de estados, motor de elegibilidad, teléfono, horarios
  db/       Prisma (schema, migraciones, seed) + repositorios con aislamiento por organización
  adapters/ Interfaces + implementaciones (Twilio, OpenAI Realtime, GoHighLevel, simulación)
  domain/   Lógica de negocio compartida entre api y worker (elegibilidad, tools, reintentos, orquestación de llamadas)
  config/   Carga y validación de variables de entorno (Zod)
```

Ver `IMPLEMENTATION_PLAN.md` para el detalle completo de arquitectura, modelo
de datos, máquina de estados, endpoints, webhooks, herramientas del agente,
reglas de reintento y estrategia de pruebas.

## Requisitos

- Node.js 20+ (probado con Node 22)
- pnpm 10+ (`corepack enable` recomendado)
- PostgreSQL 14+ (local, Docker o Supabase)
- Redis 6+ (local o Docker)
- Docker y Docker Compose (opcional, para levantar Postgres/Redis o toda la stack)

## Instalación

```bash
pnpm install
cp .env.example .env
# Genera valores reales para JWT_SECRET y ENCRYPTION_KEY:
openssl rand -hex 32   # usar para JWT_SECRET
openssl rand -hex 32   # usar para ENCRYPTION_KEY
```

Completa `.env` con esos valores. El resto de variables tienen valores por
defecto razonables para desarrollo local en modo simulación.

## Variables de entorno

Ver `.env.example` para la lista completa y comentada. Resumen por dominio:

| Variable | Uso |
|---|---|
| `JWT_SECRET`, `ENCRYPTION_KEY` | Firma de sesión y cifrado de credenciales de integraciones (AES-256-GCM). **Obligatorias.** |
| `DATABASE_URL`, `DIRECT_URL` | Conexión Prisma/Postgres (Supabase u otro). |
| `REDIS_URL` | Conexión BullMQ. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_DEFAULT_FROM_NUMBER`, `TWILIO_WEBHOOK_BASE_URL` | Twilio Voice + Media Streams. Solo necesarias fuera de modo simulación. |
| `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL` | OpenAI Realtime API. Solo necesarias fuera de modo simulación. |
| `GHL_BASE_URL`, `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, `GHL_SHARED_SECRET` | GoHighLevel. Las credenciales reales de cada organización se guardan cifradas vía el panel (`/integrations`), no por variable de entorno global. |
| `SIMULATION_MODE` | Modo simulación global por defecto (cada campaña puede sobreescribirlo). |
| `NEXT_PUBLIC_API_BASE_URL` | URL de la API que usa el panel web desde el navegador. |

Cada app (`apps/api`, `apps/worker`) carga automáticamente el `.env` de la
raíz del monorepo al arrancar (`packages/config`'s `loadRootDotEnv`), y falla
rápido con un mensaje claro si falta una variable requerida — nunca imprime
valores de variables, solo nombres.

## Desarrollo local

1. Levanta Postgres y Redis (Docker, ver [Docker](#docker), o instalaciones locales).
2. Aplica migraciones y carga datos de demostración:
   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```
   Esto crea la organización "Lynkro Demo", el usuario `demo@lynkro.io`
   (contraseña impresa en consola o configurable con `SEED_DEMO_PASSWORD`),
   un número de salida y agente de voz de ejemplo, y la campaña **Diagnóstico
   Lynkro** con un prospecto ficticio.
3. Arranca los tres servicios (en tres terminales, o con `pnpm dev` para los
   tres en paralelo):
   ```bash
   pnpm dev:api      # http://localhost:4000
   pnpm dev:worker
   pnpm dev:web      # http://localhost:3000
   ```
4. Abre `http://localhost:3000`, crea una organización o inicia sesión con
   `demo@lynkro.io`.

## Modo simulación

Con `SIMULATION_MODE=true` (o `simulationMode: true` por campaña, valor por
defecto al crear una campaña desde el panel), **ningún teléfono real es
marcado y no se gastan créditos de OpenAI**. Los adaptadores de
telefonía/IA/CRM/calendario/mensajería se reemplazan por implementaciones en
memoria (`packages/adapters/src/*/simulation*.ts`) que:

- Generan un `CallSid` simulado y avanzan la máquina de estados de la llamada
  igual que lo haría una llamada real contestada por una persona.
- Ejecutan un guion de conversación simulado que llama herramientas reales
  del sistema (`add_call_note`, `end_call`) a través del mismo executor con
  guardrails que usaría una llamada real.
- Producen un resultado estructurado válido (`CallOutcome`) y disparan la
  misma lógica de reintentos/analítica que una llamada real.

Esto permite probar todo el flujo de negocio (elegibilidad, campañas,
prospectos, reintentos, analítica) sin credenciales de Twilio/OpenAI/GHL.

## Configuración de integraciones

Las credenciales reales se configuran **por organización** desde el panel
(`/integrations`), no por variable de entorno global — se cifran con
`ENCRYPTION_KEY` (AES-256-GCM) antes de guardarse y nunca se devuelven al
frontend una vez guardadas.

- **Twilio**: Account SID + Auth Token. Necesitas un número de voz con
  Programmable Voice habilitado y Media Streams disponible en tu cuenta.
- **OpenAI**: API Key con acceso a la Realtime API, y el modelo (ej.
  `gpt-4o-realtime-preview`).
- **GoHighLevel**: Base URL, Access Token y Location ID (API v2 /
  `services.leadconnectorhq.com`).

Para desactivar el modo simulación de una campaña, edita la campaña
(`simulationMode: false`) **solo después** de configurar las tres
integraciones para esa organización — `buildAdapterBundle` lanza un error
explícito si falta alguna.

## Túnel para webhooks de Twilio

Twilio necesita alcanzar tu API desde internet para los webhooks de estado,
AMD, grabación y el WebSocket de Media Streams. En desarrollo local, usa un
túnel (ngrok, Cloudflare Tunnel, etc.):

```bash
ngrok http 4000
```

Configura `TWILIO_WEBHOOK_BASE_URL` en `.env` con la URL pública HTTPS que te
dé el túnel (ej. `https://abc123.ngrok.io`) y reinicia `apps/api`. El
WebSocket del Media Stream se deriva automáticamente de esa URL (`https` →
`wss`).

## Pruebas

```bash
pnpm test          # toda la suite (packages y apps)
pnpm test:watch    # modo watch
```

La suite usa una base de datos de pruebas separada (por defecto
`lynkro_outbound_test` en el mismo Postgres local; configurable con
`TEST_DATABASE_URL`). Ningún test llama servicios externos reales — todos los
adaptadores externos están simulados o son instancias en memoria. Antes de
correr por primera vez, asegúrate de que la base de pruebas exista y tenga el
esquema aplicado:

```bash
createdb lynkro_outbound_test   # o el equivalente en tu gestor de Postgres
DATABASE_URL="postgresql://<user>:<pass>@localhost:5432/lynkro_outbound_test" \
  pnpm --filter @lynkro-outbound/db exec prisma migrate deploy
```

Cobertura: normalización telefónica a E.164, aislamiento entre
organizaciones, motor de elegibilidad (todas las razones de rechazo),
horario permitido por zona horaria, Do Not Call, límite de intentos,
idempotencia de webhooks, transiciones de la máquina de estados, anti
doble-reserva de citas, validación y autorización de herramientas del
agente, reintentos (programación/detención/máximos), cancelaciones, y
resultado estructurado obligatorio al finalizar una llamada.

## Docker

```bash
pnpm docker:build   # construye las imágenes de api, worker y web
pnpm docker:up      # levanta postgres, redis, api, worker y web
pnpm docker:logs
pnpm docker:down
```

`docker-compose.yml` levanta Postgres y Redis con volúmenes persistentes, y
construye `apps/api`, `apps/worker` y `apps/web` desde sus `Dockerfile`
(multi-stage, usando pnpm). El servicio `web` usa `output: "standalone"` de
Next.js para una imagen final ligera. Las apps de Node (`api`, `worker`)
ejecutan el código TypeScript directamente vía `tsx` en producción (sin paso
de compilación separado) — un enfoque simple y confiable para un monorepo con
paquetes internos consumidos como fuente TS.

> Nota: los `Dockerfile` de este proyecto no pudieron construirse ni
> ejecutarse dentro de este entorno de desarrollo (no había un daemon de
> Docker disponible en la sandbox donde se construyó este MVP). Están escritos
> siguiendo las convenciones estándar de pnpm + Next.js standalone, pero
> **deben validarse con un `docker compose build` real** antes de un despliegue
> productivo.

## Primera llamada de prueba end-to-end

### En modo simulación (sin credenciales reales)

1. `pnpm db:migrate && pnpm db:seed`
2. `pnpm dev:api`, `pnpm dev:worker`, `pnpm dev:web`
3. Inicia sesión con `demo@lynkro.io` (contraseña impresa por el seed).
4. Ve a **Prospectos**, abre "Mariana Torres" (o crea uno nuevo con
   `consentGiven=true`), y haz clic en **Llamar ahora**.
5. El worker recibe el job, vuelve a validar elegibilidad, y ejecuta la
   llamada simulada de punta a punta (unos segundos). Refresca la página del
   prospecto: verás el estado `completed`, el resultado estructurado, y en
   **Llamadas → [ver]** la línea de tiempo completa de transiciones de estado
   y las herramientas ejecutadas (`add_call_note`, `end_call`).

### Con una llamada real (requiere credenciales reales)

1. Configura Twilio, OpenAI y GoHighLevel para tu organización en
   `/integrations`.
2. Crea un número de teléfono real en **Números telefónicos** (debe ser un
   número Twilio con voz habilitada).
3. Expón `apps/api` públicamente por HTTPS (ver
   [túnel para webhooks](#túnel-para-webhooks-de-twilio)) y configura
   `TWILIO_WEBHOOK_BASE_URL` con esa URL.
4. Crea una campaña con `simulationMode: false`, un agente de voz, y un
   prospecto **con consentimiento verificado real** y un número de teléfono
   propio para probar.
5. Haz clic en **Llamar ahora**. El worker origina la llamada por Twilio;
   Twilio contesta la llamada, obtiene el TwiML de
   `/webhooks/twilio/voice-answer/:callId`, y conecta el Media Stream
   bidireccional al WebSocket `/ws/twilio-media/:callId`, que a su vez abre
   una sesión con OpenAI Realtime usando el prompt dinámico de la campaña.
6. Los webhooks de estado, AMD y grabación (si está habilitada) actualizan la
   llamada en tiempo real; al finalizar, el resultado estructurado y el
   resumen quedan visibles en el panel.

## Cumplimiento y aviso legal

**Este software no determina la legalidad de una llamada automatizada en
ninguna jurisdicción.** Las reglas de cumplimiento (consentimiento
requerido, horario permitido, Do Not Call, grabación) son controles
configurables, no una garantía legal. Antes de operar con llamadas reales:

- Verifica los requisitos legales aplicables (TCPA, GDPR, leyes locales de
  telemarketing y protección de datos) en cada jurisdicción donde operes.
- La grabación de llamadas está **desactivada por defecto** (`recordingEnabled: false`
  en cada campaña); actívala explícitamente solo si tienes el aviso de
  grabación correspondiente y la base legal para grabar.
- La conservación de transcripciones se controla con `TRANSCRIPT_RETENTION_DAYS`;
  documenta y aplica tu propia política de retención y eliminación de datos.
- El consentimiento (`consentGiven`, `consentDate`) y el origen del
  prospecto (`source`) deben reflejar evidencia real de autorización — el
  sistema los almacena y los usa en el motor de elegibilidad, pero no puede
  verificar por sí mismo que la evidencia subyacente sea válida.

## Solución de problemas

- **`EnvValidationError` al arrancar `apps/api`/`apps/worker`**: falta una
  variable requerida (`JWT_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`) o tiene
  un formato inválido. El mensaje lista exactamente qué falta, sin imprimir
  valores.
- **Prisma no encuentra el cliente generado**: corre `pnpm db:generate`
  después de cualquier cambio a `packages/db/prisma/schema.prisma`.
- **Los tests de integración fallan con error de conexión a Postgres/Redis**:
  confirma que ambos estén corriendo (`pnpm docker:up` o localmente) y que
  `TEST_DATABASE_URL`/`REDIS_URL` apunten a instancias accesibles.
- **El panel no puede iniciar sesión (401 constante)**: revisa
  `NEXT_PUBLIC_API_BASE_URL` en `apps/web/.env.local` y `CORS_ALLOWED_ORIGINS`
  en `.env` — deben coincidir con el origen real desde el que sirves el
  panel.
- **`429`/`403` "Rate limit exceeded"**: el rate limiting global
  (`RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS`) es intencional para mitigar
  abuso; ajusta los valores en `.env` si tu flujo de pruebas genera más
  tráfico del esperado en desarrollo.
- **Twilio rechaza el webhook / firma inválida**: confirma que
  `TWILIO_WEBHOOK_BASE_URL` coincide **exactamente** (esquema y host) con la
  URL pública que Twilio usa para llamar al webhook — la validación de firma
  de Twilio es sensible a esto.
- **Grabaciones o transcripciones no aparecen**: revisa que
  `recordingEnabled` esté activo en la campaña y que la integración de
  Twilio esté configurada; el webhook de grabación descarta silenciosamente
  la URL si la campaña no tiene grabación habilitada explícitamente.
