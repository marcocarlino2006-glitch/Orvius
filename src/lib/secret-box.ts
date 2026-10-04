import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Third-party credentials at rest (a shop's Jobber tokens). AES-256-GCM under
 * ORVIUS_TOKEN_KEY, so a database copy or backup alone cannot act as the shop.
 * Rotating the key means every connected shop reconnects once.
 */

const PREFIX = "sb1:";

function key(): Buffer | null {
  const raw = process.env.ORVIUS_TOKEN_KEY?.trim();
  if (!raw || raw.length < 32) return null;
  return createHash("sha256").update(`orvius-secret-box:${raw}`).digest();
}

export function secretBoxConfigured() {
  return key() !== null;
}

export function sealSecret(plain: string): string {
  const k = key();
  if (!k) throw new Error("ORVIUS_TOKEN_KEY is not set (32+ characters)");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

/** null when the value was sealed under another key or has been tampered with. */
export function openSecret(sealed: string | null | undefined): string | null {
  const k = key();
  if (!k || !sealed?.startsWith(PREFIX)) return null;
  try {
    const buf = Buffer.from(sealed.slice(PREFIX.length), "base64");
    const decipher = createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
