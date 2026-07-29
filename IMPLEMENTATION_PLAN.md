# Lynkro Outbound — Implementation Plan

> MVP de llamadas salientes con IA para prospectos, con cumplimiento normativo
> determinístico, aislamiento multi-organización y adaptadores desacoplados
> para telefonía, IA conversacional, CRM, calendario y mensajería.

## 0. Alcance de este documento

Este documento es la fuente de verdad de arquitectura para el MVP. Se
actualiza si el diseño cambia. Todo el código debe ser consistente con lo
aquí descrito; si hay discrepancia, este documento gana salvo que el código
lo corrija explícitamente en un commit posterior que también actualice este
archivo.

## 1. Objetivo del producto

Permitir a una organización (agencia o negocio) cargar prospectos con
consentimiento verificable, definir campañas de llamadas salientes con IA,
y dejar que un agente de voz (Twilio + OpenAI Realtime) llame, converse,
califique, agende citas en GoHighLevel, transfiera a un humano cuando haga
falta, y registre un resultado estructurado — todo bajo reglas de
elegibilidad y cumplimiento que **nunca** dependen del criterio del modelo.

## 2. Principios de diseño

1. **El cumplimiento es determinístico.** Ninguna decisión de elegibilidad,
   DNC, horario permitido, límite de intentos o duplicados se delega al LLM.
   Se ejecuta en backend, en código, antes de encolar cualquier llamada.
2. **Una sola herramienta `end_call`** en todo el sistema — el modelo nunca
   tiene dos formas de terminar una llamada.
3. **Adaptadores desacoplados.** Twilio, OpenAI y GoHighLevel son
   implementaciones de interfaces (`TelephonyProvider`, `AIProvider`,
   `CrmProvider`, `CalendarProvider`, `MessagingProvider`). Se pueden
   sustituir sin tocar la lógica de negocio.
4. **Modo simulación de punta a punta.** Toda la aplicación debe poder
   ejecutarse sin marcar un teléfono real ni gastar créditos de OpenAI,
   usando adaptadores simulados con las mismas interfaces.
5. **Idempotencia y auditoría en todo lo externo.** Webhooks, ejecución de
   herramientas del agente y cambios de configuración sensible quedan
   registrados con un identificador de correlación.
6. **Aislamiento multi-organización estricto.** Toda tabla de datos de
   negocio tiene `organizationId`; todo query del backend se filtra por la
   organización de la sesión autenticada. No existe un endpoint que permita
   cruzar organizaciones salvo un rol `platform_admin` explícito (fuera de
   alcance del MVP, documentado como riesgo).
7. **No asumir legalidad.** El software no decide si una llamada
   automatizada es legal en una jurisdicción. Expone controles (consentimiento,
   grabación opt-in, horario permitido, DNC) y dejar la configuración legal
   a cada organización.

## 3. Arquitectura general

```
                          ┌─────────────────────┐
                          │   apps/web (Next.js)│  Panel admin (SSR + API routes propias solo de UI)
                          └──────────┬───────────┘
                                     │ REST/JSON (fetch, auth por cookie/JWT)
                                     ▼
┌───────────────┐   BullMQ    ┌──────────────┐   Prisma    ┌──────────────┐
│ apps/worker    │◄───────────►│  apps/api    │◄───────────►│  PostgreSQL   │
│ (BullMQ worker)│   Redis     │ (Fastify)    │             │  (Supabase)   │
└───────┬────────┘             └──────┬───────┘             └──────────────┘
        │ orquesta llamada            │ webhooks + WS media stream
        ▼                             ▼
┌────────────────┐            ┌──────────────────────┐
│ packages/       │            │  Twilio Voice +       │
│ adapters        │◄──────────►│  Media Streams (WS)   │
│ (telephony/ai/  │            └──────────┬───────────┘
│ crm/calendar/   │                       │ audio bidireccional
│ messaging)      │            ┌──────────▼───────────┐
└────────┬────────┘            │  OpenAI Realtime API  │
         │                     └───────────────────────┘
         ▼
┌────────────────┐
│  GoHighLevel     │
│  (CRM+Calendar+  │
│   Mensajería)    │
└────────────────┘
```

### Monorepo (pnpm workspaces, TypeScript estricto)

```
apps/
  web/      Next.js 14 (App Router) — panel administrativo
  api/      Fastify — API de negocio, webhooks, WS bridge Twilio<->OpenAI
  worker/   BullMQ worker — programación de llamadas, reintentos, mantenimiento
packages/
  shared/   Zod schemas, tipos de dominio, máquina de estados, motor de
            elegibilidad, normalización telefónica, utilidades de horario
  db/       Prisma schema, cliente, migraciones, seed de demostración
  adapters/ Interfaces + implementaciones (twilio, openai-realtime, ghl,
            simulation) para telefonía/IA/CRM/calendario/mensajería
  config/   Carga y validación de variables de entorno (Zod) por app
```

