/**
 * Model download.
 *
 * Asks the workspace's Ollama to pull one model and streams its progress back
 * as JSON lines. The download lands on the machine that runs Ollama, not on
 * the caller's, which is why any admin can start one from any browser.
 *
 * A route handler rather than a tRPC procedure because it streams for as long
 * as the download runs. Closing the request cancels the pull; Ollama keeps the
 * layers it already has and resumes from them on the next attempt.
 */
import { headers } from "next/headers";
import { z } from "zod";

import { ollamaConnection } from "@onirix/api/routers/models";
import { isDownloadableModel, pullOllamaModel } from "@onirix/llm";

import { loadWorkspace, workspaceCan } from "@/lib/workspace";
import { auth, getDb } from "@/services";

const input = z.object({ model: z.string().min(1) });

/** Ollama reports many times a second; a progress bar needs a few. */
const REPORT_EVERY_MS = 200;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const workspace = await loadWorkspace(
    session.user.id,
    session.session.activeOrganizationId,
  );
  if (!workspace) {
    return Response.json({ error: "You do not belong to an organization." }, { status: 403 });
  }
  if (!workspaceCan(workspace, "model", "update")) {
    return Response.json(
      { error: "This action requires permission to update model." },
      { status: 403 },
    );
  }

  const parsed = input.safeParse(await request.json().catch(() => null));
  // Only what the catalog lists is ever fetched, never a name a caller made up.
  if (!parsed.success || !isDownloadableModel(parsed.data.model)) {
    return Response.json({ error: "Unknown model." }, { status: 400 });
  }
  const { model } = parsed.data;

  const connection = await ollamaConnection({
    db: getDb(),
    organizationId: workspace.organizationId,
  });
  if (connection.state !== "connected") {
    return Response.json(
      { error: "Connect a self-hosted Ollama before downloading models." },
      { status: 409 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: object) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));

      try {
        let reportedAt = 0;
        let lastStatus = "";
        for await (const progress of pullOllamaModel(connection.origin, model, request.signal)) {
          const now = Date.now();
          // A change of status always goes out; bytes are rationed.
          if (progress.status !== lastStatus || now - reportedAt >= REPORT_EVERY_MS) {
            send(progress);
            reportedAt = now;
            lastStatus = progress.status;
          }
        }
        send({ done: true });
      } catch (failure) {
        if (!request.signal.aborted) {
          send({
            error:
              failure instanceof Error
                ? failure.message
                : "The download failed.",
          });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by the caller going away.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    },
  });
}
