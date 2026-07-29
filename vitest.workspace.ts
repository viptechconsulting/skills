import { defineWorkspace } from "vitest/config";

// Nota: el script raíz "test" corre con --no-file-parallelism. Las suites de
// integración de packages/db, packages/domain, apps/api y apps/worker usan
// una base de datos Postgres real (una distinta por paquete/app, ver cada
// testSetup.ts/testUtils.ts) en vez de mocks. Sin --no-file-parallelism,
// Vitest puede intercalar archivos de distintos proyectos del workspace de
// forma que un resetTestDatabase() de un archivo borre filas que otro
// archivo está usando en ese mismo instante. El fileParallelism:false de
// cada vitest.config.ts individual no es suficiente por sí solo dentro de un
// workspace — el flag global de la CLI sí lo es.
export default defineWorkspace([
  "packages/shared/vitest.config.ts",
  "packages/db/vitest.config.ts",
  "packages/adapters/vitest.config.ts",
  "packages/domain/vitest.config.ts",
  "apps/api/vitest.config.ts",
  "apps/worker/vitest.config.ts",
]);
