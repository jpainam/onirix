/**
 * One HTTP fetch as the crawler makes it: bounded in time and size, checked
 * at every redirect, decoded by the charset the server declared.
 */
import { gunzipSync } from "node:zlib";

import { ConnectorError } from "../types";
import { assertAllowedUrl, type NetworkPolicy } from "./ssrf";

/** What the crawler sends. Names itself, like every well-behaved crawler. */
export const USER_AGENT = "Mozilla/5.0 (compatible; OnirixBot/1.0; +https://onirix.app)";

const MAX_REDIRECTS = 5;

export type FetchOptions = NetworkPolicy & {
  timeoutMs?: number;
  maxBytes?: number;
  method?: "GET" | "HEAD";
  accept?: string;
  signal?: AbortSignal;
};

export type FetchedResource = {
  /** Where the bytes came from after redirects. */
  url: string;
  status: number;
  /** Lower-cased media type without parameters, like `text/html`. */
  contentType: string;
  charset: string | null;
  body: Buffer;
};

export async function fetchResource(initial: string, options: FetchOptions): Promise<FetchedResource> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBytes = options.maxBytes ?? 20 * 1024 * 1024;

  let current = await assertAllowedUrl(initial, options);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);

    let response: Response;
    try {
      response = await fetch(current, {
        method: options.method ?? "GET",
        redirect: "manual",
        signal,
        headers: {
          "user-agent": USER_AGENT,
          accept:
            options.accept ??
            "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.5",
          "accept-language": "en, *;q=0.5",
        },
      });
    } catch (error) {
      if (options.signal?.aborted) throw new Error("Sync cancelled.");
      const reason = error instanceof Error ? error.message : String(error);
      throw new ConnectorError(
        "unreachable",
        /abort|timeout/i.test(reason)
          ? `${current.host} did not respond within ${Math.round(timeoutMs / 1000)} seconds.`
          : `${current.host} could not be reached: ${reason}`,
      );
    }

    if (isRedirect(response.status)) {
      const location = response.headers.get("location");
      // Drain so the socket is released before the next hop.
      await response.body?.cancel().catch(() => undefined);
      if (!location) break;
      const next = new URL(location, current);
      current = await assertAllowedUrl(next.toString(), options);
      continue;
    }

    const { mediaType, charset } = parseContentType(response.headers.get("content-type"));
    let body = await readBounded(response, maxBytes, current.host);

    // Some servers gzip a `.xml.gz` sitemap without saying so in the headers.
    if (mediaType === "application/gzip" || mediaType === "application/x-gzip" || isGzip(body)) {
      try {
        body = gunzipSync(body);
      } catch {
        // Not gzip after all; keep the bytes as they were.
      }
    }

    return { url: current.toString(), status: response.status, contentType: mediaType, charset, body };
  }

  throw new ConnectorError("unreachable", `${initial} redirected too many times.`);
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readBounded(response: Response, maxBytes: number, host: string): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new ConnectorError("config", `A response from ${host} is larger than ${formatBytes(maxBytes)}.`);
  }
  if (!response.body) return Buffer.alloc(0);

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ConnectorError("config", `A response from ${host} is larger than ${formatBytes(maxBytes)}.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function parseContentType(header: string | null): { mediaType: string; charset: string | null } {
  if (!header) return { mediaType: "application/octet-stream", charset: null };
  const [type = "", ...params] = header.split(";");
  const charset = params
    .map((param) => param.trim().toLowerCase())
    .find((param) => param.startsWith("charset="))
    ?.slice("charset=".length)
    .replace(/^"|"$/g, "");
  return { mediaType: type.trim().toLowerCase(), charset: charset ?? null };
}

function isGzip(body: Buffer): boolean {
  return body.length > 2 && body[0] === 0x1f && body[1] === 0x8b;
}

/** Decodes a text body by its declared charset, falling back to UTF-8. */
export function decodeText(body: Buffer, charset: string | null): string {
  if (charset) {
    try {
      return new TextDecoder(charset).decode(body);
    } catch {
      // Unknown label; fall through.
    }
  }
  // A `<meta charset>` in the first kilobyte beats guessing.
  const head = body.subarray(0, 2048).toString("latin1");
  const declared = head.match(/charset=["']?([\w-]+)/i)?.[1];
  if (declared && declared.toLowerCase() !== "utf-8") {
    try {
      return new TextDecoder(declared).decode(body);
    } catch {
      // Fall through.
    }
  }
  return body.toString("utf8");
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
