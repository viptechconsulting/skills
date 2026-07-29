process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test_jwt_secret_at_least_32_characters_long";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "test_encryption_key_32_bytes_min";
// Base de datos propia de esta app para poder correr toda la suite del
// monorepo en paralelo sin interferencia entre suites (ver comentario
// equivalente en packages/domain/src/testSetup.ts).
process.env.DATABASE_URL =
  process.env.WORKER_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/lynkro_outbound_test_worker";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.SIMULATION_MODE = "true";
process.env.TWILIO_WEBHOOK_BASE_URL = "http://localhost:4000";
