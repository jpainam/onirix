import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isChallenge, loginThenHandoff } from "@/lib/desktop-sign-in";
import { auth } from "@/services";

import { DesktopHandoff } from "./handoff";

/**
 * Where a browser sign-in started by the desktop app finishes.
 *
 * Landing here signed in is not enough to release a session to the desktop:
 * the challenge comes out of a URL, which anyone could have composed and sent,
 * so the user confirms on the page that they are the one who asked. Only then
 * does the approval get written.
 */
export default async function DesktopHandoffPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string }>;
}) {
  const { challenge } = await searchParams;
  if (!isChallenge(challenge)) redirect("/login");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(loginThenHandoff(challenge));

  return (
    <DesktopHandoff
      challenge={challenge}
      email={session.user.email}
      name={session.user.name || null}
    />
  );
}
