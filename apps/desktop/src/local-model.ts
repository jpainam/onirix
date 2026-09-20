/**
 * The model local mode answers with: one on this computer, or one reached
 * with the person's own API key.
 *
 * A key is the one secret the shell holds, so it is treated as one. It is
 * encrypted with Electron's `safeStorage` (the macOS Keychain, Windows DPAPI,
 * or the desktop keyring on Linux) before it touches the disk, it is decrypted
 * only in this process at the moment a request is made, and it is never sent
 * back to the renderer. If the computer offers no real secret storage the key
 * is refused rather than written in the clear.
 */
import { safeStorage } from "electron";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { PROVIDERS } from "@onirix/llm/catalog";
import type { ProviderCredentials } from "@onirix/llm/factory";

import { writeJsonAtomic } from "./atomic-write";
import { API_PROVIDER_IDS, type ApiProviderId, type ModelChoice } from "./local-bridge";
import { localDir } from "./local-store";

/** Where the shell's own Ollama answers. `runtime.ts` always binds this port. */
const OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";

/** The same shape `runtime.ts` accepts for a pull. */
const MODEL_TAG = /^[a-z0-9][a-z0-9._/-]{0,127}(:[a-z0-9][a-z0-9._-]{0,63})?$/i;

type Stored =
  | { kind: "local"; model: string }
  | { kind: "api"; provider: ApiProviderId; model: string; encryptedKey: string };

function file(): string {
  return join(localDir(), "model.json");
}

let cache: Stored | null | undefined;

function read(): Stored | null {
  if (cache !== undefined) return cache;
  cache = null;
  try {
    const stored = JSON.parse(readFileSync(file(), "utf8")) as Record<string, unknown>;
    if (stored.kind === "local" && typeof stored.model === "string" && MODEL_TAG.test(stored.model)) {
      cache = { kind: "local", model: stored.model };
    } else if (
      stored.kind === "api" &&
      isApiProvider(stored.provider) &&
      typeof stored.model === "string" &&
      isCatalogModel(stored.provider, stored.model) &&
      typeof stored.encryptedKey === "string"
    ) {
      cache = {
        kind: "api",
        provider: stored.provider,
        model: stored.model,
        encryptedKey: stored.encryptedKey,
      };
    }
  } catch {
    // No file yet, or one that is not ours any more. Both mean "not set up".
  }
  return cache;
}

function write(next: Stored): void {
  mkdirSync(localDir(), { recursive: true });
  writeJsonAtomic(file(), next);
  cache = next;
}

export function isApiProvider(value: unknown): value is ApiProviderId {
  return typeof value === "string" && (API_PROVIDER_IDS as readonly string[]).includes(value);
}

/** Only models the catalog lists: the id goes straight into a provider request. */
export function isCatalogModel(provider: ApiProviderId, model: string): boolean {
  return PROVIDERS[provider].chatModels.some((candidate) => candidate.id === model);
}

function publicChoice(stored: Stored | null): ModelChoice | null {
  if (!stored) return null;
  return stored.kind === "local"
    ? { kind: "local", model: stored.model }
    : { kind: "api", provider: stored.provider, model: stored.model, hasKey: true };
}

/** The choice as the renderer may see it. */
export function currentChoice(): ModelChoice | null {
  return publicChoice(read());
}

/**
 * Refuses to store a key the OS cannot protect.
 *
 * On Linux without a keyring, Chromium falls back to a hard-coded password
 * (`basic_text`), which is obfuscation rather than encryption. Saying no is
 * more honest than a file that only looks encrypted.
 */
function assertSecretStorage(): void {
  const weak =
    process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text";
  if (!safeStorage.isEncryptionAvailable() || weak) {
    throw new Error(
      "This computer has no secure place to keep an API key (no system keyring was found). Use a local model, or set up a keyring and try again.",
    );
  }
}

export function useLocal(model: string): ModelChoice {
  if (!MODEL_TAG.test(model)) throw new Error("That is not a model name.");
  write({ kind: "local", model });
  return { kind: "local", model };
}

/** Called only after the key has answered a request (see `local-chat.ts`). */
export function saveApiKey(provider: ApiProviderId, model: string, apiKey: string): ModelChoice {
  assertSecretStorage();
  write({
    kind: "api",
    provider,
    model,
    encryptedKey: safeStorage.encryptString(apiKey).toString("base64"),
  });
  return { kind: "api", provider, model, hasKey: true };
}

export function changeApiModel(model: string): ModelChoice {
  const stored = read();
  if (!stored || stored.kind !== "api") throw new Error("No API key is set up.");
  if (!isCatalogModel(stored.provider, model)) throw new Error("Unknown model.");
  write({ ...stored, model });
  return { kind: "api", provider: stored.provider, model, hasKey: true };
}

export function clear(): void {
  rmSync(file(), { force: true });
  cache = null;
}

/**
 * What a request needs, with the key in the clear. Stays in this process.
 *
 * Returns null when nothing is set up. Throws when a key is stored but cannot
 * be read back, which happens when the file was copied from another computer
 * or the OS keychain entry was removed.
 */
export function credentials(): { credentials: ProviderCredentials; model: string } | null {
  const stored = read();
  if (!stored) return null;
  if (stored.kind === "local") {
    return {
      credentials: { provider: "ollama", apiKey: null, baseUrl: OLLAMA_BASE_URL },
      model: stored.model,
    };
  }
  let apiKey: string;
  try {
    apiKey = safeStorage.decryptString(Buffer.from(stored.encryptedKey, "base64"));
  } catch {
    throw new Error(
      `The saved ${PROVIDERS[stored.provider].label} key could not be read on this computer. Enter it again in Settings.`,
    );
  }
  return {
    credentials: { provider: stored.provider, apiKey, baseUrl: null },
    model: stored.model,
  };
}
