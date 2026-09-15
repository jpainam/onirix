/**
 * File upload.
 *
 * Stores the original in object storage, records the document as pending, and
 * queues indexing. Extraction and embedding happen in the worker so a large PDF
 * never blocks the request.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { document, member, source } from "@onirix/db/schema";
import { buildFileKey, isSupportedMimeType, putFile } from "@onirix/ingestion";
import { enqueue } from "@onirix/jobs";

import { env } from "@/env.server";
import { auth, ensureStorageReady, getDb, getQueue, getStorage } from "@/services";

/** Upper bound per file. Larger uploads belong to a connector, not a form post. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const db = getDb();
  const membership = await db.query.member.findFirst({
    where: eq(member.userId, session.user.id),
  });
  if (!membership) {
    return Response.json({ error: "You do not belong to an organization." }, { status: 403 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return Response.json({ error: "No files were uploaded." }, { status: 400 });
  }

  // Uploads all land in a single implicit "File uploads" source per workspace.
  const uploadSource = await getOrCreateUploadSource(db, membership.organizationId);

  await ensureStorageReady();
  const storage = getStorage();
  const queue = getQueue();

  const accepted: { id: string; title: string }[] = [];
  const rejected: { name: string; reason: string }[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      rejected.push({ name: file.name, reason: "File exceeds the 50 MB limit." });
      continue;
    }
    if (!isSupportedMimeType(file.type) && !file.type.startsWith("text/")) {
      rejected.push({ name: file.name, reason: `Unsupported file type "${file.type}".` });
      continue;
    }

    const documentId = randomUUID();
    const fileKey = buildFileKey(membership.organizationId, documentId, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());

    await putFile(storage, env.S3_BUCKET, fileKey, buffer, file.type);

    await db.insert(document).values({
      id: documentId,
      organizationId: membership.organizationId,
      sourceId: uploadSource.id,
      title: file.name,
      fileKey,
      mimeType: file.type,
      sizeBytes: file.size,
      status: "pending",
      // Uploaded files are workspace-wide by default; restricting them is a
      // per-document action once groups land.
      isPublic: "true",
      accessControlList: [],
      uploadedBy: session.user.id,
      sourceUpdatedAt: new Date(file.lastModified),
    });

    await enqueue(queue, {
      type: "index_document",
      organizationId: membership.organizationId,
      documentId,
    });

    accepted.push({ id: documentId, title: file.name });
  }

  return Response.json({ accepted, rejected });
}

async function getOrCreateUploadSource(
  db: ReturnType<typeof getDb>,
  organizationId: string,
) {
  const existing = await db.query.source.findFirst({
    where: and(eq(source.organizationId, organizationId), eq(source.type, "file_upload")),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(source)
    .values({
      id: randomUUID(),
      organizationId,
      type: "file_upload",
      name: "File uploads",
      status: "success",
    })
    .returning();
  return created;
}
