import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AFTER_SIGN_IN } from "@/lib/auth-client";
import { auth } from "@/services";

/**
 * The root has no page of its own: the pitch lives on the public site
 * (apps/web). A live session goes to the workspace, everyone else signs in.
 */
export default async function RootPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  redirect(session?.user ? AFTER_SIGN_IN : "/login");
}
