import { PrismaClient } from "../generated/client/index.js";

declare global {
  var __lynkroPrisma: PrismaClient | undefined;
}

/**
 * Singleton de PrismaClient. En desarrollo se reutiliza a través de
 * globalThis para evitar agotar conexiones por hot-reload; en producción
 * se crea una única instancia por proceso.
 */
export const prisma: PrismaClient =
  globalThis.__lynkroPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__lynkroPrisma = prisma;
}
