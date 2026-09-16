/**
 * Websites: one page, the pages a sitemap lists, or everything reachable by
 * link from a starting point.
 *
 * A port of Onyx's web connector without the headless browser. Pages are
 * fetched as the server sends them, which reads any site that renders on the
 * server and misses ones that draw their content with JavaScript alone. That
 * trade buys a connector with no browser to install and nothing to keep warm.
 *
 * Pages are stored as HTML and given to the same extractor an uploaded `.html`
 * file goes through, so the original is kept and can be re-indexed after an
 * embedding change without another crawl.
 */
import { parseHtml } from "@onirix/ingestion";

import type { WebsiteConfig } from "../config";
import { type Connector, type ConnectorContext, type ConnectorDocument, ConnectorError } from "../types";
import { baseName, sha256, sleep, throwIfAborted } from "../util";
import { decodeText, fetchResource, type FetchedResource } from "./fetch";
import { fetchRendered } from "./firecrawl";
import { discoverSitemapPages, looksLikeSitemap, readSitemap } from "./sitemap";
import { type NetworkPolicy, assertAllowedUrl } from "./ssrf";

/** Pause between fetches of the same site. Polite, and rarely the bottleneck. */
const CRAWL_DELAY_MS = 150;
const PAGE_MAX_BYTES = 20 * 1024 * 1024;

/** Query parameters that only track the visitor, dropped so one page has one URL. */
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$)/i;

export type WebsiteConnectorOptions = NetworkPolicy & {
  /** The deployment's Firecrawl key, for sources that ask for browser rendering. Null when unset. */
  firecrawlApiKey: string | null;
};

export class WebsiteConnector implements Connector {
  constructor(
    private readonly config: WebsiteConfig,
    private readonly options: WebsiteConnectorOptions,
  ) {}

  private get network(): NetworkPolicy {
    return { allowPrivateNetworks: this.options.allowPrivateNetworks };
  }

  private get rendered(): boolean {
    return this.config.render === "browser";
  }

  async validate(): Promise<void> {
    const base = this.config.baseUrl;
    if (this.rendered && !this.options.firecrawlApiKey) {
      throw new ConnectorError(
        "config",
        "Browser rendering needs FIRECRAWL_API_KEY set on this deployment. Turn it off, or add the key.",
      );
    }
    const response = await this.fetchPage(base, { timeoutMs: 15_000 });
    if (response.status >= 400) {
      throw new ConnectorError(
        response.status === 401 || response.status === 403 ? "permission" : "not_found",
        `${base} answered with HTTP ${response.status}.`,
      );
    }
    if (this.config.mode === "sitemap") {
      const pages = await this.sitemapPages();
      if (pages.length === 0) {
        throw new ConnectorError(
          "not_found",
          "No sitemap was found. Paste the sitemap's own address, or choose one page or the whole site instead.",
        );
      }
    }
  }

