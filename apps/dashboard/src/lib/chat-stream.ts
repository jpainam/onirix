/**
 * The bridge between a conversation and the answer currently being written
 * into it.
 *
 * A generation belongs to the conversation, not to the browser tab that asked
 * for it. The route handler pumps every turn into a resumable stream and
 * records its id here; a reader who refreshes, or whose connection drops, finds
 * that id again and re-attaches to the stream already in flight instead of
 * losing the answer.
 *
 * Nothing in this module throws. All of it is bookkeeping in service of
 * recovering an answer, and an answer that cannot be recovered is still worth
 * giving — so a Redis that is down costs resumability and never the reply.
 */
import { getResumableStreamContext, getStreamRedis } from "@/services";

/**
 * A ceiling, not a deadline: the pointer is deleted the moment the turn lands.
 * It exists so a process that dies mid-answer leaves nothing for the next
 * reader to wait on.
 */
const ACTIVE_STREAM_TTL_SECONDS = 15 * 60;

function activeStreamKey(chatId: string): string {
  return `onirix:chat:active-stream:${chatId}`;
}

/**
 * Runs a Redis call, and on failure reports it and carries on as though the
 * stream were simply not resumable.
 */
async function tolerate<T>(
  description: string,
  run: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`Chat stream: ${description} failed`, error);
    return fallback;
  }
}

export async function markStreamActive(chatId: string, streamId: string): Promise<void> {
  await tolerate(
    "recording the active stream",
    () =>
      getStreamRedis().set(
        activeStreamKey(chatId),
        streamId,
        "EX",
        ACTIVE_STREAM_TTL_SECONDS,
      ),
    null,
  );
}

export async function clearActiveStream(chatId: string): Promise<void> {
  // A pointer left behind expires on its own, and until it does it costs a
  // reader one request that comes back empty.
  await tolerate(
    "clearing the active stream",
    () => getStreamRedis().del(activeStreamKey(chatId)),
    0,
  );
}

/** Whether an answer is being written into this conversation right now. */
export async function hasActiveStream(chatId: string): Promise<boolean> {
  const exists = await tolerate(
    "checking for an active stream",
    () => getStreamRedis().exists(activeStreamKey(chatId)),
    0,
  );
  return exists === 1;
}

/**
 * Re-attaches to the answer in flight for a conversation.
 *
 * Null covers every case the caller treats alike — nothing was ever streaming,
 * the stream finished while the reader was away, the process holding it is
 * gone, or Redis is unreachable. In all of them the stored conversation is the
 * source of truth, and the caller has already loaded it.
 */
export async function resumeChatStream(
  chatId: string,
): Promise<ReadableStream<string> | null> {
  const streamId = await tolerate(
    "looking up the active stream",
    () => getStreamRedis().get(activeStreamKey(chatId)),
    null,
  );
  if (!streamId) return null;

  return tolerate(
    "re-attaching to the active stream",
    async () =>
      (await getResumableStreamContext().resumeExistingStream(streamId)) ?? null,
    null,
  );
}
