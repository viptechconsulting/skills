process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "test_encryption_key_32_bytes_min";
process.env.LOG_LEVEL = "silent";
// Base de datos propia de este paquete: cada paquete/app usa una base de
// datos de pruebas distinta para poder correr toda la suite del monorepo en
// paralelo sin que un `resetTestDatabase()` de una suite borre las filas que
// otra suite está usando concurrentemente.
process.env.DATABASE_URL =
  process.env.DOMAIN_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/lynkro_outbound_test_domain";
process.env.DIRECT_URL = process.env.DATABASE_URL;
