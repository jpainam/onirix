import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/services";
import { loadWorkspace } from "@/lib/workspace";

import { SourcesView } from "./sources-view";

export default async function SourcesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const workspace = await loadWorkspace(session.user.id);
  if (!workspace?.llmConfig) redirect("/onboarding");

  return <SourcesView />;
}
