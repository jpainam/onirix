/**
 * Invitation to join an organization's Onirix workspace.
 *
 * Separate from the auth links: those prove control of an address, this one
 * hands over access to a company's private knowledge, so it names the
 * organization and the colleague who sent it. A recipient who does not
 * recognize both should not click.
 */
import { Button, Link, Text } from "react-email";

import { EmailLayout, shared } from "./layout";

export const ORGANIZATION_INVITE_SUBJECT = (organizationName: string) =>
  `Join ${organizationName} on Onirix`;

export function OrganizationInviteEmail({
  organizationName,
  inviterName,
  url,
}: {
  organizationName: string;
  inviterName: string;
  url: string;
}) {
  return (
    <EmailLayout
      preview={`${inviterName} invited you to ${organizationName} on Onirix.`}
      heading={`Join ${organizationName}`}
    >
      <Text style={shared.paragraph}>
        {inviterName} invited you to join {organizationName} on Onirix — a private AI
        workspace for your organization&rsquo;s knowledge. You will see what your
        organization and your teams have shared with you, and nothing beyond that.
      </Text>
      <Button href={url} style={shared.button}>
        Accept invitation
      </Button>
      <Text style={shared.fallbackLabel}>Or paste this link into your browser:</Text>
      <Text style={shared.fallbackLink}>
        <Link href={url} style={shared.fallbackLink}>
          {url}
        </Link>
      </Text>
      <Text style={shared.expiry}>
        This invitation expires in 7 days and can only be accepted from this email
        address.
      </Text>
    </EmailLayout>
  );
}
