import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { handoffPath, isChallenge, loginThenHandoff } from "@/lib/desktop-sign-in";
import { auth } from "@/services";

import { DesktopSignInStart } from "./start";

/**
 * Where the desktop app sends the browser to begin a sign-in.
 *
 * A browser that is already signed in goes straight to the handoff. One that
 * is not is taken to Google if that is what was clicked in the app, and to
 * the ordinary login page otherwise; either way the handoff is the `next`
 * step, so the approval happens as soon as the sign-in does.
 */
export default async function DesktopSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string; provider?: string }>;
}) {
  const { challenge, provider } = await searchParams;
  if (!isChallenge(challenge)) redirect("/login");

  const handoff = handoffPath(challenge);
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect(handoff);

  if (provider !== "google") redirect(loginThenHandoff(challenge));
  return <DesktopSignInStart callbackURL={handoff} />;
}
