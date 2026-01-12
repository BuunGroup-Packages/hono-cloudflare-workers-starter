/**
 * Password Hashing Utilities
 *
 * Uses PBKDF2 with SHA-256 for secure password hashing.
 * Compatible with Cloudflare Workers Web Crypto API.
 */

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const HASH_LENGTH = 256;

/**
 * Hash a password using PBKDF2 with SHA-256
 *
 * @param password - Plain text password to hash
 * @returns Base64-encoded salt + hash combination
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    HASH_LENGTH
  );

  // Combine salt and hash for storage
  const combined = new Uint8Array(salt.length + new Uint8Array(hash).length);
  combined.set(salt);
  combined.set(new Uint8Array(hash), salt.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Verify a password against a stored hash
 *
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param password - Plain text password to verify
 * @param storedHash - Base64-encoded salt + hash from database
 * @returns true if password matches, false otherwise
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    const combined = Uint8Array.from(atob(storedHash), (c) => c.charCodeAt(0));
    const salt = combined.slice(0, SALT_LENGTH);
    const originalHash = combined.slice(SALT_LENGTH);

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const hash = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      HASH_LENGTH
    );

    const newHash = new Uint8Array(hash);

    // Constant-time comparison to prevent timing attacks
    if (newHash.length !== originalHash.length) return false;

    let result = 0;
    for (let i = 0; i < newHash.length; i++) {
      result |= newHash[i] ^ originalHash[i];
    }

    return result === 0;
  } catch {
    return false;
  }
}
