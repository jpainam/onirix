/**
 * Google Drive: folders, shared drives, or a whole My Drive.
 *
 * Google's own formats (Docs, Sheets, Slides) have no bytes to download, so
 * they are exported into the office formats the extractor already reads. A
 * Doc becomes a `.docx`, a Sheet a `.xlsx`, a deck a PDF. Everything else is
 * fetched as it is and kept if the extractor knows the type.
 */
import type { GoogleDriveConfig } from "../config";
import { type Connector, type ConnectorContext, type ConnectorDocument, ConnectorError } from "../types";
import { MAX_DOCUMENT_BYTES, indexableMimeType, throwIfAborted } from "../util";
import { type AccessToken, refreshedToken, serviceAccountToken } from "./auth";

const DRIVE = "https://www.googleapis.com/drive/v3";
const PAGE_SIZE = 200;
/** Google refuses to export a native file past this size. */
const EXPORT_LIMIT_BYTES = 10 * 1024 * 1024;

const FILE_FIELDS = "id,name,mimeType,modifiedTime,size,webViewLink,shortcutDetails";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  shortcutDetails?: { targetId?: string; targetMimeType?: string };
};

/** How each native format leaves Drive. */
const EXPORTS: Record<string, { mimeType: string; extension: string }> = {
  "application/vnd.google-apps.document": {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: ".docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: ".xlsx",
  },
  "application/vnd.google-apps.presentation": { mimeType: "application/pdf", extension: ".pdf" },
};

const FOLDER = "application/vnd.google-apps.folder";
const SHORTCUT = "application/vnd.google-apps.shortcut";

export class GoogleDriveConnector implements Connector {
  private token: AccessToken | null = null;

  constructor(private readonly config: GoogleDriveConfig) {}

  async validate(): Promise<void> {
    const { folderUrls, includeMyDrive, includeSharedDrives } = this.config;
    if (folderUrls.length === 0 && !includeMyDrive && !includeSharedDrives) {
      throw new ConnectorError("config", "Choose at least one folder, My Drive, or shared drives.");
    }
    for (const url of folderUrls) {
      if (!parseFolderId(url)) {
        throw new ConnectorError("config", `"${url}" is not a Drive folder link.`);
      }
    }

    await this.accessToken();
    await this.api<{ user?: { emailAddress?: string } }>("about", { fields: "user(emailAddress)" });

    for (const url of folderUrls) {
      const id = parseFolderId(url)!;
      try {
        await this.api<DriveFile>(`files/${encodeURIComponent(id)}`, {
          fields: "id,name,mimeType",
          supportsAllDrives: "true",
        });
      } catch (error) {
        if (error instanceof ConnectorError && error.kind === "not_found") {
          throw new ConnectorError(
            "not_found",
            `The folder at ${url} was not found, or the account cannot see it. Share it with ${this.accountLabel()}.`,
          );
        }
        throw error;
      }
    }
  }

  async *documents(ctx: ConnectorContext): AsyncGenerator<ConnectorDocument> {
    const roots: { id: string; label: string }[] = [];
    for (const url of this.config.folderUrls) {
      const id = parseFolderId(url);
      if (id) roots.push({ id, label: url });
    }
    if (this.config.includeMyDrive) roots.push({ id: "root", label: "My Drive" });
    if (this.config.includeSharedDrives) {
      for (const drive of await this.sharedDrives()) {
        roots.push({ id: drive.id, label: drive.name });
      }
    }

    const visitedFolders = new Set<string>();
    const seenFiles = new Set<string>();
    let skipped = 0;

    for (const root of roots) {
      throwIfAborted(ctx.signal);
      const stack = [root.id];
      while (stack.length > 0) {
        throwIfAborted(ctx.signal);
        const folderId = stack.pop()!;
        if (visitedFolders.has(folderId)) continue;
        visitedFolders.add(folderId);

        for await (const file of this.children(folderId)) {
          if (file.mimeType === FOLDER) {
            stack.push(file.id);
            continue;
          }
          let target = file;
          if (file.mimeType === SHORTCUT) {
            // A shortcut to a folder is followed; a shortcut to a file is
            // read at its target so the same file is not indexed twice.
            const targetId = file.shortcutDetails?.targetId;
            if (!targetId) continue;
            if (file.shortcutDetails?.targetMimeType === FOLDER) {
              stack.push(targetId);
              continue;
            }
            target = { ...file, id: targetId, mimeType: file.shortcutDetails?.targetMimeType ?? "" };
          }
          if (seenFiles.has(target.id)) continue;
          seenFiles.add(target.id);

          const document = await this.download(target, ctx);
          if (document) yield document;
          else skipped += 1;
        }
      }
    }

    if (skipped > 0) ctx.log(`${skipped} ${skipped === 1 ? "file was" : "files were"} skipped as unsupported or too large.`);
  }

