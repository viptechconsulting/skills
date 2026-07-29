import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(secret: string): Buffer {
  // Deriva una clave de 32 bytes determinística a partir de ENCRYPTION_KEY,
  // sin importar su longitud original, usando SHA-256.
  return createHash("sha256").update(secret).digest();
}

/**
 * Cifra un payload de texto plano (típicamente credenciales de integración
 * serializadas en JSON) con AES-256-GCM. El resultado incluye IV y tag de
 * autenticación, todo codificado en un único string base64 con formato
 * "<iv>.<authTag>.<ciphertext>".
 */
export function encryptSecret(plaintext: string, encryptionKey: string): string {
  const key = deriveKey(encryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(payload: string, encryptionKey: string): string {
  const [ivB64, authTagB64, cipherTextB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !cipherTextB64) {
    throw new Error("Payload cifrado con formato inválido");
  }
  const key = deriveKey(encryptionKey);
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const cipherText = Buffer.from(cipherTextB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return decrypted.toString("utf8");
}
