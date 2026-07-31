-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'elevenlabs';

-- AlterTable
ALTER TABLE "voice_agents" ADD COLUMN     "elevenLabsVoiceId" TEXT,
ADD COLUMN     "ttsProvider" TEXT NOT NULL DEFAULT 'openai';
