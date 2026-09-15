import { requireConfiguredWorkspace } from "@/lib/workspace";

import { ChatPanel } from "./chat-panel";

export default async function ChatPage() {
  const { workspace } = await requireConfiguredWorkspace();

  return (
    <ChatPanel
      organizationName={workspace.organizationName}
      modelLabel={workspace.llmConfig.chatModel}
    />
  );
}
