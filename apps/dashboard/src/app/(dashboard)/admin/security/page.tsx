import { GlobeIcon, KeyRoundIcon, MailIcon } from "@onirix/ui/lib/icons";

import { Badge } from "@onirix/ui/components/badge";

import { Page, PageHeader, Row, Section } from "@/components/page";
import { env } from "@/env.server";
import { requireWorkspace, workspaceCan } from "@/lib/workspace";

import { SessionsView } from "./security-view";

/**
 * Security: how people get in, and who is currently in.
 *
 * The sign-in half is reported, not configured. Which methods a deployment
 * offers is decided by the environment `@onirix/auth` boots from, so a toggle
 * here would be a control that lies — it could not turn Google on without
 * credentials, and could not turn password sign-in off without a redeploy. What
 * the page owes an admin instead is an accurate statement of what is live.
 *
 * The session half is the part that is genuinely administrable, and it lives in
 * a client component because it reads and writes through tRPC.
 */
export default async function SecurityPage() {
  const { workspace } = await requireWorkspace();

  // Same condition `createAuth` applies: a provider with no credentials is not
  // registered, so the button on the login page fails rather than redirects.
  const googleConfigured = Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
  );

  // Rendering decision only. `security.workspaceSessions` checks the same grant,
  // and so does every revoke of someone else's session.
  const canManage = workspaceCan(workspace, "member", "update");

  return (
    <Page wide>
      <PageHeader
        title="Security"
        description="How people sign in to this deployment, and the devices they are signed in on."
      />

      <div className="flex flex-col gap-10">
        <Section
          title="Sign-in methods"
          description="Set by this deployment's environment when it boots, not from this page."
        >
          <div className="flex flex-col gap-2">
            <Row
              icon={<KeyRoundIcon />}
              title="Email and password"
              description="A new account has to click a mailed link before it can sign in."
              action={<Badge variant="success">On</Badge>}
            />
            <Row
              icon={<MailIcon />}
              title="Magic link"
              description="Sign in from a one-time link, no password stored."
              action={<Badge variant="success">On</Badge>}
            />
            <Row
              icon={<GlobeIcon />}
              title="Google"
              description={
                googleConfigured
                  ? "Linked to an account only when Google reports the address as verified."
                  : "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to offer it."
              }
              action={
                googleConfigured ? (
                  <Badge variant="success">On</Badge>
                ) : (
                  <Badge variant="muted">Not configured</Badge>
                )
              }
            />
          </div>
        </Section>

        <SessionsView canManage={canManage} />
      </div>
    </Page>
  );
}