## 4. Tecnologías y por qué

| Área | Elección | Motivo |
|---|---|---|
| Monorepo | pnpm workspaces | Simple, rápido, sin infraestructura extra de build system |
| Web | Next.js 14 App Router | SSR + panel admin, ecosistema React maduro |
| API | Fastify + TS | Tipado fuerte, hooks de ciclo de vida, bajo overhead, buen soporte de WS |
| Worker | BullMQ + ioredis | Colas confiables con reintentos, backoff, retraso programado |
| DB | PostgreSQL (Supabase) | Relacional, RLS disponible si se desea reforzar aislamiento a nivel DB |
| ORM | Prisma | Migraciones declarativas, tipado generado |
| Validación | Zod | Única fuente de verdad de validación de entrada externa |
| Telefonía | Twilio Programmable Voice + Media Streams | Origina llamadas, eventos de estado, audio bidireccional por WS |
| IA conversacional | OpenAI Realtime API | Voz-a-voz de baja latencia, tool calling nativo |
| CRM/Calendario | GoHighLevel API | Contactos, oportunidades, notas, calendarios/citas |
| Tests | Vitest | Rápido, ESM nativo, buen soporte de mocks |
| Contenedores | Docker + docker-compose | Postgres/Redis locales reproducibles |

## 5. Variables de entorno

Ver `.env.example` (raíz) para el archivo real sin valores. Resumen por
dominio:

- **App**: `NODE_ENV`, `LOG_LEVEL`, `APP_BASE_URL`, `API_BASE_URL`, `PORT_API`, `PORT_WORKER`, `PORT_WEB`
- **Seguridad**: `JWT_SECRET`, `SESSION_COOKIE_NAME`, `ENCRYPTION_KEY` (32 bytes, AES-256-GCM para secretos de integraciones), `CORS_ALLOWED_ORIGINS`
- **Base de datos**: `DATABASE_URL`, `DIRECT_URL` (Supabase/Prisma)
- **Supabase**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- **Redis/BullMQ**: `REDIS_URL`
- **Twilio**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_DEFAULT_FROM_NUMBER`, `TWILIO_WEBHOOK_BASE_URL`
- **OpenAI**: `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL`
- **GoHighLevel**: `GHL_BASE_URL`, `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, `GHL_SHARED_SECRET` (o token por org, ver integración por organización)
- **Modo simulación**: `SIMULATION_MODE` (`true|false` default global), override por campaña en DB
- **Cumplimiento**: `DEFAULT_ALLOWED_CALL_WINDOW_START`, `DEFAULT_ALLOWED_CALL_WINDOW_END`, `RECORDING_ENABLED_DEFAULT=false`, `TRANSCRIPT_RETENTION_DAYS`

Todas las variables se validan con Zod al arrancar cada app (`packages/config`);
la app falla rápido y de forma clara si falta una variable requerida.

## 6. Modelo de datos (Prisma, resumen)

- `Organization` (id, name, timezoneDefault, simulationMode, createdAt)
- `User` (id, organizationId, email, passwordHash, role[owner|admin|agent], mfaSecret?, createdAt)
- `Session` (para auth basada en cookies + refresh)
- `IntegrationCredential` (organizationId, provider[twilio|openai|ghl|...], encryptedPayload, updatedAt)
- `PhoneNumber` (organizationId, e164, provider, label, isActive)
- `VoiceAgent` (organizationId, name, persona, defaultLanguage, voice, systemPromptTemplate)
- `Campaign` (organizationId, name, description, language, objective, allowedWindowStart, allowedWindowEnd, timezoneDefault, outboundPhoneNumberId, maxAttempts, attemptIntervalMinutes, targetCalendarId, agentInstructions, qualificationQuestions(Json), bookingConditions(Json), transferConditions(Json), voicemailMessage, postCallBehavior(Json), status[draft|active|paused|archived], voiceAgentId, recordingEnabled, simulationMode)
- `Prospect` (organizationId, campaignId?, name, phoneE164, company, email?, language, timezone, context, intent, desiredOutcome, source, consentGiven, consentDate, status[new|scheduled|queued|in_progress|completed|blocked|...], tags(String[]), lastAttemptAt, nextAttemptAt, finalOutcome, attemptCount, unique([organizationId, phoneE164]))
- `DoNotCall` (organizationId, phoneE164 unique per org, reason, source, createdAt)
- `Call` (organizationId, campaignId, prospectId, phoneNumberId, status (enum máquina de estados), attemptNumber, scheduledAt, startedAt, endedAt, durationSeconds, costUsd, providerCallSid, outcome (enum estructurado), summary, transcript relation, recordingUrl?, qualificationAnswers(Json), objections(Json), interestLevel, isDecisionMaker, nextStep, simulation boolean)
- `CallEvent` (callId, type, payload(Json), causedBy, idempotencyKey unique, createdAt) — timeline + idempotencia de webhooks
- `CallToolExecution` (callId, toolName, args(Json), result(Json), authorized boolean, createdAt) — auditoría de tool calling
- `Appointment` (organizationId, prospectId, callId?, ghlAppointmentId, startsAt, endsAt, timezone, status)
- `AuditLog` (organizationId, actorUserId?, entityType, entityId, action, before(Json)?, after(Json)?, createdAt)
- `RetryPolicy` (campaignId, reason[no_answer|busy|voicemail|technical_failure], maxAttempts, intervalMinutes, spreadStrategy)

