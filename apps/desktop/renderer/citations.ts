/**
 * Turns the `[1]` markers the model writes into real nodes the renderer can
 * make interactive. The same pass as the dashboard's
 * (`apps/dashboard/.../chat/citations.ts`), since the marker format is one
 * contract across the product.
 *
 * The markers arrive as plain prose, so without this they are literal text:
 * unclickable, and indistinguishable from a bracketed number that happens to
 * appear in a document. Inspecting a citation is the basis for trusting an
 * answer, so the marker has to be an affordance.
 */

/** Minimal mdast shape: enough to walk and rewrite text nodes. */
type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, string>;
    hChildren?: { type: "text"; value: string }[];
  };
};

/** Always used with `matchAll`, which works on a copy and keeps no state here. */
export const CITATION_MARKER = /\[(\d{1,3})\]/g;

/**
 * The tag citation markers become. `sup` is a real element, so it survives
 * sanitisation, and grounded answers never produce one otherwise, which makes
 * it unambiguous to map back to a component.
 */
const CITATION_TAG = "sup";
export const CITATION_ATTRIBUTE = "data-citation";

export function remarkCitations() {
  return (tree: MdastNode) => {
    rewrite(tree);
  };
}

/** The source numbers an answer's text actually refers to. */
export function citedIndices(text: string): Set<number> {
  const cited = new Set<number>();
  for (const match of text.matchAll(CITATION_MARKER)) {
    if (match[1]) cited.add(Number.parseInt(match[1], 10));
  }
  return cited;
}

function rewrite(node: MdastNode): void {
  const children = node.children;
  if (!children) return;

  // A marker inside a link's label is part of that link, not a citation.
  if (node.type === "link" || node.type === "linkReference") return;

  for (let i = children.length - 1; i >= 0; i -= 1) {
    const child = children[i];
    if (!child) continue;

    if (child.type === "text" && child.value) {
      const split = splitMarkers(child.value);
      // `code` and `inlineCode` carry their text in `value` rather than in a
      // child text node, so they are skipped without a special case.
      if (split) children.splice(i, 1, ...split);
      continue;
    }

    rewrite(child);
  }
}

function splitMarkers(value: string): MdastNode[] | null {
  const matches = [...value.matchAll(CITATION_MARKER)];
  if (matches.length === 0) return null;

  const nodes: MdastNode[] = [];
  let cursor = 0;

  for (const match of matches) {
    const [marker, digits] = match;
    if (match.index > cursor) {
      nodes.push({ type: "text", value: value.slice(cursor, match.index) });
    }
    nodes.push(citationNode(Number.parseInt(digits ?? "0", 10), marker));
    cursor = match.index + marker.length;
  }

  if (cursor < value.length) {
    nodes.push({ type: "text", value: value.slice(cursor) });
  }
  return nodes;
}

function citationNode(index: number, label: string): MdastNode {
  return {
    type: "citation",
    data: {
      hName: CITATION_TAG,
      hProperties: { [CITATION_ATTRIBUTE]: String(index) },
      // Keeps the original text as the fallback, so an unresolvable marker
      // still reads as what the model wrote.
      hChildren: [{ type: "text", value: label }],
    },
  };
}
