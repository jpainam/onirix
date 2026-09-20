import { notFound } from "next/navigation";

import { loadConversation } from "@/lib/chat-history";
import { hasActiveStream } from "@/lib/chat-stream";
import { requireWorkspace } from "@/lib/workspace";

import { ChatPanel } from "../chat-panel";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, workspace } = await requireWorkspace();

  const conversation = await loadConversation({
    chatId: id,
    organizationId: workspace.organizationId,
    userId: user.id,
  });
  // The loader scopes by owner, so another user's conversation is not
  // forbidden here — from this caller's side it does not exist.
  if (!conversation) notFound();

  // Asked here rather than left to the client to discover, so a conversation
  // that is not being answered costs nothing: only a reader who arrived back
  // mid-answer goes looking for the stream to rejoin.
  const streaming = await hasActiveStream(conversation.id);

  return (
    <ChatPanel
      // Moving between two conversations keeps the panel in the same slot, so
      // without a key its history and composer would carry over.
      key={conversation.id}
      organizationName={workspace.organizationName}
      modelLabel={workspace.llmConfig?.chatModel ?? null}
      conversationId={conversation.id}
      title={conversation.title}
      initialMessages={conversation.messages}
      resume={streaming}
    />
  );
}
