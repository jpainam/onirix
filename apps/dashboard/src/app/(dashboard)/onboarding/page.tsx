import { redirect } from "next/navigation";

import { requireSession } from "@/lib/workspace";

import { OnboardingView } from "./onboarding-view";

export default async function OnboardingPage() {
  const { user, workspace } = await requireSession();

  // Setup is one-time; a configured workspace goes straight to Chat.
  if (workspace?.llmConfig) redirect("/chat");

  return (
    <OnboardingView
      userName={user.name}
      organizationName={workspace?.organizationName ?? null}
    />
  );
}
