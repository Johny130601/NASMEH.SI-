import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for secrets at rest (TOTP seeds). The key is derived from
 * AUTH_SECRET with HKDF, so no second secret is needed on the host; a tampered
 * or foreign ciphertext decrypts to null, never to garbage.
 */
function deriveKey(masterSecret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterSecret, "nasmeh-admin-secrets", "totp-secret-v1", 32));
}

export function encryptSecret(plain: string, masterSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(masterSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(token: unknown, masterSecret: string): string | null {
  if (typeof token !== "string" || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, ciphertext, tag] = parts.map((part) => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(masterSecret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