  private async download(file: DriveFile, ctx: ConnectorContext): Promise<ConnectorDocument | null> {
    const exported = EXPORTS[file.mimeType];
    const size = Number(file.size ?? "0");

    if (exported) {
      if (size > EXPORT_LIMIT_BYTES) {
        ctx.log(`Skipped "${file.name}": larger than Google's export limit.`);
        return null;
      }
      const body = await this.bytes(`files/${encodeURIComponent(file.id)}/export`, {
        mimeType: exported.mimeType,
      });
      return {
        externalId: file.id,
        title: file.name.endsWith(exported.extension) ? file.name : `${file.name}${exported.extension}`,
        sourceUrl: file.webViewLink ?? null,
        mimeType: exported.mimeType,
        body,
        sourceUpdatedAt: file.modifiedTime ? new Date(file.modifiedTime) : null,
      };
    }

    if (file.mimeType.startsWith("application/vnd.google-apps.")) return null;

    const mimeType = indexableMimeType(file.name, file.mimeType);
    if (!mimeType) return null;
    if (size > MAX_DOCUMENT_BYTES) {
      ctx.log(`Skipped "${file.name}": larger than 50 MB.`);
      return null;
    }

    const body = await this.bytes(`files/${encodeURIComponent(file.id)}`, {
      alt: "media",
      supportsAllDrives: "true",
    });
    return {
      externalId: file.id,
      title: file.name,
      sourceUrl: file.webViewLink ?? null,
      mimeType,
      body,
      sourceUpdatedAt: file.modifiedTime ? new Date(file.modifiedTime) : null,
    };
  }

  private async *children(folderId: string): AsyncGenerator<DriveFile> {
    let pageToken: string | undefined;
    do {
      const page = await this.api<{ files?: DriveFile[]; nextPageToken?: string }>("files", {
        q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        pageSize: String(PAGE_SIZE),
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        ...(pageToken ? { pageToken } : {}),
      });
      for (const file of page.files ?? []) yield file;
      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  private async sharedDrives(): Promise<{ id: string; name: string }[]> {
    const drives: { id: string; name: string }[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.api<{ drives?: { id: string; name: string }[]; nextPageToken?: string }>(
        "drives",
        { pageSize: "100", ...(pageToken ? { pageToken } : {}) },
      );
      drives.push(...(page.drives ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return drives;
  }

  private async accessToken(): Promise<string> {
    if (!this.token || this.token.expiresAt <= Date.now()) {
      this.token =
        this.config.auth.kind === "service_account"
          ? await serviceAccountToken(this.config.auth)
          : await refreshedToken(this.config.auth);
    }
    return this.token.token;
  }

  private accountLabel(): string {
    const { auth } = this.config;
    return auth.kind === "service_account"
      ? (auth.impersonate ?? auth.clientEmail)
      : (auth.accountEmail ?? "the linked Google account");
  }

  private async api<T>(path: string, params: Record<string, string>): Promise<T> {
    const response = await this.request(path, params);
    return (await response.json()) as T;
  }

  private async bytes(path: string, params: Record<string, string>): Promise<Buffer> {
    const response = await this.request(path, params);
    return Buffer.from(await response.arrayBuffer());
  }

  private async request(path: string, params: Record<string, string>): Promise<Response> {
    const url = new URL(`${DRIVE}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    for (let attempt = 0; ; attempt += 1) {
      const token = await this.accessToken();
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        throw new ConnectorError("unreachable", "Google Drive could not be reached.");
      }
      if (response.ok) return response;

      // Rate limits come back as 403 with a reason, or 429; both back off.
      if ((response.status === 429 || response.status === 403) && attempt < 4) {
        const body = await response.text().catch(() => "");
        if (response.status === 429 || /rateLimitExceeded|userRateLimitExceeded/.test(body)) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
          continue;
        }
        throw this.errorFor(response.status, body);
      }
      if (response.status === 401 && attempt === 0) {
        this.token = null;
        continue;
      }
      throw this.errorFor(response.status, await response.text().catch(() => ""));
    }
  }

  private errorFor(status: number, body: string): ConnectorError {
    const message = (() => {
      try {
        return (JSON.parse(body) as { error?: { message?: string } }).error?.message;
      } catch {
        return undefined;
      }
    })();
    if (status === 401) return new ConnectorError("credential", "Google refused the credentials.");
    if (status === 403) {
      return new ConnectorError(
        "permission",
        message?.includes("exportSizeLimitExceeded")
          ? "A file is larger than Google's export limit."
          : `Google Drive denied access${message ? `: ${message}` : ""}. Check that the Drive API is enabled and the account can see this data.`,
      );
    }
    if (status === 404) return new ConnectorError("not_found", message ?? "Not found in Google Drive.");
    return new ConnectorError("unreachable", `Google Drive answered with HTTP ${status}${message ? `: ${message}` : ""}.`);
  }
}

/**
 * The folder id inside a Drive link, or a bare id pasted as-is.
 *
 * Accepts `/drive/folders/<id>`, `/drive/u/1/folders/<id>`, `?id=<id>` and a
 * shared drive's root, which shares the folder link shape.
 */
export function parseFolderId(input: string): string | null {
  const trimmed = input.trim();
  const fromPath = trimmed.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  if (fromPath?.[1]) return fromPath[1];
  const fromQuery = trimmed.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (fromQuery?.[1]) return fromQuery[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}
