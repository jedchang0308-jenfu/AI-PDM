import crypto from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Hash a plaintext password using scrypt with a random salt.
 * Output format: `scrypt:<salt_hex>:<derived_hex>`
 */
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derived = crypto.scryptSync(plain, salt, SCRYPT_KEY_LENGTH);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Verify a plaintext password against a stored hash string.
 * Supports the `scrypt:<salt_hex>:<derived_hex>` format.
 */
export function verifyPassword(plain: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[1], "hex");
  const storedDerived = Buffer.from(parts[2], "hex");
  const derived = crypto.scryptSync(plain, salt, SCRYPT_KEY_LENGTH);

  return crypto.timingSafeEqual(derived, storedDerived);
}
