/**
 * The local document library: files the person has given Onirix to read.
 *
 * Each document is a folder under the app's data directory holding a copy of
 * the file, what is known about it (`meta.json`), and its text cut into
 * passages (`chunks.json`). A copy, because the original may move or be
 * deleted and an answer citing it should still be checkable; and nowhere else,
 * because keeping documents on this computer is the point of local mode.
 *
 * A document is added once and attached to any number of sessions. Which
 * sessions read it is the chat's business (`documentIds` in local-store.ts);
 * this module only knows the library, and how to search a given set of it.
 */
import { app, utilityProcess } from "electron";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, join, sep } from "node:path";

import { mimeTypeForFileName } from "@onirix/ingestion/extract";

import { writeJsonAtomic } from "./atomic-write";
import type { ExtractReply, ExtractRequest } from "./extract-worker";
import { LIMITS, type LibraryDocument, type MessageSource } from "./local-bridge";
import { type DocumentChunk, type SearchableChunk, search, tokenize } from "./local-retrieval";
import { localDir } from "./local-store";

const DOCUMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A scanned PDF with no text layer can spin for a long time and produce nothing. */
const EXTRACT_TIMEOUT_MS = 120_000;

const READABLE = "PDF, Word (.docx), Excel, CSV, Markdown, HTML, JSON and plain text";

function libraryDir(): string {
  return join(localDir(), "documents");
}

function documentDir(id: string): string {
  return join(libraryDir(), id);
}

export function assertDocumentId(id: unknown): string {
  if (typeof id !== "string" || !DOCUMENT_ID.test(id)) throw new Error("Unknown document.");
  return id;
}

function readMeta(id: string): LibraryDocument | null {
  try {
    const meta = JSON.parse(readFileSync(join(documentDir(id), "meta.json"), "utf8")) as Record<
      string,
      unknown
    >;
    if (
      meta.id !== id ||
      typeof meta.title !== "string" ||
      typeof meta.mimeType !== "string" ||
      typeof meta.sizeBytes !== "number" ||
      typeof meta.addedAt !== "string" ||
      (meta.status !== "processing" && meta.status !== "indexed" && meta.status !== "failed")
    ) {
      return null;
    }
    return {
      id,
      title: meta.title,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      addedAt: meta.addedAt,
      status: meta.status,
      chunkCount: typeof meta.chunkCount === "number" ? meta.chunkCount : 0,
      error: typeof meta.error === "string" ? meta.error : null,
    };
  } catch {
    return null;
  }
}

function writeMeta(meta: LibraryDocument): void {
  writeJsonAtomic(join(documentDir(meta.id), "meta.json"), meta);
}

let recovered = false;

/**
 * A document still marked `processing` when the app starts was being read when
 * the app last stopped. Nothing is reading it now, so it is marked failed
 * rather than left spinning for ever.
 */
function recover(documents: LibraryDocument[]): LibraryDocument[] {
  if (recovered) return documents;
  recovered = true;
  return documents.map((meta) => {
    if (meta.status !== "processing") return meta;
    const failed: LibraryDocument = {
      ...meta,
      status: "failed",
      error: "Onirix closed while this file was being read. Add it again.",
    };
    writeMeta(failed);
    return failed;
  });
}

/** The library is the folders on disk: there is no index to fall out of step. */
export function listDocuments(): LibraryDocument[] {
  let names: string[];
  try {
    names = readdirSync(libraryDir());
  } catch {
    return [];
  }
  const found = names
    .filter((name) => DOCUMENT_ID.test(name))
    .map((id) => readMeta(id))
    .filter((meta): meta is LibraryDocument => meta !== null);
  return recover(found).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

function extract(request: ExtractRequest): Promise<DocumentChunk[]> {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(join(__dirname, "extract-worker.cjs"), [], {
      serviceName: "Onirix document reader",
    });
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      outcome();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error("Reading this file took too long."))),
      EXTRACT_TIMEOUT_MS,
    );

    child.once("spawn", () => child.postMessage(request));
    child.on("message", (reply: ExtractReply) =>
      finish(() => (reply.ok ? resolve(reply.chunks) : reject(new Error(reply.error)))),
    );
    child.once("exit", () =>
      finish(() => reject(new Error("This file could not be read. It may be damaged."))),
    );
  });
}

/**
 * Checks a path the way any input is checked, even though the preload only
 * ever sends paths Electron resolved from a real drop or file picker.
 */
async function inspect(path: unknown): Promise<{ path: string; mimeType: string; size: number }> {
  if (typeof path !== "string" || path.length === 0 || path.length > 4096 || !isAbsolute(path)) {
    throw new Error("That file could not be found.");
  }
  let resolved: string;
  let size: number;
  try {
    // Through any symlink, so the checks below are about the real file.
    resolved = await realpath(path);
    const stats = statSync(resolved);
    if (!stats.isFile()) throw new Error("Not a file.");
    size = stats.size;
  } catch {
    throw new Error(`${basename(String(path))} could not be opened. Folders cannot be added.`);
  }
  // The app's own data (settings, the saved key, other chats) is not a
  // document, whatever its extension says.
  if (resolved.startsWith(app.getPath("userData") + sep)) {
    throw new Error("Files inside the Onirix data folder cannot be added.");
  }
  const mimeType = mimeTypeForFileName(resolved);
  if (!mimeType) {
    throw new Error(
      `Onirix cannot read ${extname(resolved) || "this kind of"} files yet. It reads ${READABLE}.`,
    );
  }
  if (size > LIMITS.documentBytes) {
    throw new Error(`${basename(resolved)} is larger than 50 MB, which is the most Onirix reads.`);
  }
  if (size === 0) throw new Error(`${basename(resolved)} is empty.`);
  return { path: resolved, mimeType, size };
}

