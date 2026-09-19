import { env } from "@/env.server";

/**
 * A link into the product, which runs as its own app (apps/dashboard) on its
 * own origin. This site holds no session and no sign-in pages, so every
 * "Sign in" and "Create a workspace" leaves it through here.
 */
export function appUrl(path: `/${string}`): string {
  return `${env.APP_URL.replace(/\/+$/, "")}${path}`;
}

export const SIGN_IN_URL = appUrl("/login");
export const SIGN_UP_URL = appUrl("/login?mode=signup");
