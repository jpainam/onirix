/**
 * Connectors: how documents arrive from systems other than an upload form.
 *
 * The TypeScript counterpart to Onyx's `backend/onyx/connectors`. Each one
 * turns a set of settings into a stream of documents; the worker stores the
 * bytes and queues them through the same indexing pipeline an upload uses.
 */
import { GoogleDriveConnector } from "./google-drive/connector";
import { OneDriveConnector } from "./onedrive/connector";
import { S3Connector } from "./s3/connector";
import { WebsiteConnector, type WebsiteConnectorOptions } from "./web/connector";
import type { ConnectorConfig } from "./config";
import type { Connector } from "./types";

export * from "./config";
export * from "./types";
export { parseFolderId } from "./google-drive/connector";
export type { NetworkPolicy } from "./web/ssrf";

/** What a deployment provides to connectors, over and above a source's own settings. */
export type ConnectorOptions = WebsiteConnectorOptions;

export function createConnector(config: ConnectorConfig, options: ConnectorOptions): Connector {
  switch (config.type) {
    case "website":
      return new WebsiteConnector(config, options);
    case "google_drive":
      return new GoogleDriveConnector(config);
    case "s3":
      return new S3Connector(config);
    case "onedrive":
      return new OneDriveConnector(config);
  }
}
