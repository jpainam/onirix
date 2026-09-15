import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/services";
import { loadWorkspace } from "@/lib/workspace";

import { OnboardingWizard } from "./wizard";

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  // Setup is one-time; a configured workspace goes straight to Chat.
  const workspace = await loadWorkspace(session.user.id);
  if (workspace?.llmConfig) redirect("/chat");

  return <OnboardingWizard userName={session.user.name} />;
}
