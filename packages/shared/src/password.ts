import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Hashing de contraseñas con scrypt (Node built-in, sin dependencias
 * externas). Formato almacenado: "scrypt:<saltHex>:<hashHex>".
 */
export function hashPassword(plainPassword: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = scryptSync(plainPassword, salt, KEY_LENGTH);
  return `scrypt:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export function verifyPassword(plainPassword: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const [, saltHex, hashHex] = parts;
  if (!saltHex || !hashHex) {
    return false;
  }
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(plainPassword, salt, expected.length);
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}
