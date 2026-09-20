/**
 * Ollama's own API, for what the OpenAI-compatible one leaves out: what is on
 * disk, downloading a model, and deleting one.
 *
 * A workspace stores Ollama's address in its OpenAI-compatible form
 * (`http://host:11434/v1`), because that is what answers chats. The native
 * API lives at the same origin under `/api`, so everything here starts from
 * that stored address and is called by the server, from where the server
 * stands. The desktop app has its own copy of the download loop in its main
 * process, where there is no server to ask.
 */
import { OPEN_MODELS } from "./open-models";

export type OllamaModel = { name: string; sizeBytes: number };

export type OllamaPullProgress = {
  status: string;
  completedBytes: number;
  totalBytes: number;
};

/** The origin serving `/api`, from a stored base URL. Null when it is not one. */
export function ollamaOrigin(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Whether a tag is one Onirix offers. Downloads go through the server, so it
 * only ever fetches what the catalog lists, never a name a caller made up.
 */
export function isDownloadableModel(model: string): boolean {
  return OPEN_MODELS.some((entry) => entry.id === model);
}

/** What is on disk. Null when Ollama does not answer. */
export async function listOllamaModels(origin: string): Promise<OllamaModel[] | null> {
  try {
    const response = await fetch(`${origin}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { models?: { name?: unknown; size?: unknown }[] };
    if (!Array.isArray(body.models)) return null;
    return body.models
      .filter((model): model is { name: string; size?: unknown } => typeof model.name === "string")
      .map((model) => ({
        // Ollama lists `qwen2.5:latest`; the catalog calls it `qwen2.5`.
        name: model.name.replace(/:latest$/, ""),
        sizeBytes: typeof model.size === "number" ? model.size : 0,
      }));
  } catch {
    return null;
  }
}

/**
 * Pulls one model, yielding bytes across all of its layers.
 *
 * Ollama streams one JSON line per event, and a model is several blobs, each
 * with its own total. Summing per digest gives a bar that moves forward once,
 * rather than one that fills and resets for every layer. Aborting `signal`
 * stops the download; Ollama keeps the partial layers and resumes next time.
 */
export async function* pullOllamaModel(
  origin: string,
  model: string,
  signal: AbortSignal,
): AsyncGenerator<OllamaPullProgress> {
  const response = await fetch(`${origin}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, stream: true }),
    signal,
  }).catch((failure: unknown) => {
    if (signal.aborted) throw failure;
    // Node says only "fetch failed", which tells an admin nothing.
    throw new Error(`Onirix could not reach Ollama at ${origin}.`);
  });
  if (!response.ok || !response.body) {
    throw new Error(`Ollama refused the download (HTTP ${response.status}).`);
  }

  const layers = new Map<string, { total: number; completed: number }>();
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as {
        status?: string;
        error?: string;
        digest?: string;
        total?: number;
        completed?: number;
      };
      if (event.error) throw new Error(event.error);
      if (event.digest && event.total) {
        layers.set(event.digest, { total: event.total, completed: event.completed ?? 0 });
      }

      let totalBytes = 0;
      let completedBytes = 0;
      for (const layer of layers.values()) {
        totalBytes += layer.total;
        completedBytes += layer.completed;
      }
      yield { status: event.status ?? "", completedBytes, totalBytes };
    }
  }
}

/** Deletes a model from disk. One that is already gone is not an error. */
export async function deleteOllamaModel(origin: string, model: string): Promise<void> {
  const response = await fetch(`${origin}/api/delete`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Ollama could not remove ${model} (HTTP ${response.status}).`);
  }
}
