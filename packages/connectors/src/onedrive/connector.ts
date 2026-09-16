/**
 * OneDrive for Business, through Microsoft Graph.
 *
 * Reads with an app registration and application permissions, the way an
 * organisation grants a service access to its users' drives: a tenant admin
 * consents once to `Files.Read.All`, and the connector lists whichever drives
 * it was told to. A personal Microsoft account is not a business drive and
 * is not supported here.
 */
import type { OneDriveConfig } from "../config";
import { type Connector, type ConnectorContext, type ConnectorDocument, ConnectorError } from "../types";
import { MAX_DOCUMENT_BYTES, indexableMimeType, throwIfAborted } from "../util";

const GRAPH = "https://graph.microsoft.com/v1.0";

type DriveItem = {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
  "@microsoft.graph.downloadUrl"?: string;
};

type Page<T> = { value?: T[]; "@odata.nextLink"?: string };

export class OneDriveConnector implements Connector {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: OneDriveConfig) {}

  async validate(): Promise<void> {
    await this.accessToken();
    for (const user of this.config.users) {
      const drive = await this.api<{ id?: string }>(`users/${encodeURIComponent(user)}/drive?$select=id`, user);
      if (!drive.id) throw new ConnectorError("not_found", `${user} has no OneDrive.`);
      if (this.config.folderPath) {
        await this.api<DriveItem>(
          `users/${encodeURIComponent(user)}/drive/root:/${encodePath(this.config.folderPath)}?$select=id`,
          user,
          `The folder "${this.config.folderPath}" was not found in ${user}'s OneDrive.`,
        );
      }
    }
  }

  async *documents(ctx: ConnectorContext): AsyncGenerator<ConnectorDocument> {
    let skipped = 0;
    for (const user of this.config.users) {
      throwIfAborted(ctx.signal);
      const base = `users/${encodeURIComponent(user)}/drive`;
      const rootPath = this.config.folderPath ? `${base}/root:/${encodePath(this.config.folderPath)}:` : `${base}/root`;

      const stack: string[] = [`${rootPath}/children`];
      while (stack.length > 0) {
        throwIfAborted(ctx.signal);
        let next: string | undefined = stack.pop();
        while (next) {
          const page: Page<DriveItem> = await this.api<Page<DriveItem>>(next, user);
          for (const item of page.value ?? []) {
            if (item.folder) {
              stack.push(`${base}/items/${item.id}/children`);
              continue;
            }
            const document = await this.download(item, user, ctx);
            if (document) yield document;
            else skipped += 1;
          }
          next = page["@odata.nextLink"];
        }
      }
    }
    if (skipped > 0) ctx.log(`${skipped} ${skipped === 1 ? "file was" : "files were"} skipped as unsupported or too large.`);
  }

  private async download(item: DriveItem, user: string, ctx: ConnectorContext): Promise<ConnectorDocument | null> {
    const mimeType = indexableMimeType(item.name, item.file?.mimeType);
    if (!mimeType) return null;
    if ((item.size ?? 0) > MAX_DOCUMENT_BYTES) {
      ctx.log(`Skipped "${item.name}": larger than 50 MB.`);
      return null;
    }

    // Download links are pre-authorised and short-lived; fetch one fresh if
    // the listing did not carry it.
    let downloadUrl = item["@microsoft.graph.downloadUrl"];
    if (!downloadUrl) {
      const fresh = await this.api<DriveItem>(
        `users/${encodeURIComponent(user)}/drive/items/${item.id}?$select=id,@microsoft.graph.downloadUrl`,
        user,
      );
      downloadUrl = fresh["@microsoft.graph.downloadUrl"];
    }
    if (!downloadUrl) return null;

    let response: Response;
    try {
      response = await fetch(downloadUrl, { signal: AbortSignal.timeout(120_000) });
    } catch {
      throw new ConnectorError("unreachable", "OneDrive could not be reached.");
    }
    if (!response.ok) {
      ctx.log(`Skipped "${item.name}": download answered HTTP ${response.status}.`);
      return null;
    }

    return {
      externalId: `${user}:${item.id}`,
      title: item.name,
      sourceUrl: item.webUrl ?? null,
      mimeType,
      body: Buffer.from(await response.arrayBuffer()),
      sourceUpdatedAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null,
    };
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;

    let response: Response;
    try {
      response = await fetch(
        `https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            scope: "https://graph.microsoft.com/.default",
          }).toString(),
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch {
      throw new ConnectorError("unreachable", "Microsoft's sign-in service could not be reached.");
    }

    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !payload.access_token) {
      const detail = payload.error_description?.split("\n")[0] ?? payload.error ?? `HTTP ${response.status}`;
      throw new ConnectorError(
        "credential",
        /tenant|AADSTS90002/i.test(detail)
          ? "The tenant ID was not recognised."
          : `Microsoft refused the app credentials: ${detail}`,
      );
    }

    this.token = {
      value: payload.access_token,
      expiresAt: Date.now() + ((payload.expires_in ?? 3600) - 60) * 1000,
    };
    return this.token.value;
  }

  private async api<T>(pathOrUrl: string, user: string, notFoundMessage?: string): Promise<T> {
    const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH}/${pathOrUrl}`;

    for (let attempt = 0; ; attempt += 1) {
      const token = await this.accessToken();
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        throw new ConnectorError("unreachable", "Microsoft Graph could not be reached.");
      }
      if (response.ok) return (await response.json()) as T;

      if ((response.status === 429 || response.status === 503) && attempt < 4) {
        const wait = Number(response.headers.get("retry-after") ?? "0") * 1000 || 1000 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }

      const body = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      const message = body.error?.message;
      if (response.status === 401) throw new ConnectorError("credential", "Microsoft refused the app credentials.");
      if (response.status === 403) {
        throw new ConnectorError(
          "permission",
          `Microsoft Graph denied access${message ? `: ${message}` : ""}. The app registration needs the Files.Read.All application permission with admin consent.`,
        );
      }
      if (response.status === 404) {
        throw new ConnectorError("not_found", notFoundMessage ?? `${user} was not found in this tenant, or has no OneDrive.`);
      }
      throw new ConnectorError("unreachable", `Microsoft Graph answered with HTTP ${response.status}${message ? `: ${message}` : ""}.`);
    }
  }
}

function encodePath(path: string): string {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}
