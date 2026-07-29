import { z } from "zod";
import { loadEnv, loadRootDotEnv } from "@lynkro-outbound/config";

loadRootDotEnv();

const domainEnvSchema = z.object({
  ENCRYPTION_KEY: z.string().min(32, "ENCRYPTION_KEY debe tener al menos 32 caracteres"),
});

export const domainEnv = loadEnv(domainEnvSchema);
