"use client";

/**
 * The sidebar's view of a conversation, kept in step with the live one.
 *
 * A conversation row is created on the first message and named only once that
 * exchange finishes, so without this the sidebar would stay empty through the
 * whole of the first answer and then flash a fully-formed row. Seeding it with
 * the question gives the reader something true immediately; the generated name
 * replaces it when the turn lands.
 */
import { fallbackTitle } from "@/lib/chat-title";
import { queryClient, trpc } from "@/utils/trpc";

/** Shared so the seeded entry lands on the key the sidebar actually reads. */
export const RECENT_CONVERSATIONS_LIMIT = 30;

export function seedRecentConversation(chatId: string, question: string) {
  queryClient.setQueryData(
    trpc.chat.list.queryKey({ limit: RECENT_CONVERSATIONS_LIMIT }),
    (current) => [
      // An ISO string, not a Date: without a transformer the list arrives from
      // the server serialized, and the seeded row has to match it.
      {
        id: chatId,
        title: fallbackTitle(question),
        updatedAt: new Date().toISOString(),
      },
      ...(current ?? []),
    ],
  );
}