/**
 * Copies one file into the library and reads it. Resolves with the document
 * either way: a file that could not be read is kept as `failed`, with the
 * reason, so the person sees what happened to it rather than nothing.
 * Rejects only for a file that should never have been accepted.
 */
export async function addDocument(path: unknown): Promise<LibraryDocument> {
  const source = await inspect(path);
  const id = randomUUID();
  const fileName = basename(source.path);
  const copy = join(documentDir(id), `original${extname(fileName).toLowerCase()}`);

  mkdirSync(documentDir(id), { recursive: true });
  copyFileSync(source.path, copy);

  const meta: LibraryDocument = {
    id,
    title: fileName,
    mimeType: source.mimeType,
    sizeBytes: source.size,
    addedAt: new Date().toISOString(),
    status: "processing",
    chunkCount: 0,
    error: null,
  };
  writeMeta(meta);

  try {
    const chunks = await extract({ path: copy, mimeType: source.mimeType, fileName });
    if (chunks.length === 0) {
      throw new Error(
        "No text was found in this file. A scanned document needs text recognition first.",
      );
    }
    writeJsonAtomic(join(documentDir(id), "chunks.json"), chunks);
    const indexed: LibraryDocument = { ...meta, status: "indexed", chunkCount: chunks.length };
    writeMeta(indexed);
    return indexed;
  } catch (error) {
    const failed: LibraryDocument = {
      ...meta,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
    writeMeta(failed);
    return failed;
  }
}

/**
 * The library's copy of a document, for showing it whole beside an answer.
 * Null when there is none: the document was deleted, or its id is not one.
 */
export function originalFile(id: string): { path: string; title: string; mimeType: string } | null {
  if (!DOCUMENT_ID.test(id)) return null;
  const meta = readMeta(id);
  if (!meta) return null;
  // Named as `addDocument` named it.
  const path = join(documentDir(id), `original${extname(meta.title).toLowerCase()}`);
  try {
    if (!statSync(path).isFile()) return null;
  } catch {
    return null;
  }
  return { path, title: meta.title, mimeType: meta.mimeType };
}

export function removeDocument(id: string): void {
  assertDocumentId(id);
  rmSync(documentDir(id), { recursive: true, force: true });
  searchable.delete(id);
}

/**
 * Where the library is and what it weighs, for the person deciding whether to
 * clear it out. Measured from the files rather than summed from metadata: the
 * copy, the passages and the metadata all take room, and only the disk knows.
 */
export function storage(): { path: string; totalBytes: number } {
  let totalBytes = 0;
  const measure = (directory: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      try {
        const stats = statSync(join(directory, entry));
        if (stats.isDirectory()) measure(join(directory, entry));
        else totalBytes += stats.size;
      } catch {
        // Gone between the listing and the look. It weighs nothing now.
      }
    }
  };
  measure(libraryDir());
  return { path: libraryDir(), totalBytes };
}

/** Tokenised once per document per run: tokenising is most of a search's cost. */
const searchable = new Map<string, SearchableChunk[]>();

function chunksOf(id: string): SearchableChunk[] {
  const cached = searchable.get(id);
  if (cached) return cached;
  let loaded: SearchableChunk[] = [];
  try {
    const stored = JSON.parse(readFileSync(join(documentDir(id), "chunks.json"), "utf8")) as unknown;
    if (Array.isArray(stored)) {
      loaded = stored
        .filter(
          (chunk): chunk is DocumentChunk =>
            typeof chunk === "object" &&
            chunk !== null &&
            typeof (chunk as DocumentChunk).text === "string" &&
            typeof (chunk as DocumentChunk).index === "number",
        )
        .map((chunk) => ({
          documentId: id,
          chunk: { index: chunk.index, text: chunk.text, location: chunk.location ?? null },
          tokens: tokenize(chunk.text),
        }));
    }
  } catch {
    // Removed, or never finished reading. It simply has nothing to say.
  }
  searchable.set(id, loaded);
  return loaded;
}

/**
 * The passages an answer gets to read: the best matches for the question from
 * the documents attached to the session, and from nowhere else.
 *
 * When fewer than `limit` passages match, the rest are taken from the start of
 * the documents. "Summarise this" and "what is this about?" share no words
 * with the text they ask about, so a pure keyword search would hand the model
 * nothing at the exact moment someone first tries the feature. The opening of
 * a document is the best general-purpose stand-in for "what it is about".
 */
export function retrieve(documentIds: string[], query: string, limit: number): MessageSource[] {
  const titles = new Map(
    listDocuments()
      .filter((meta) => meta.status === "indexed")
      .map((meta) => [meta.id, meta.title]),
  );
  const ids = documentIds.filter((id) => DOCUMENT_ID.test(id) && titles.has(id));
  if (ids.length === 0) return [];

  const corpus = ids.flatMap((id) => chunksOf(id));
  const picked = search(corpus, query, limit);

  // Round-robin across the documents, so three attached files each get their
  // opening read rather than the first one filling every free place.
  for (let depth = 0; picked.length < limit; depth += 1) {
    let added = false;
    for (const id of ids) {
      const candidate = chunksOf(id)[depth];
      if (!candidate) continue;
      added = true;
      if (picked.length < limit && !picked.includes(candidate)) picked.push(candidate);
    }
    if (!added) break;
  }

  return picked.map((entry, position) => ({
    index: position + 1,
    documentId: entry.documentId,
    title: titles.get(entry.documentId) ?? "Document",
    passage: entry.chunk.text,
    location: entry.chunk.location,
  }));
}
