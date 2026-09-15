import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});

/** Where a user lands once any of the sign-in paths succeeds. */
export const AFTER_SIGN_IN = "/chat";
