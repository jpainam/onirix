/**
 * What every connector produces and how the worker drives one.
 *
 * The TypeScript counterpart to Onyx's `LoadConnector`: a source is read as a
 * stream of documents, each with the bytes of its original and enough identity
 * for the next read to tell "changed" from "new" from "gone". Extraction,
 * chunking and embedding are not a connector's business; it hands the bytes
 * to the same pipeline an upload goes through.
 */

export type ConnectorDocument = {
  /**
   * Stable identity inside the source: a page URL, a file id, an object key.
   * The same document must produce the same id on every read.
   */
  externalId: string;
  title: string;
  /** Where a reader can open the original, when the source has such a place. */
  sourceUrl: string | null;
  mimeType: string;
  body: Buffer;
  /** Last modified at the source, when the source says. */
  sourceUpdatedAt: Date | null;
};

export type ConnectorContext = {
  /** Progress the worker records on the run, in the admin's terms. */
  log: (message: string) => void;
  /** Set when the worker is shutting down; a connector stops at the next safe point. */
  signal?: AbortSignal;
};

export interface Connector {
  /**
   * Checks that the source is reachable with the credentials given, without
   * reading it. Runs on connect, so a wrong key is a rejected form rather
   * than a source that fails on its first scheduled night.
   */
  validate(): Promise<void>;
  /** Reads the whole source. Yields as it goes so a large one streams. */
  documents(ctx: ConnectorContext): AsyncGenerator<ConnectorDocument>;
}

export type ConnectorErrorKind =
  /** The settings cannot describe a source: a URL with no host, an empty bucket name. */
  | "config"
  /** The credentials were refused. */
  | "credential"
  /** The credentials work but do not reach this data. */
  | "permission"
  /** The named folder, bucket or page does not exist. */
  | "not_found"
  /** Could not be reached at all. */
  | "unreachable";

/**
 * A failure with a cause an admin can act on.
 *
 * Connectors turn provider errors into one of these so the form and the sync
 * history can say "the key was refused" instead of printing a stack trace.
 */
export class ConnectorError extends Error {
  constructor(
    public readonly kind: ConnectorErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}
