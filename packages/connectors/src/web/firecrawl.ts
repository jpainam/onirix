/**
 * A page as a browser would show it, through Firecrawl.
 *
 * The crawler's own fetch reads what the server sends, which is enough for
 * most documentation, help centres and marketing sites and costs nothing.
 * A site that draws its content with JavaScript comes back empty that way;
 * for those, a source can ask for browser rendering, and this is the fetch
 * behind it. The crawl logic (which links to follow, what counts as the same
 * site, the page limit) stays the crawler's: only the bytes come from here.
 */
import { ConnectorError } from "../types";
import type { FetchedResource } from "./fetch";

const SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";

export async function fetchRendered(
  url: string,
  apiKey: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<FetchedResource> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  let response: Response;
  try {
    response = await fetch(SCRAPE_URL, {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        url,
        // Raw rather than cleaned HTML: the same parser reads it as a
        // server-fetched page, so links and titles come out the same way.
        formats: ["rawHtml"],
        onlyMainContent: false,
        // A page fetched within the last day is served from Firecrawl's
        // cache, which is what makes a nightly re-read affordable.
        maxAge: 24 * 60 * 60 * 1000,
        timeout: Math.min(timeoutMs, 55_000),
      }),
    });
  } catch (error) {
    if (options.signal?.aborted) throw new Error("Sync cancelled.");
    throw new ConnectorError("unreachable", `Firecrawl could not be reached to render ${url}.`);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    data?: { rawHtml?: string; html?: string; metadata?: { sourceURL?: string; url?: string; statusCode?: number } };
  };

  if (response.status === 401 || response.status === 403) {
    throw new ConnectorError("credential", "Firecrawl refused the deployment's API key.");
  }
  if (response.status === 402) {
    throw new ConnectorError("permission", "The Firecrawl account has no credits left.");
  }
  if (!response.ok || payload.success === false) {
    throw new ConnectorError(
      "unreachable",
      `Firecrawl could not render ${url}${payload.error ? `: ${payload.error}` : ` (HTTP ${response.status})`}.`,
    );
  }

  const html = payload.data?.rawHtml ?? payload.data?.html ?? "";
  return {
    url: payload.data?.metadata?.sourceURL ?? payload.data?.metadata?.url ?? url,
    status: payload.data?.metadata?.statusCode ?? 200,
    contentType: "text/html",
    charset: "utf-8",
    body: Buffer.from(html, "utf8"),
  };
}