  async *documents(ctx: ConnectorContext): AsyncGenerator<ConnectorDocument> {
    const { mode, maxPages } = this.config;
    const base = new URL(this.config.baseUrl);

    const queue: string[] =
      mode === "sitemap" ? await this.sitemapPages() : [normalize(this.config.baseUrl)];
    if (mode === "sitemap") ctx.log(`Sitemap lists ${queue.length} pages.`);

    const visited = new Set<string>();
    const seenContent = new Set<string>();
    let fetched = 0;
    let failed = 0;

    while (queue.length > 0 && fetched < maxPages) {
      throwIfAborted(ctx.signal);
      const url = queue.shift()!;
      if (visited.has(url) || this.excluded(url)) continue;
      visited.add(url);
      fetched += 1;

      let resource;
      try {
        resource = await this.fetchPage(url, { signal: ctx.signal });
      } catch (error) {
        failed += 1;
        if (failed <= 5 || failed % 50 === 0) {
          ctx.log(`Skipped ${url}: ${error instanceof Error ? error.message : String(error)}`);
        }
        // The starting page failing is the whole crawl failing.
        if (fetched === 1 && mode !== "sitemap") throw error;
        continue;
      }

      const finalUrl = normalize(resource.url);
      if (finalUrl !== url) {
        if (visited.has(finalUrl)) continue;
        visited.add(finalUrl);
        // A redirect off the site in a whole-site crawl is the site's edge.
        if (mode === "recursive" && !sameSite(base, new URL(finalUrl))) continue;
      }

      if (resource.status >= 400) {
        failed += 1;
        ctx.log(`Skipped ${finalUrl}: HTTP ${resource.status}.`);
        continue;
      }

      if (resource.contentType === "application/pdf") {
        yield {
          externalId: finalUrl,
          title: baseName(new URL(finalUrl).pathname) || finalUrl,
          sourceUrl: finalUrl,
          mimeType: "application/pdf",
          body: resource.body,
          sourceUpdatedAt: null,
        };
        await sleep(CRAWL_DELAY_MS, ctx.signal);
        continue;
      }

      if (resource.contentType !== "text/html" && resource.contentType !== "application/xhtml+xml") {
        continue;
      }

      const html = decodeText(resource.body, resource.charset);
      const page = parseHtml(html, finalUrl);

      if (mode === "recursive") {
        for (const link of page.links) {
          const candidate = normalize(link);
          if (visited.has(candidate) || this.excluded(candidate)) continue;
          if (!sameSite(base, new URL(candidate))) continue;
          queue.push(candidate);
        }
      }

      if (!page.text) continue;

      // The same article at two addresses (a tag page, a `?page=1`) would
      // otherwise be cited twice; the first address seen keeps it.
      const fingerprint = sha256(Buffer.from(`${page.title ?? ""}\n${page.text}`));
      if (seenContent.has(fingerprint)) continue;
      seenContent.add(fingerprint);

      yield {
        externalId: finalUrl,
        title: page.title?.trim() || finalUrl,
        sourceUrl: finalUrl,
        mimeType: "text/html",
        body: Buffer.from(html, "utf8"),
        sourceUpdatedAt: null,
      };

      await sleep(CRAWL_DELAY_MS, ctx.signal);
    }

    if (queue.length > 0 && fetched >= maxPages) {
      ctx.log(`Stopped at the ${maxPages}-page limit with ${queue.length} pages still unread.`);
    }
    if (failed > 0) ctx.log(`${failed} ${failed === 1 ? "page" : "pages"} could not be read.`);
  }

  /**
   * One page's bytes, the way this source asked for them.
   *
   * The address is checked against private networks either way: Firecrawl
   * fetches from its own machines, but a source that flips rendering off
   * later must not gain a way in that it did not have before.
   */
  private async fetchPage(
    url: string,
    options: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<FetchedResource> {
    if (this.rendered && this.options.firecrawlApiKey) {
      await assertAllowedUrl(url, this.network);
      return fetchRendered(url, this.options.firecrawlApiKey, options);
    }
    return fetchResource(url, { ...this.network, maxBytes: PAGE_MAX_BYTES, ...options });
  }

  private async sitemapPages(): Promise<string[]> {
    const base = this.config.baseUrl;
    const options = { ...this.network, timeoutMs: 20_000 };
    const pages = looksLikeSitemap(base)
      ? await readSitemap(base, options)
      : await discoverSitemapPages(base, options);
    return pages.map(normalize).filter((page) => !this.excluded(page));
  }

  private excluded(url: string): boolean {
    if (this.config.excludePaths.length === 0) return false;
    const path = new URL(url).pathname;
    return this.config.excludePaths.some((prefix) => path.startsWith(prefix));
  }
}

/**
 * One address per page: no fragment, no tracking parameters, no `www.` and no
 * trailing slash difference between what the site links and what it serves.
 */
export function normalize(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

/**
 * Whether a link stays inside the site being crawled: same host, ignoring
 * `www.`, and under the starting path when one was given. Starting at
 * `/docs` reads the docs, not the marketing pages beside them.
 */
export function sameSite(base: URL, candidate: URL): boolean {
  const host = (value: string) => value.toLowerCase().replace(/^www\./, "");
  if (host(base.hostname) !== host(candidate.hostname)) return false;
  const basePath = base.pathname.replace(/\/+$/, "");
  if (basePath === "") return true;
  const candidatePath = candidate.pathname.replace(/\/+$/, "");
  return candidatePath === basePath || candidatePath.startsWith(`${basePath}/`);
}
