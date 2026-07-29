import { baseEnvSchema, loadEnv, loadRootDotEnv } from "@lynkro-outbound/config";

loadRootDotEnv();

export const env = loadEnv(baseEnvSchema);
