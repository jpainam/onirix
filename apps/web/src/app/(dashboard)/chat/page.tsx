import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/services";
import { loadWorkspace } from "@/lib/workspace";

import { ChatPanel } from "./chat-panel";

export default async function ChatPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  // No workspace or no model yet means setup is unfinished.
  const workspace = await loadWorkspace(session.user.id);
  if (!workspace?.llmConfig) redirect("/onboarding");

  return (
    <ChatPanel
      organizationName={workspace.organizationName}
      modelLabel={workspace.llmConfig.chatModel}
    />
  );
}
