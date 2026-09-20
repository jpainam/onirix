/**
 * Reads the text out of one file, in a process of its own.
 *
 * Two reasons it is not done in the main process. Parsing a large PDF is
 * seconds of solid CPU, and the main process is what moves the window, so the
 * whole app would freeze while it ran. And a document is untrusted input to
 * some large parsers: if one of them crashes or runs away on a malformed file,
 * what dies is this process, and the app reports that the file could not be
 * read.
 *
 * The extractors are the server's own (`@onirix/ingestion`), so a file reads
 * the same here as it does in a workspace.
 */
import { readFile } from "node:fs/promises";

import { extractSections } from "@onirix/ingestion/extract";

import { type DocumentChunk, chunkSections } from "./local-retrieval";

export type ExtractRequest = { path: string; mimeType: string; fileName: string };
export type ExtractReply = { ok: true; chunks: DocumentChunk[] } | { ok: false; error: string };

process.parentPort.on("message", (event) => {
  const request = event.data as ExtractRequest;
  void (async () => {
    let reply: ExtractReply;
    try {
      const sections = await extractSections(
        await readFile(request.path),
        request.mimeType,
        request.fileName,
      );
      reply = { ok: true, chunks: chunkSections(sections) };
    } catch (error) {
      reply = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    process.parentPort.postMessage(reply);
  })();
});
