-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'admin', 'agent');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('twilio', 'openai', 'gohighlevel');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "RetryReason" AS ENUM ('no_answer', 'busy', 'voicemail', 'technical_failure');

-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('new', 'scheduled', 'queued', 'in_progress', 'completed', 'blocked', 'do_not_call');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('draft', 'scheduled', 'queued', 'eligibility_failed', 'dialing', 'initiated', 'ringing', 'answered', 'human_detected', 'voicemail_detected', 'in_progress', 'transferring', 'completed', 'no_answer', 'busy', 'failed', 'canceled', 'blocked');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('BOOKED', 'QUALIFIED_NOT_BOOKED', 'CALLBACK_REQUESTED', 'TRANSFERRED', 'NOT_INTERESTED', 'DO_NOT_CALL', 'WRONG_NUMBER', 'VOICEMAIL', 'NO_ANSWER', 'BUSY', 'FAILED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('scheduled', 'confirmed', 'rescheduled', 'canceled', 'completed', 'no_show');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezoneDefault" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "simulationMode" BOOLEAN NOT NULL DEFAULT true,
    "consentRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'agent',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_numbers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "e164" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'twilio',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_agents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'es',
    "voice" TEXT NOT NULL DEFAULT 'alloy',
    "systemPromptTemplate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'es',
    "objective" TEXT NOT NULL,
    "allowedWindowStart" TEXT NOT NULL DEFAULT '09:00',
    "allowedWindowEnd" TEXT NOT NULL DEFAULT '19:00',
    "timezoneDefault" TEXT NOT NULL,
    "outboundPhoneNumberId" TEXT NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "attemptIntervalMinutes" INTEGER NOT NULL DEFAULT 240,
    "targetCalendarId" TEXT,
    "voiceAgentId" TEXT NOT NULL,
    "agentInstructions" TEXT NOT NULL,
    "qualificationQuestions" JSONB NOT NULL DEFAULT '[]',
    "bookingConditions" TEXT NOT NULL DEFAULT '',
    "transferConditions" TEXT NOT NULL DEFAULT '',
    "voicemailMessage" TEXT NOT NULL DEFAULT '',
    "postCallBehavior" JSONB NOT NULL DEFAULT '{}',
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "simulationMode" BOOLEAN NOT NULL DEFAULT true,
    "consentRequired" BOOLEAN NOT NULL DEFAULT true,
    "transferToPhoneNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retry_policies" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "reason" "RetryReason" NOT NULL,
    "maxAttempts" INTEGER NOT NULL,
    "intervalMinutes" INTEGER NOT NULL,
    "spreadAcrossDayparts" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "retry_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospects" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "language" TEXT NOT NULL DEFAULT 'es',
    "timezone" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '',
    "intent" TEXT NOT NULL,
    "desiredOutcome" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "consentDate" TIMESTAMP(3),
    "status" "ProspectStatus" NOT NULL DEFAULT 'new',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "finalOutcome" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "do_not_call_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'prospect_request',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "do_not_call_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'draft',
    "attemptNumber" INTEGER NOT NULL,
    "scheduledAtUtc" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "costUsd" DECIMAL(10,4),
    "providerCallSid" TEXT,
    "outcome" "CallOutcome",
    "summary" TEXT,
    "transcript" JSONB,
    "recordingUrl" TEXT,
    "qualificationAnswers" JSONB NOT NULL DEFAULT '{}',
    "objections" JSONB NOT NULL DEFAULT '[]',
    "interestLevel" TEXT,
    "isDecisionMaker" BOOLEAN,
    "nextStep" TEXT,
    "simulation" BOOLEAN NOT NULL DEFAULT true,
    "eligibilityRejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_events" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "causedBy" TEXT NOT NULL DEFAULT 'system',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_tool_executions" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "result" JSONB,
    "authorized" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_tool_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "callId" TEXT,
    "ghlAppointmentId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_email_key" ON "users"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshToken_key" ON "sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "integration_credentials_organizationId_idx" ON "integration_credentials"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "integration_credentials_organizationId_provider_key" ON "integration_credentials"("organizationId", "provider");

-- CreateIndex
CREATE INDEX "phone_numbers_organizationId_idx" ON "phone_numbers"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "phone_numbers_organizationId_e164_key" ON "phone_numbers"("organizationId", "e164");

-- CreateIndex
CREATE INDEX "voice_agents_organizationId_idx" ON "voice_agents"("organizationId");

-- CreateIndex
CREATE INDEX "campaigns_organizationId_idx" ON "campaigns"("organizationId");

-- CreateIndex
CREATE INDEX "campaigns_organizationId_status_idx" ON "campaigns"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "retry_policies_campaignId_reason_key" ON "retry_policies"("campaignId", "reason");

-- CreateIndex
CREATE INDEX "prospects_organizationId_idx" ON "prospects"("organizationId");

-- CreateIndex
CREATE INDEX "prospects_organizationId_status_idx" ON "prospects"("organizationId", "status");

-- CreateIndex
CREATE INDEX "prospects_organizationId_nextAttemptAt_idx" ON "prospects"("organizationId", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "prospects_organizationId_phoneE164_key" ON "prospects"("organizationId", "phoneE164");

-- CreateIndex
CREATE INDEX "do_not_call_entries_organizationId_idx" ON "do_not_call_entries"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "do_not_call_entries_organizationId_phoneE164_key" ON "do_not_call_entries"("organizationId", "phoneE164");

-- CreateIndex
CREATE INDEX "calls_organizationId_idx" ON "calls"("organizationId");

-- CreateIndex
CREATE INDEX "calls_organizationId_status_idx" ON "calls"("organizationId", "status");

-- CreateIndex
CREATE INDEX "calls_prospectId_idx" ON "calls"("prospectId");

-- CreateIndex
CREATE INDEX "calls_providerCallSid_idx" ON "calls"("providerCallSid");

-- CreateIndex
CREATE UNIQUE INDEX "call_events_idempotencyKey_key" ON "call_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "call_events_callId_idx" ON "call_events"("callId");

-- CreateIndex
CREATE INDEX "call_tool_executions_callId_idx" ON "call_tool_executions"("callId");

-- CreateIndex
CREATE INDEX "appointments_organizationId_idx" ON "appointments"("organizationId");

-- CreateIndex
CREATE INDEX "appointments_prospectId_idx" ON "appointments"("prospectId");

-- CreateIndex
CREATE INDEX "appointments_organizationId_startsAt_idx" ON "appointments"("organizationId", "startsAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_entityType_entityId_idx" ON "audit_logs"("organizationId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_agents" ADD CONSTRAINT "voice_agents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_outboundPhoneNumberId_fkey" FOREIGN KEY ("outboundPhoneNumberId") REFERENCES "phone_numbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_voiceAgentId_fkey" FOREIGN KEY ("voiceAgentId") REFERENCES "voice_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retry_policies" ADD CONSTRAINT "retry_policies_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "do_not_call_entries" ADD CONSTRAINT "do_not_call_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_tool_executions" ADD CONSTRAINT "call_tool_executions_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
