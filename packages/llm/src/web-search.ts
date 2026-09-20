/**
 * A provider's own web search, as a tool to hand to `streamText`.
 *
 * Nothing searches unless it is given this: over the API a model only sees
 * the web when the request carries the provider's search tool. The provider
 * runs the search on its side, inside the one request, so a call site needs no
 * tool loop and no network access of its own.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { ToolSet } from "ai";

import { PROVIDERS, type ProviderId } from "./catalog";

/** How many searches one answer may run, where the provider lets that be said. */
const MAX_SEARCHES = 3;

/**
 * The search tool for a provider, or null when the answer should not search.
 *
 * `sites` are bare hosts (`example.com`), subdomains included; an empty list
 * is the whole web. A provider that cannot keep to a list is given no tool
 * when there is one: a list that is quietly ignored would be worse than no
 * search.
 */
export function webSearchTools(provider: ProviderId, sites: readonly string[]): ToolSet | null {
  const support = PROVIDERS[provider].webSearch;
  if (support === "none") return null;
  if (support === "all-or-nothing" && sites.length > 0) return null;
  const allowedDomains = sites.length > 0 ? [...sites] : undefined;

  switch (provider) {
    case "openai":
      return {
        web_search: openai.tools.webSearch(allowedDomains ? { filters: { allowedDomains } } : {}),
      };
    case "anthropic":
      return {
        web_search: anthropic.tools.webSearch_20250305({ maxUses: MAX_SEARCHES, allowedDomains }),
      };
    case "google":
      return { google_search: google.tools.googleSearch({}) };
    default:
      return null;
  }
}
