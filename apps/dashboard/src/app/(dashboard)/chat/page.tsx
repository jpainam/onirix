import { requireWorkspace } from "@/lib/workspace";

import { ChatPanel } from "./chat-panel";

export default async function ChatPage() {
  const { workspace } = await requireWorkspace();

  return (
    <ChatPanel
      // Starting a new session from an open conversation lands on this page
      // with the panel in the same slot; the key forces it back to empty.
      key="new"
      organizationName={workspace.organizationName}
      modelLabel={workspace.llmConfig?.chatModel ?? null}
    />
  );
}
