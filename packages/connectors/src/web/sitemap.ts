/**
 * Sitemap reading, including sitemap indexes and the places a site announces
 * its sitemap: robots.txt, and the two conventional paths.
 *
 * Parsed with a regular expression on `<loc>` rather than an XML parser: a
 * sitemap is a flat list, and the parser would only add an attack surface for
 * entity expansion on a file an outsider controls.
 */
import { decodeText, fetchResource, type FetchOptions } from "./fetch";

/** Past this, a site is better read recursively with a page cap. */
const MAX_SITEMAP_URLS = 20_000;
const MAX_NESTED_SITEMAPS = 200;

export async function readSitemap(sitemapUrl: string, options: FetchOptions): Promise<string[]> {
  const found = new Set<string>();
  const visited = new Set<string>();
  const queue = [sitemapUrl];

  while (queue.length > 0 && found.size < MAX_SITEMAP_URLS && visited.size < MAX_NESTED_SITEMAPS) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    let text: string;
    try {
      const resource = await fetchResource(url, {
        ...options,
        accept: "application/xml,text/xml;q=0.9,*/*;q=0.5",
      });
      if (resource.status >= 400) continue;
      text = decodeText(resource.body, resource.charset);
    } catch {
      continue;
    }

    const locations = [...text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) =>
      decodeEntities(match[1]!.trim()),
    );
    if (locations.length === 0) continue;

    if (/<sitemapindex[\s>]/i.test(text)) {
      for (const nested of locations) queue.push(absolute(url, nested));
    } else {
      for (const page of locations) {
        found.add(absolute(url, page));
        if (found.size >= MAX_SITEMAP_URLS) break;
      }
    }
  }

  return [...found];
}

/**
 * The pages of a site, found through whatever sitemap it publishes.
 *
 * Tries `/sitemap.xml` and `/sitemap_index.xml`, then whatever `robots.txt`
 * names. Empty when the site has none, which the caller reports as a reason
 * to read the site recursively instead.
 */
export async function discoverSitemapPages(siteUrl: string, options: FetchOptions): Promise<string[]> {
  const root = new URL(siteUrl);
  root.pathname = "/";
  root.search = "";
  root.hash = "";

  const candidates = new Set<string>([
    new URL("/sitemap.xml", root).toString(),
    new URL("/sitemap_index.xml", root).toString(),
  ]);

  try {
    const robots = await fetchResource(new URL("/robots.txt", root).toString(), {
      ...options,
      accept: "text/plain,*/*;q=0.5",
      maxBytes: 512 * 1024,
    });
    if (robots.status < 400) {
      for (const line of decodeText(robots.body, robots.charset).split(/\r?\n/)) {
        const match = line.match(/^\s*sitemap:\s*(\S+)/i);
        if (match?.[1]) candidates.add(absolute(root.toString(), match[1]));
      }
    }
  } catch {
    // No robots.txt is common and not an error.
  }

  const pages = new Set<string>();
  for (const candidate of candidates) {
    for (const page of await readSitemap(candidate, options)) {
      pages.add(page);
      if (pages.size >= MAX_SITEMAP_URLS) return [...pages];
    }
  }
  return [...pages];
}

/** Whether a URL looks like it names a sitemap rather than a page. */
export function looksLikeSitemap(url: string): boolean {
  return /sitemap[^/]*\.xml(\.gz)?$/i.test(new URL(url).pathname);
}

function absolute(base: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}
