/**
 * Re-attaching to an answer already in flight.
 *
 * `useChat` calls this on mount when the conversation it just loaded was still
 * being answered — after a refresh, a recovered connection, or the same
 * conversation opened in a second tab. The stream replays everything generated
 * so far and then continues live, so the reader rejoins an answer mid-sentence
 * rather than waiting for one that, from their side, never arrives.
 */
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { chat } from "@onirix/db/schema";

import { resumeChatStream } from "@/lib/chat-stream";
import { loadWorkspace } from "@/lib/workspace";
import { auth, getDb } from "@/services";

export const maxDuration = 60;

/**
 * 204 is the transport's signal that there is nothing to resume, and it covers
 * every way that can be true: the answer finished while the reader was away,
 * the conversation is not theirs, or none was ever streaming. The stored
 * conversation the client has already rendered is the answer in all of them.
 */
const NOTHING_TO_RESUME = new Response(null, { status: 204 });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await params;
  const workspace = await loadWorkspace(
    session.user.id,
    session.session.activeOrganizationId,
  );
  if (!workspace) return NOTHING_TO_RESUME;

  const conversation = await getDb().query.chat.findFirst({
    columns: { id: true },
    where: and(
      eq(chat.id, id),
      eq(chat.organizationId, workspace.organizationId),
      // Conversations are private to their author until shared.
      eq(chat.userId, session.user.id),
    ),
  });
  if (!conversation) return NOTHING_TO_RESUME;

  const stream = await resumeChatStream(conversation.id);
  if (!stream) return NOTHING_TO_RESUME;

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      // The marker the AI SDK transport looks for, and the hint that keeps a
      // reverse proxy from buffering the answer into one lump at the end.
      "x-vercel-ai-ui-message-stream": "v1",
      "x-accel-buffering": "no",
    },
  });
}
