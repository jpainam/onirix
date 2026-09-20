export type UploadResult = {
  accepted: { id: string; title: string }[];
  rejected: { name: string; reason: string }[];
};

/** A folder can hold hundreds of files; one request should not carry them all. */
const FILES_PER_REQUEST = 10;

/**
 * Posts files to `/api/upload`, a few at a time.
 *
 * `onBatch` hears about each request as it lands, so a caller can show the
 * first documents while the rest are still on their way. A request that fails
 * outright throws, with whatever was accepted before it already reported.
 */
export async function uploadFiles(
  files: File[],
  onBatch?: (result: UploadResult) => void | Promise<void>,
): Promise<UploadResult> {
  const total: UploadResult = { accepted: [], rejected: [] };

  for (let start = 0; start < files.length; start += FILES_PER_REQUEST) {
    const formData = new FormData();
    for (const file of files.slice(start, start + FILES_PER_REQUEST)) {
      formData.append("files", file);
    }

    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Upload failed.");

    const batch: UploadResult = {
      accepted: result.accepted ?? [],
      rejected: result.rejected ?? [],
    };
    total.accepted.push(...batch.accepted);
    total.rejected.push(...batch.rejected);
    await onBatch?.(batch);
  }

  return total;
}
