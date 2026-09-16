/**
 * Secrets at rest.
 *
 * Two kinds of credential live in the database because workspaces bring their
 * own: the API key of each connected model provider, and the connection string
 * of each connected database. A copy of the database, a backup left somewhere,
 * or a read through a badly scoped query would otherwise hand over every
 * customer's keys at once. Sealing them under a key the database never sees
 * turns that into a leak of ciphertext.
 *
 * AES-256-GCM with a random nonce per value. The stored form is self-describing
 * — `enc:v1:<nonce>.<tag>.<ciphertext>` — so a reader can tell a sealed value
 * from a legacy plaintext one and pass the latter through unchanged. That is
 * what lets encryption arrive without a flag day: rows are read as they are and
 * rewritten sealed by `db:encrypt-secrets`, and every writer seals from now on.
 *
 * The key is one environment variable, held by the web and worker processes
 * and by nothing else. Losing it loses every stored credential, which is the
 * intended trade: an admin retypes a key, an attacker with the database does
 * not get one.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const PREFIX = "enc:v1:";

export type SecretBox = {
  /** Encrypts a value for storage. Sealing a sealed value seals it again, so callers seal once. */
  seal(plaintext: string): string;
  /**
   * Recovers the value. A string without the prefix is returned as it is:
   * either it predates encryption, or it is not a secret at all.
   */
  open(stored: string): string;
  isSealed(value: string): boolean;
};

/**
 * Builds the box from the environment's key.
 *
 * Accepts the 32 bytes as base64 (what `openssl rand -base64 32` prints) or
 * as 64 hex characters. Anything else is refused at startup rather than
 * discovered on the first write, because a wrong key is a wrong key for every
 * credential at once.
 */
export function createSecretBox(keyMaterial: string): SecretBox {
  const key = parseKey(keyMaterial);

  return {
    seal(plaintext) {
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, nonce);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${PREFIX}${nonce.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
    },

    open(stored) {
      if (!stored.startsWith(PREFIX)) return stored;
      const [nonce, tag, ciphertext, ...rest] = stored.slice(PREFIX.length).split(".");
      if (!nonce || !tag || !ciphertext || rest.length > 0) {
        throw new Error("Stored secret is malformed.");
      }
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(nonce, "base64"));
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      try {
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, "base64")),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        // GCM fails closed: a wrong key or a tampered value both land here, and
        // neither deserves a message that distinguishes them.
        throw new Error(
          "Stored secret could not be decrypted. SECRETS_ENCRYPTION_KEY has changed, or the value was altered.",
        );
      }
    },

    isSealed(value) {
      return value.startsWith(PREFIX);
    },
  };
}

function parseKey(material: string): Buffer {
  const trimmed = material.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, "hex");
  const decoded = Buffer.from(trimmed, "base64");
  if (decoded.length === KEY_BYTES) return decoded;
  throw new Error(
    "SECRETS_ENCRYPTION_KEY must be 32 bytes, as base64 or 64 hex characters. Generate one with: openssl rand -base64 32",
  );
}

/** Opens a nullable column. */
export function openNullable(box: SecretBox, stored: string | null | undefined): string | null {
  return stored === null || stored === undefined ? null : box.open(stored);
}

/** Seals a nullable value; empty strings are stored as absent. */
export function sealNullable(box: SecretBox, plaintext: string | null | undefined): string | null {
  return plaintext ? box.seal(plaintext) : null;
}
