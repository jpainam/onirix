/**
 * Which websites an answer may read.
 *
 * One setting for every kind of model. A provider reached with a key searches
 * the web itself, so the setting decides whether it is handed its search tool
 * and which sites that tool may read (`@onirix/llm/web-search`). A model on
 * this computer has no search of its own: the same list is what its web fetch
 * tool will be held to once there is one.
 *
 * No Electron in here: the dialog checks an address with the same function the
 * shell stores it with.
 */
import { LIMITS, type WebAccess } from "./local-bridge";

export const DEFAULT_WEB_ACCESS: WebAccess = { enabled: true, sites: [] };

const HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/;

/**
 * The host of whatever was typed: `https://www.example.com/page`,
 * `*.example.com` and `example.com` all work. A listed site covers its
 * subdomains, which is how every provider reads a domain filter, so the
 * wildcard says nothing extra and is dropped. So is `www.`, which would
 * otherwise leave out the rest of the site. Null when it is not a website.
 */
export function parseSite(input: string): string | null {
  const typed = input.trim().toLowerCase().replace(/^\*\./, "");
  if (!typed) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(typed) ? typed : `https://${typed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.replace(/^www\./, "");
    return HOST.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** What is stored, whatever was sent: real hosts, once each, up to the limit. */
export function normalizeWebAccess(value: unknown): WebAccess {
  if (!value || typeof value !== "object") return DEFAULT_WEB_ACCESS;
  const { enabled, sites } = value as { enabled?: unknown; sites?: unknown };
  const hosts = (Array.isArray(sites) ? sites : [])
    .map((site) => (typeof site === "string" ? parseSite(site) : null))
    .filter((site): site is string => site !== null);
  return {
    enabled: typeof enabled === "boolean" ? enabled : DEFAULT_WEB_ACCESS.enabled,
    sites: [...new Set(hosts)].slice(0, LIMITS.webSites),
  };
}
