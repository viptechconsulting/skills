-- VIP Tech Local Opportunity Analyzer — esquema PostgreSQL (idempotente)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin','supervisor','ejecutivo')),
  supervisor_id uuid REFERENCES users(id) ON DELETE SET NULL,  -- equipo asignado (para ejecutivos)
  password_hash text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  monthly_cost_limit_usd numeric(10,2),                         -- límite por usuario/período (NULL = sin límite propio)
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES users(id),             -- ejecutivo responsable
  company       text NOT NULL,
  website       text,
  gbp_url       text,
  city          text,
  state         text,
  address       text,
  service_area  text,
  category      text,
  services      text[] NOT NULL DEFAULT '{}',
  contact_name  text,
  contact_email text,
  contact_phone text,
  notes         text,
  pipeline_status text NOT NULL DEFAULT 'Nuevo'
    CHECK (pipeline_status IN ('Nuevo','Calificado','No calificado','Diagnóstico realizado','Contactado','Reunión agendada','Propuesta enviada','Ganado','Perdido')),
  next_action   text,
  next_action_at date,
  eligibility_status text NOT NULL DEFAULT 'pendiente'
    CHECK (eligibility_status IN ('pendiente','calificado','no_calificado','revision_manual')),
  eligibility_reason text,
  eligibility_evidence jsonb,
  eligibility_checked_at timestamptz,
  logo_mime     text,
  logo_data     bytea,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prospects_owner_idx ON prospects(owner_id);

CREATE TABLE IF NOT EXISTS prospect_history (
  id          bigserial PRIMARY KEY,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id),
  kind        text NOT NULL,            -- status_change | note | reassign | eligibility | audit | report | edit
  detail      text NOT NULL,
  from_value  text,
  to_value    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS history_prospect_idx ON prospect_history(prospect_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES users(id),
  status      text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','en_proceso','parcial','completado','fallido')),
  config      jsonb NOT NULL DEFAULT '{}',
  progress    text,
  summary     jsonb,                    -- métricas agregadas, scores, proyección
  error       text,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audits_prospect_idx ON audits(prospect_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_pages (
  id        bigserial PRIMARY KEY,
  audit_id  uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  url       text NOT NULL,
  status    int,
  final_url text,
  depth     int,
  data      jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS audit_pages_audit_idx ON audit_pages(audit_id);

CREATE TABLE IF NOT EXISTS findings (
  id          bigserial PRIMARY KEY,
  audit_id    uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  area        text NOT NULL,            -- website | gbp | keywords | competencia
  pillar      text,                     -- L | E | D
  code        text NOT NULL,
  title       text NOT NULL,
  explanation text NOT NULL,
  url         text,
  evidence    jsonb NOT NULL DEFAULT '{}',
  severity    text NOT NULL CHECK (severity IN ('critica','alta','media','baja','info')),
  impact      int  NOT NULL CHECK (impact BETWEEN 1 AND 5),
  effort      int  NOT NULL CHECK (effort BETWEEN 1 AND 5),
  relevance   int  NOT NULL DEFAULT 3 CHECK (relevance BETWEEN 1 AND 5),
  confidence  numeric(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  action      text NOT NULL,
  benefit     text,
  source      text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  score       numeric(5,1),
  category    text CHECK (category IN ('quick_win','prioridad_alta','crecimiento_estrategico','informativo')),
  score_detail jsonb
);
CREATE INDEX IF NOT EXISTS findings_audit_idx ON findings(audit_id);

CREATE TABLE IF NOT EXISTS gbp_snapshots (
  id          bigserial PRIMARY KEY,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  audit_id    uuid REFERENCES audits(id) ON DELETE SET NULL,
  source      text NOT NULL,            -- google_places | manual
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  data        jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS competitors (
  id          bigserial PRIMARY KEY,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  website     text,
  gbp_url     text,
  place_id    text,
  rating      numeric(2,1),
  reviews     int,
  primary_category text,
  source      text NOT NULL,            -- google_places | manual
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  data        jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS keywords (
  id          bigserial PRIMARY KEY,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  keyword     text NOT NULL,
  intent      text,
  volume      int,                      -- NULL = sin dato (no es 0)
  difficulty  int,
  position    int,                      -- NULL = sin dato; nunca interpretar como "no rankea"
  position_kind text CHECK (position_kind IN ('observada','estimada')),
  url         text,
  location    text,
  priority    text,
  source      text NOT NULL,            -- manual | dataforseo | ...
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  audit_id    uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('comercial','tecnico')),
  generated_by uuid REFERENCES users(id),
  include_prospect_logo boolean NOT NULL DEFAULT false,
  pdf         bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS brand_assets (
  key  text PRIMARY KEY,                -- 'logo'
  mime text NOT NULL,
  data bytea NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Costos, caché y consumo por proveedor
CREATE TABLE IF NOT EXISTS provider_cache (
  cache_key  text PRIMARY KEY,          -- provider:operación:hash(params)
  provider   text NOT NULL,
  response   jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_usage (
  id          bigserial PRIMARY KEY,
  provider    text NOT NULL,
  operation   text NOT NULL,
  user_id     uuid REFERENCES users(id),
  prospect_id uuid REFERENCES prospects(id) ON DELETE SET NULL,
  audit_id    uuid REFERENCES audits(id) ON DELETE SET NULL,
  est_cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  cached      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_user_idx ON provider_usage(user_id, created_at);
