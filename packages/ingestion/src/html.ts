/**
 * HTML to text, the way a reader sees a page rather than the way a browser
 * parses it.
 *
 * A port of the rules behind Onyx's `format_document_soup`: block elements
 * become line breaks, list items become dashes, table cells become tabs, and
 * everything a page carries for its own benefit rather than the reader's —
 * scripts, styles, navigation, footers, hidden elements — is dropped. The
 * links come out too, because the website connector needs them to crawl.
 */
import type { AnyNode, Element } from "domhandler";
import { isTag, isText } from "domhandler";
import { parseDocument } from "htmlparser2";

export type ParsedHtml = {
  /** The `<title>`, or the first heading when there is none. */
  title: string | null;
  text: string;
  /** Absolute `href`s of every anchor, fragments removed, de-duplicated. */
  links: string[];
  /** `<link rel="canonical">`, resolved, when the page declares one. */
  canonicalUrl: string | null;
  /** The page asked crawlers to leave it out of indexes. */
  noindex: boolean;
};

/** Elements whose content is never for the reader. */
const DROP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "object",
  "embed",
  "head",
  "nav",
  "footer",
  "aside",
  "form",
  "button",
  "select",
  "input",
  "textarea",
]);

/** Elements that start on a new line. */
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "main",
  "header",
  "blockquote",
  "figure",
  "figcaption",
  "ul",
  "ol",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "hr",
  "details",
  "summary",
  "address",
]);

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

export function parseHtml(html: string, baseUrl?: string): ParsedHtml {
  const document = parseDocument(html);

  let title: string | null = null;
  let firstHeading: string | null = null;
  let canonicalUrl: string | null = null;
  let noindex = false;
  const links = new Set<string>();
  const parts: string[] = [];

  /** Whitespace is preserved inside `<pre>`, as a browser would. */
  let verbatimDepth = 0;

  const attr = (element: Element, name: string): string | undefined =>
    element.attribs[name] ?? element.attribs[name.toLowerCase()];

  const resolve = (href: string): string | null => {
    const trimmed = href.trim().replace(/\\/g, "/");
    if (!trimmed) return null;
    if (/^(mailto|tel|javascript|data|sms):/i.test(trimmed)) return null;
    try {
      const url = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      url.hash = "";
      return url.toString();
    } catch {
      return null;
    }
  };

  const visit = (node: AnyNode, inTable: boolean): void => {
    if (isText(node)) {
      const raw = node.data;
      if (verbatimDepth > 0) {
        parts.push(raw);
        return;
      }
      const collapsed = raw.replace(/\s+/g, " ");
      if (collapsed.trim().length === 0) {
        // Whitespace between elements still separates words that would
        // otherwise run together, so keep one space.
        if (collapsed.length > 0) parts.push(" ");
        return;
      }
      parts.push(inTable ? collapsed.trim() : collapsed);
      return;
    }

    if (!isTag(node)) return;
    const element = node;
    const name = element.name.toLowerCase();

    if (name === "title") {
      const text = textOf(element).trim();
      if (text && title === null) title = text;
      return;
    }

    if (name === "meta") {
      const metaName = (attr(element, "name") ?? "").toLowerCase();
      const content = (attr(element, "content") ?? "").toLowerCase();
      if ((metaName === "robots" || metaName === "googlebot") && /\bnoindex\b/.test(content)) {
        noindex = true;
      }
      return;
    }

    if (name === "link") {
      const rel = (attr(element, "rel") ?? "").toLowerCase();
      const href = attr(element, "href");
      if (rel.split(/\s+/).includes("canonical") && href) {
        canonicalUrl = resolve(href);
      }
      return;
    }

    if (name === "a") {
      const href = attr(element, "href");
      if (href) {
        const resolved = resolve(href);
        if (resolved) links.add(resolved);
      }
    }

    if (DROP_TAGS.has(name)) {
      // Links inside navigation are still links worth crawling; only the
      // text is noise. Collect them and stop.
      if (name === "nav" || name === "footer" || name === "aside" || name === "head") {
        collectLinks(element, resolve, links);
      }
      return;
    }

    if (attr(element, "hidden") !== undefined) return;
    if ((attr(element, "aria-hidden") ?? "").toLowerCase() === "true") return;
    const role = (attr(element, "role") ?? "").toLowerCase();
    if (role === "navigation" || role === "banner" || role === "contentinfo") {
      collectLinks(element, resolve, links);
      return;
    }

    if (name === "br") {
      parts.push("\n");
      return;
    }

    if (HEADING_TAGS.has(name)) {
      const text = textOf(element).replace(/\s+/g, " ").trim();
      if (text && firstHeading === null) firstHeading = text;
      parts.push("\n\n", text, "\n\n");
      return;
    }

    if (name === "pre") {
      parts.push("\n");
      verbatimDepth += 1;
      for (const child of element.children) visit(child, inTable);
      verbatimDepth -= 1;
      parts.push("\n");
      return;
    }

    if (name === "li") {
      parts.push("\n- ");
      for (const child of element.children) visit(child, inTable);
      return;
    }

    if (name === "tr") {
      parts.push("\n");
      for (const child of element.children) visit(child, true);
      return;
    }

    if (name === "td" || name === "th") {
      parts.push("\t");
      for (const child of element.children) visit(child, true);
      return;
    }

    const block = BLOCK_TAGS.has(name);
    if (block) parts.push("\n");
    for (const child of element.children) visit(child, inTable);
    if (block) parts.push("\n");
  };

  for (const child of document.children) visit(child, false);

  return {
    title: title ?? firstHeading,
    text: tidy(parts.join("")),
    links: [...links],
    canonicalUrl,
    noindex,
  };
}

function collectLinks(
  element: Element,
  resolve: (href: string) => string | null,
  into: Set<string>,
): void {
  const stack: AnyNode[] = [...element.children];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (!isTag(node)) continue;
    if (node.name.toLowerCase() === "a" && node.attribs.href) {
      const resolved = resolve(node.attribs.href);
      if (resolved) into.add(resolved);
    }
    stack.push(...node.children);
  }
}

function textOf(element: Element): string {
  let out = "";
  const stack: AnyNode[] = [...element.children];
  while (stack.length > 0) {
    const node = stack.shift()!;
    if (isText(node)) out += node.data;
    else if (isTag(node)) stack.unshift(...node.children);
  }
  return out;
}

/**
 * Collapses what the walk produced into readable lines: no trailing spaces,
 * no runs of blank lines, tabs kept only where a table put them.
 */
function tidy(text: string): string {
  return text
    .replace(/[  ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\t+/g, "\t")
    .replace(/\n\t/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text of a page, for callers that want nothing else. */
export function htmlToText(html: string): string {
  return parseHtml(html).text;
}
