"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

/** What the panel needs to draw one attached document. */
export type SessionDocument = {
  id: string;
  title: string;
  status: "pending" | "processing" | "indexed" | "failed";
};

/** How often a document that is still being read is asked about again. */
const INDEXING_POLL_MS = 4000;

/** The most ids `chat.attachDocuments` takes in one call; a folder can hold more. */
const ATTACH_BATCH = 50;

const settled = (status: SessionDocument["status"]) =>
  status === "indexed" || status === "failed";

/**
 * The documents a conversation has been pointed at.
 *
 * A conversation's row is only written when its first message is sent, so that
 * an abandoned empty one never reaches history. Documents can be attached
 * before then, which leaves nothing to attach them *to*: those are held here
 * and written by `flush` the moment the row exists. Callers see one list
 * either way.
 */
export function useSessionDocuments(chatId: string, created: boolean) {
  const queryClient = useQueryClient();
  const [held, setHeld] = useState<SessionDocument[]>([]);

  const attached = useQuery({
    ...trpc.chat.documents.queryOptions({ chatId }),
    enabled: created,
    // A freshly uploaded file is unreadable until the worker has indexed it,
    // so the list keeps asking until every row has come to rest.
    refetchInterval: (query) =>
      query.state.data?.some((row) => !settled(row.status)) ? INDEXING_POLL_MS : false,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries(trpc.chat.documents.queryFilter({ chatId })),
    [queryClient, chatId],
  );

  const { mutateAsync: attachDocuments } = useMutation(
    trpc.chat.attachDocuments.mutationOptions(),
  );

  const write = useCallback(
    async (documentIds: string[]) => {
      for (let start = 0; start < documentIds.length; start += ATTACH_BATCH) {
        await attachDocuments({
          chatId,
          documentIds: documentIds.slice(start, start + ATTACH_BATCH),
        });
      }
    },
    [chatId, attachDocuments],
  );
  const detachMutation = useMutation(trpc.chat.detachDocument.mutationOptions());

  const attach = useCallback(
    async (documents: SessionDocument[]) => {
      if (documents.length === 0) return;

      if (!created) {
        setHeld((current) => [
          ...current,
          ...documents.filter((next) => !current.some((row) => row.id === next.id)),
        ]);
        return;
      }

      try {
        await write(documents.map((row) => row.id));
        await refresh();
      } catch {
        toast.error("Could not attach that document.");
      }
    },
    [created, write, refresh],
  );

  const detach = useCallback(
    async (documentId: string) => {
      if (!created) {
        setHeld((current) => current.filter((row) => row.id !== documentId));
        return;
      }

      try {
        await detachMutation.mutateAsync({ chatId, documentId });
        await refresh();
      } catch {
        toast.error("Could not remove that document.");
      }
    },
    [created, chatId, detachMutation, refresh],
  );

  /**
   * Writes what was held, once the conversation exists. Awaited before the
   * first message is sent, so that message is already answered from them.
   */
  const flush = useCallback(async () => {
    if (held.length === 0) return;
    await write(held.map((row) => row.id));
    setHeld([]);
    await refresh();
  }, [held, write, refresh]);

  const documents: SessionDocument[] = created
    ? // The held rows bridge the moment between the row being written and the
      // first fetch landing, so the list never blinks empty in between.
      (attached.data ?? held)
    : held;

  return { documents, attach, detach, flush, loading: created && attached.isPending };
}
