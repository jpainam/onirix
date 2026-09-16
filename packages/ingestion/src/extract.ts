/**
 * Text extraction from uploaded files.
 *
 * Output is a list of sections rather than one string: sections carry their own
 * link/anchor, which the chunker uses to map an offset in a chunk back to a
 * location in the original document for citation purposes.
 */

export type Section = {
  text: string;
  /** Anchor within the source document, e.g. a page or sheet reference. */
  link?: string;
  /**
   * The column header of a tabular section, repeated at the top of every chunk
   * the section is split into.
   *
   * A sheet of 40 rows does not fit one chunk, and the chunk that starts at row
   * 18 is a grid of bare numbers: the model can read the values but has no idea
   * which column is "attainment" and which is "quota". Carrying the header
   * costs a line per chunk and is the difference between a chart the model can
   * label and one it cannot build at all.
   */
  header?: string;
};

export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/json",
] as const;

export function isSupportedMimeType(mimeType: string): boolean {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export class UnsupportedFileTypeError extends Error {
  constructor(mimeType: string) {
    super(`Onirix cannot yet extract text from files of type "${mimeType}".`);
    this.name = "UnsupportedFileTypeError";
  }
}

export async function extractSections(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<Section[]> {
  switch (mimeType) {
    case "application/pdf":
      return extractPdf(buffer);

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocx(buffer);

    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.ms-excel":
      return extractSpreadsheet(buffer);

    case "text/html":
      return [{ text: stripHtml(buffer.toString("utf8")) }];

    case "text/csv": {
      const text = buffer.toString("utf8");
      // Same reasoning as a spreadsheet sheet: the first row names the columns,
      // and every chunk after the first needs it to mean anything.
      return [{ text, header: text.split("\n", 2)[0] }];
    }

    case "text/plain":
    case "text/markdown":
    case "application/json":
      return [{ text: buffer.toString("utf8") }];

    default:
      // Fall back to treating unknown text/* as plain text before giving up.
      if (mimeType.startsWith("text/")) {
        return [{ text: buffer.toString("utf8") }];
      }
      throw new UnsupportedFileTypeError(mimeType || fileName);
  }
}

async function extractPdf(buffer: Buffer): Promise<Section[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  // Per-page text keeps page numbers available as citation anchors.
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];

  return pages
    .map((pageText, i) => ({ text: pageText.trim(), link: `#page=${i + 1}` }))
    .filter((section) => section.text.length > 0);
}

async function extractDocx(buffer: Buffer): Promise<Section[]> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer });
  return [{ text: value }];
}

async function extractSpreadsheet(buffer: Buffer): Promise<Section[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });

  // One section per sheet, as CSV. Tabular data embeds poorly as a wall of
  // text, but keeping rows intact at least preserves row-level meaning.
  return workbook.SheetNames.flatMap((name) => {
    const sheet = workbook.Sheets[name];
    // A name without a matching sheet means a malformed workbook; skip it
    // rather than failing the whole document.
    if (!sheet) return [];

    const csv = XLSX.utils.sheet_to_csv(sheet);
    const text = `${name}\n${csv}`.trim();
    if (!text) return [];

    return [
      {
        text,
        link: `#sheet=${encodeURIComponent(name)}`,
        // The sheet name belongs in the header too: a chunk from the middle of
        // a workbook should still say which sheet it is, the way a reader would
        // cite "the Collaborateurs tab".
        header: tableHeader(text),
      },
    ];
  });
}

/**
 * The lines that identify a table's columns — the sheet name and the header
 * row, or just the header row for a bare CSV.
 *
 * Returns undefined for anything too short to have been split, where repeating
 * a header would only crowd the chunk.
 */
function tableHeader(text: string): string | undefined {
  const lines = text.split("\n", 3);
  if (lines.length < 3) return undefined;
  return lines.slice(0, 2).join("\n");
}

/** Minimal tag strip. Adequate for stored HTML; not a sanitizer. */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
