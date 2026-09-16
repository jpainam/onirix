/**
 * The bridge between a conversation and the answer currently being written
 * into it.
 *
 * A generation belongs to the conversation, not to the browser tab that asked
 * for it. The route handler pumps every turn into a resumable stream and
 * records its id here; a reader who refreshes, or whose connection drops, finds
 * that id again and re-attaches to the stream already in flight instead of
 * losing the answer.
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

export async function markStreamActive(chatId: string, streamId: string): Promise<void> {
  await getStreamRedis().set(
    activeStreamKey(chatId),
    streamId,
    "EX",
    ACTIVE_STREAM_TTL_SECONDS,
  );
}

export async function clearActiveStream(chatId: string): Promise<void> {
  await getStreamRedis().del(activeStreamKey(chatId));
}

/** Whether an answer is being written into this conversation right now. */
export async function hasActiveStream(chatId: string): Promise<boolean> {
  return (await getStreamRedis().exists(activeStreamKey(chatId))) === 1;
}

/**
 * Re-attaches to the answer in flight for a conversation.
 *
 * Null covers three cases the caller treats alike — nothing was ever streaming,
 * the stream finished while the reader was away, or the process holding it is
 * gone. In all three the stored conversation is the source of truth, and the
 * caller has already loaded it.
 */
export async function resumeChatStream(
  chatId: string,
): Promise<ReadableStream<string> | null> {
  const streamId = await getStreamRedis().get(activeStreamKey(chatId));
  if (!streamId) return null;

  return (await getResumableStreamContext().resumeExistingStream(streamId)) ?? null;
}
