import { magicLinkClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // The organization plugin backs every membership, team and invitation
  // mutation. Onirix reads this data over tRPC but writes it through here, so
  // Better Auth's own permission checks and owner protections always apply.
  plugins: [magicLinkClient(), organizationClient({ teams: { enabled: true } })],
});

/** Where a user lands once any of the sign-in paths succeeds. */
export const AFTER_SIGN_IN = "/chat";
