import { createHash } from "node:crypto";

import { isSupportedMimeType, mimeTypeForFileName } from "@onirix/ingestion";

/** Same ceiling as an upload: past it, a file belongs in a summary, not an index. */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * The MIME type to index a file under, or null to skip it.
 *
 * The name decides first: a drive's idea of a `.md` file's type is often
 * `application/octet-stream`, and a bucket has no idea at all. The reported
 * type is a fallback for names without a useful extension.
 */
export function indexableMimeType(fileName: string, reported?: string | null): string | null {
  const byName = mimeTypeForFileName(fileName);
  if (byName) return byName;
  if (reported && isSupportedMimeType(reported)) return reported;
  if (reported?.startsWith("text/")) return reported;
  return null;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Sync cancelled.");
}

/** The last path segment of a URL or key, for a title when nothing better exists. */
export function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const last = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(last) || trimmed;
  } catch {
    return last || trimmed;
  }
}