Todas las tablas de negocio incluyen `organizationId` con índice compuesto.

## 7. Máquina de estados de llamada

```
draft -> scheduled -> queued -> eligibility_failed (terminal)
queued -> dialing -> initiated -> ringing -> answered
answered -> human_detected | voicemail_detected
human_detected -> in_progress -> transferring? -> completed (terminal)
voicemail_detected -> completed (terminal, outcome=VOICEMAIL)
ringing/initiated -> no_answer | busy | failed (terminal)
cualquier estado no terminal -> canceled | blocked (terminal)
```

Reglas:
- Toda transición se valida contra una tabla de transiciones permitidas
  (`packages/shared/src/callStateMachine.ts`). Una transición no permitida
  lanza error y se registra como `CallEvent` de tipo `invalid_transition`.
- Cada transición crea un `CallEvent` con `idempotencyKey` (derivado del
  evento de Twilio o de la acción interna) — un evento repetido con la misma
  clave se ignora (idempotencia).

## 8. Endpoints principales (apps/api)

Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`

Campañas: `GET/POST /campaigns`, `GET/PATCH/DELETE /campaigns/:id`

Prospectos: `GET/POST /prospects`, `POST /prospects/import` (CSV), `GET/PATCH /prospects/:id`, `POST /prospects/:id/call-now`, `POST /prospects/:id/schedule`, `POST /prospects/:id/cancel`, `POST /prospects/:id/retry`, `GET /prospects/:id/history`, `POST /prospects/:id/block`

Llamadas: `GET /calls`, `GET /calls/:id`, `GET /calls/:id/timeline`

DNC: `GET/POST /dnc`, `DELETE /dnc/:id`

Números: `GET/POST /phone-numbers`

Agentes de voz: `GET/POST/PATCH /voice-agents`

Integraciones: `GET/PUT /integrations/:provider` (credenciales cifradas)

Analítica: `GET /analytics/campaigns/:id`, `GET /analytics/organization`

Webhooks Twilio: `POST /webhooks/twilio/voice-status`, `POST /webhooks/twilio/amd`, `POST /webhooks/twilio/recording` — todos validan firma `X-Twilio-Signature`.

WebSocket: `GET /ws/twilio-media/:callId` — puente de audio Twilio Media Streams <-> OpenAI Realtime.

Tools internas del agente (invocadas por el bridge, no expuestas públicamente): ver sección 10.

## 9. Motor de elegibilidad (determinístico, backend)

Antes de encolar cualquier llamada (`packages/shared/src/eligibility.ts`),
se valida en este orden, devolviendo la primera razón de rechazo:

1. Número en formato E.164 válido.
2. Consentimiento (`consentGiven=true`) si la campaña/organización lo exige.
3. No está en `DoNotCall` de la organización.
4. Campaña no está `paused`/`archived`.
5. Hora local del prospecto (por `timezone`) dentro de la ventana permitida
   de la campaña.
6. `attemptCount < maxAttempts` de la campaña.
7. No existe otra llamada activa (no terminal) para el mismo prospecto.
8. No existe una cita (`Appointment`) futura activa que haga la llamada
   redundante (a menos que sea una llamada de recordatorio explícita — fuera
   de alcance del MVP).
9. Restricciones adicionales configurables (lista extensible).

Esta función es pura, sin I/O de red (usa datos ya cargados de DB), 100%
testeable y **nunca** se ejecuta dentro del prompt o del modelo.

## 10. Herramientas del agente (tool calling)

`get_calendar_availability`, `book_appointment`, `reschedule_appointment`,
`cancel_appointment`, `get_crm_contact`, `update_crm_contact`,
`create_opportunity`, `move_opportunity_stage`, `add_call_note`,
`send_confirmation_sms`, `send_follow_up_sms`, `schedule_callback`,
`transfer_to_human`, `mark_do_not_call`, `end_call`.

Flujo de ejecución de cualquier tool:
1. El modelo solicita la tool con argumentos (JSON).
2. El bridge (`apps/api` WS handler) recibe la solicitud, **nunca la ejecuta
   directamente contra el proveedor externo**.
3. Se valida con el schema Zod específico de la tool.
4. Se aplican controles de autorización (¿la organización tiene la
   integración configurada? ¿la campaña permite agendar/transferir?).
5. Se aplican reglas de negocio específicas (máx. 2 horarios ofrecidos,
   confirmar fecha/hora/zona antes de reservar, anti-doble-reserva,
   transferencia solo si hay número humano configurado, etc.).
6. Se registra `CallToolExecution` (auditoría) con el resultado.
7. Solo entonces se llama al adaptador externo correspondiente.
8. El resultado (o error) se devuelve al modelo como tool result.

`end_call` es la única forma de terminar la llamada y siempre dispara el
post-procesamiento (resultado estructurado, resumen, actualizaciones CRM).

## 11. Reglas de reintento

Configurables por campaña vía `RetryPolicy` por razón
(`no_answer`, `busy`, `voicemail`, `technical_failure`):
- `maxAttempts`, `intervalMinutes`, y una estrategia de distribución horaria
  (`spreadStrategy`: p.ej. alternar mañana/tarde) para no reintentar siempre
  a la misma hora.
- Los reintentos siempre respetan la ventana horaria local del prospecto.
- Se detienen inmediatamente ante: conversación completada con resultado no
  terminal-retryable, cita agendada, `NOT_INTERESTED`, `DO_NOT_CALL`,
  `WRONG_NUMBER`, o `attemptCount >= maxAttempts` de la campaña.

## 12. Riesgos y límites conocidos

- El cumplimiento legal de "llamadas automatizadas" (TCPA, GDPR, leyes
  locales) varía por jurisdicción; este software **no determina legalidad**,
  solo aplica los controles configurados. Documentado también en README.
- La detección de buzón de voz (AMD) de Twilio tiene falsos positivos/negativos
  conocidos; se trata como señal, no como certeza absoluta.
- El bridge Twilio↔OpenAI Realtime es el componente de mayor complejidad de
  runtime (latencia, interrupciones, reconexión); el MVP implementa manejo
  robusto pero solo se puede validar end-to-end con credenciales reales.
- No se implementa un rol `platform_admin` cross-org; cualquier necesidad de
  soporte multi-tenant a nivel plataforma queda fuera de alcance.
- El costo real de llamada depende de lo reportado por Twilio de forma
  asíncrona (puede llegar en un webhook posterior); el campo `costUsd` puede
  quedar `null` hasta ese evento.

## 13. Estrategia de pruebas

Vitest, sin llamadas reales. Se simulan adaptadores externos.
Cobertura mínima obligatoria:
- Normalización telefónica a E.164 (`packages/shared`)
- Aislamiento por organización (queries de `packages/db`/repositorios)
- Motor de elegibilidad (todas las razones de rechazo)
- Horario permitido por zona horaria
- Do Not Call (bloqueo inmediato y persistente)
- Límite máximo de intentos
- Idempotencia de webhooks (mismo evento dos veces = un solo efecto)
- Transiciones de la máquina de estados (válidas e inválidas)
- Agenda: disponibilidad, reserva, reserva duplicada (anti doble-booking)
- Ejecución de herramientas del agente (autorización + validación Zod)
- Reintentos (programación, límites, detención por resultado terminal)
- Cancelaciones
- Resultado estructurado (enum válido obligatorio al finalizar)

## 14. Fases de implementación

1. **Fundación**: monorepo, tsconfig estricto, lint, `packages/config`, `packages/shared` (tipos, Zod, teléfono, horario, máquina de estados, elegibilidad).
2. **Persistencia**: `packages/db` (Prisma schema, migraciones, seed demo).
3. **Adaptadores**: interfaces + implementación `simulation` (para dev/tests) + implementación real (Twilio/OpenAI/GHL/mensajería).
4. **API core**: auth multi-org, CRUD campañas/prospectos/DNC/números/agentes de voz, importación CSV, elegibilidad antes de encolar, auditoría, rate limiting, seguridad HTTP.
5. **Worker**: colas BullMQ (scheduling, retries, maintenance), integración con elegibilidad y máquina de estados.
6. **Webhooks + Realtime bridge**: validación de firma Twilio, WS Twilio Media Streams <-> OpenAI Realtime, ejecución de tools con guardrails.
7. **Panel web**: Next.js — campañas, prospectos, llamadas (con detalle y timeline), configuraciones, integraciones, números, agentes de voz, DNC, analítica.
8. **Pruebas**: Vitest unitarias + integración sobre todo lo del punto 13.
9. **Docker + scripts + README**: docker-compose, Dockerfiles, scripts npm, documentación completa.
10. **Verificación final**: install, migrate, lint, typecheck, test, build; revisión de seguridad/arquitectura; resumen final.

Cada fase se implementa sin esperar confirmación salvo bloqueo real (p. ej.
falta de acceso de red a un registro necesario).
