import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

/**
 * Carga variables de entorno desde un archivo `.env` en la raíz del
 * monorepo (o la ruta indicada) hacia `process.env`, sin sobreescribir
 * variables ya definidas (por ejemplo, las inyectadas por Docker o por el
 * proceso de CI). No falla si el archivo no existe — en producción se
 * espera que las variables lleguen ya inyectadas por la plataforma.
 */
export function loadRootDotEnv(rootDir: string = path.resolve(process.cwd(), "../..")): void {
  const envPath = path.join(rootDir, ".env");
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath });
  }
}
