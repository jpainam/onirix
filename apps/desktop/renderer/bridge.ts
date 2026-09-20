/**
 * The renderer's one way out: `window.onirixLocal`, published by the preload.
 *
 * Everything that touches the disk, a model, or the network goes through it,
 * because this page can do none of those itself.
 */
import { type AddDocumentsResult, LIMITS, type LocalBridge } from "../src/local-bridge";

export function getBridge(): LocalBridge {
  const bridge = window.onirixLocal;
  // Only missing when the page is opened outside the shell, which nothing
  // ships a way to do. Better a sentence than a TypeError three calls later.
  if (!bridge) throw new Error("This page only runs inside the Onirix desktop app.");
  return bridge;
}

/** Electron prefixes a rejected call with the channel it failed on. */
export function errorMessage(failure: unknown): string {
  const text = failure instanceof Error ? failure.message : String(failure);
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

/**
 * Adds files to the library, as many calls as the per-call limit makes it.
 *
 * A folder can hold more than one call takes. `onBatch` hears about each call
 * as it returns, so the first documents can be shown while the rest are read.
 */
export async function addDocuments(
  files: File[],
  onBatch?: (result: AddDocumentsResult) => void | Promise<void>,
): Promise<AddDocumentsResult> {
  const total: AddDocumentsResult = { documents: [], refused: [] };
  for (let start = 0; start < files.length; start += LIMITS.documentsPerCall) {
    const result = await getBridge().documents.add(
      files.slice(start, start + LIMITS.documentsPerCall),
    );
    total.documents.push(...result.documents);
    total.refused.push(...result.refused);
    await onBatch?.(result);
  }
  return total;
}
