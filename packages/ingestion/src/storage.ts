/**
 * Object storage for uploaded originals (MinIO in the default deployment).
 *
 * Originals are kept so a citation can link back to the real file, and so a
 * document can be re-indexed after an embedding model change without asking
 * the user to upload it again.
 */
import { S3Client } from "@aws-sdk/client-s3";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

export type StorageConfig = {
  S3_ENDPOINT: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_BUCKET: string;
  S3_REGION?: string;
};

export function createStorageClient(config: StorageConfig): S3Client {
  return new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
    // MinIO serves buckets as a path segment, not a hostname prefix.
    forcePathStyle: true,
  });
}

export async function ensureBucket(client: S3Client, bucket: string): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error: unknown) {
      // Another process may have won the race; that is fine.
      const name = (error as { name?: string })?.name;
      if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") {
        throw error;
      }
    }
  }
}

/** Storage key for an uploaded file. Organization-prefixed to keep tenants apart. */
export function buildFileKey(organizationId: string, documentId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.\-]/g, "_");
  return `${organizationId}/${documentId}/${safeName}`;
}

export async function putFile(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getFile(client: S3Client, bucket: string, key: string): Promise<Buffer> {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await response.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteFile(client: S3Client, bucket: string, key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
