import { AcceptInvitationView } from "./accept-invitation-view";

/**
 * Landing page for an emailed invitation.
 *
 * Acceptance runs on the client through Better Auth, which checks that the
 * signed-in user's address matches the one invited — the link alone is not
 * enough, so forwarding it to a colleague grants them nothing.
 */
export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AcceptInvitationView invitationId={id} />;
}
