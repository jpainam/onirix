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

import { resolveDocumentAcl } from "@onirix/db/access";
import { resolvePrincipal } from "@onirix/db/principal";
import { document, documentTeam, source, sourceDefaultTeam } from "@onirix/db/schema";
import {
  buildFileKey,
  isSupportedMimeType,
  mimeTypeForFileName,
  putFile,
} from "@onirix/ingestion";
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
  const principal = await resolvePrincipal(
    db,
    session.user.id,
    session.session.activeOrganizationId,
  );
  if (!principal) {
    return Response.json({ error: "You do not belong to an organization." }, { status: 403 });
  }
  const { organizationId } = principal;

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return Response.json({ error: "No files were uploaded." }, { status: 400 });
  }

  // Uploads all land in a single implicit "File uploads" source per workspace.
  const uploadSource = await getOrCreateUploadSource(db, organizationId);

  // New documents inherit the source's audience rather than defaulting to
  // workspace-wide, so pointing a connector at a department's drive is enough
  // to keep its files inside that team.
  const defaultTeamIds = (
    await db
      .select({ teamId: sourceDefaultTeam.teamId })
      .from(sourceDefaultTeam)
      .where(eq(sourceDefaultTeam.sourceId, uploadSource.id))
  ).map((row) => row.teamId);

  const visibility = uploadSource.defaultVisibility;
  const accessControlList = resolveDocumentAcl({
    visibility,
    teamIds: defaultTeamIds,
    uploadedBy: session.user.id,
  });

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
    // A browser names the type from its own table of extensions, and for
    // `.md`, `.log` or `.rst` that table often has nothing. The file name
    // settles those, which matters most for a folder of notes.
    const mimeType =
      isSupportedMimeType(file.type) || file.type.startsWith("text/")
        ? file.type
        : mimeTypeForFileName(file.name);
    if (!mimeType) {
      rejected.push({
        name: file.name,
        reason: file.type ? `Unsupported file type "${file.type}".` : "Unsupported file type.",
      });
      continue;
    }

    const documentId = randomUUID();
    const fileKey = buildFileKey(organizationId, documentId, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());

    await putFile(storage, env.S3_BUCKET, fileKey, buffer, mimeType);

    await db.transaction(async (tx) => {
      await tx.insert(document).values({
        id: documentId,
        organizationId,
        sourceId: uploadSource.id,
        title: file.name,
        fileKey,
        mimeType,
        sizeBytes: file.size,
        status: "pending",
        visibility,
        accessControlList,
        uploadedBy: session.user.id,
        sourceUpdatedAt: new Date(file.lastModified),
      });

      // The grants are recorded as rows as well as in the token list, so a
      // team that is later renamed or deleted still resolves correctly.
      if (visibility === "teams" && defaultTeamIds.length > 0) {
        await tx
          .insert(documentTeam)
          .values(defaultTeamIds.map((teamId) => ({ documentId, teamId })));
      }
    });

    await enqueue(queue, {
      type: "index_document",
      organizationId,
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
