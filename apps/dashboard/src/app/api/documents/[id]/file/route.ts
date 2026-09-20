/**
 * The original bytes of a document, for the preview beside a conversation and
 * for downloading.
 *
 * Every answer is the same 404 when the document cannot be served, whether it
 * does not exist, belongs to another workspace, or is restricted to a team the
 * reader is not in: a different status for each would confirm that a document
 * someone may not see is there.
 */
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { visibleToPrincipal } from "@onirix/db/access";
import { resolvePrincipal } from "@onirix/db/principal";
import { document } from "@onirix/db/schema";
import { getFile } from "@onirix/ingestion";

import { env } from "@/env.server";
import { auth, getDb, getStorage } from "@/services";

const NOT_FOUND = () => Response.json({ error: "Document not found." }, { status: 404 });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  if (!principal) return NOT_FOUND();

  const { id } = await params;
  const [row] = await db
    .select({
      title: document.title,
      fileKey: document.fileKey,
      mimeType: document.mimeType,
    })
    .from(document)
    .where(
      and(
        eq(document.id, id),
        eq(document.organizationId, principal.organizationId),
        visibleToPrincipal(principal.accessControlList),
      ),
    )
    .limit(1);
  if (!row?.fileKey) return NOT_FOUND();

  let body: Buffer;
  try {
    body = await getFile(getStorage(), env.S3_BUCKET, row.fileKey);
  } catch {
    // The row outlived its object, which a half-finished delete can leave.
    return NOT_FOUND();
  }

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": row.mimeType ?? "application/octet-stream",
      "Content-Length": String(body.byteLength),
      // Always an attachment, never inline: these are files people uploaded,
      // and an HTML or SVG one opened on this origin would run as the app.
      // The preview reads the bytes with `fetch`, which does not care.
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.title)}`,
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
      // Access can be withdrawn, so a copy must not outlive the check above.
      "Cache-Control": "private, no-store",
    },
  });
}
