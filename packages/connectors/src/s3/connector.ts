/**
 * Amazon S3 and anything that speaks its API: MinIO, Cloudflare R2, Backblaze.
 *
 * The bucket is the source and the key is the document's identity. Nothing
 * about the bucket says what a file is, so the key's extension decides
 * whether it is read at all.
 */
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type _Object as S3Object,
} from "@aws-sdk/client-s3";

import type { S3Config } from "../config";
import { type Connector, type ConnectorContext, type ConnectorDocument, ConnectorError } from "../types";
import { MAX_DOCUMENT_BYTES, baseName, indexableMimeType, throwIfAborted } from "../util";

export class S3Connector implements Connector {
  private readonly client: S3Client;
  private readonly prefix: string;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    // A prefix names a "folder", so it ends with a slash unless it is empty.
    this.prefix = config.prefix && !config.prefix.endsWith("/") ? `${config.prefix}/` : config.prefix;
  }

  async validate(): Promise<void> {
    try {
      await this.client.send(
        new ListObjectsV2Command({ Bucket: this.config.bucket, Prefix: this.prefix, MaxKeys: 1 }),
      );
    } catch (error) {
      throw this.translate(error);
    }
  }

  async *documents(ctx: ConnectorContext): AsyncGenerator<ConnectorDocument> {
    let continuationToken: string | undefined;
    let skipped = 0;

    do {
      throwIfAborted(ctx.signal);
      let page;
      try {
        page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.config.bucket,
            Prefix: this.prefix,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
          }),
        );
      } catch (error) {
        throw this.translate(error);
      }

      for (const object of page.Contents ?? []) {
        throwIfAborted(ctx.signal);
        const document = await this.download(object, ctx);
        if (document) yield document;
        else skipped += 1;
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    if (skipped > 0) ctx.log(`${skipped} ${skipped === 1 ? "object was" : "objects were"} skipped as unsupported or too large.`);
  }

  private async download(object: S3Object, ctx: ConnectorContext): Promise<ConnectorDocument | null> {
    const key = object.Key;
    if (!key || key.endsWith("/")) return null;
    const mimeType = indexableMimeType(key);
    if (!mimeType) return null;
    if ((object.Size ?? 0) > MAX_DOCUMENT_BYTES) {
      ctx.log(`Skipped ${key}: larger than 50 MB.`);
      return null;
    }

    let body: Buffer;
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      body = Buffer.from(await response.Body!.transformToByteArray());
    } catch (error) {
      throw this.translate(error);
    }

    return {
      externalId: `s3://${this.config.bucket}/${key}`,
      title: baseName(key),
      sourceUrl: this.linkFor(key),
      mimeType,
      body,
      sourceUpdatedAt: object.LastModified ?? null,
    };
  }

  /** A link that opens the object for someone with access to the bucket. */
  private linkFor(key: string): string {
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    if (this.config.endpoint) {
      return `${this.config.endpoint.replace(/\/+$/, "")}/${this.config.bucket}/${encodedKey}`;
    }
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${encodedKey}`;
  }

  private translate(error: unknown): ConnectorError {
    const name = (error as { name?: string })?.name ?? "";
    const message = error instanceof Error ? error.message : String(error);
    switch (name) {
      case "NoSuchBucket":
        return new ConnectorError("not_found", `Bucket "${this.config.bucket}" does not exist in ${this.config.region}.`);
      case "InvalidAccessKeyId":
      case "SignatureDoesNotMatch":
      case "InvalidClientTokenId":
      case "AuthorizationHeaderMalformed":
        return new ConnectorError("credential", "The access key or secret was refused.");
      case "AccessDenied":
      case "AllAccessDisabled":
        return new ConnectorError("permission", "The key cannot list or read this bucket. It needs s3:ListBucket and s3:GetObject.");
      case "PermanentRedirect":
        return new ConnectorError("config", "The bucket lives in a different region than the one entered.");
      default:
        return new ConnectorError("unreachable", `The bucket could not be read: ${message}`);
    }
  }
}
