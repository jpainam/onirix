/**
 * Transactional email delivery via Retransmit.
 *
 * Templates are React Email components rendered to HTML on the server, so the
 * markup that ships is plain inlined HTML with no client runtime.
 */
import { render } from "@react-email/render";
import { Retransmit } from "retransmit.dev";
import { createElement } from "react";

import { AuthLinkEmail, type AuthLinkKind, subjectFor } from "./auth-link";
import {
  ORGANIZATION_INVITE_SUBJECT,
  OrganizationInviteEmail,
} from "./organization-invite";

export type EmailConfig = {
  RETRANSMIT_API_KEY: string;
  EMAIL_FROM: string;
};

export type Mailer = {
  sendAuthLink: (input: { kind: AuthLinkKind; to: string; url: string }) => Promise<void>;
  sendOrganizationInvite: (input: {
    to: string;
    organizationName: string;
    inviterName: string;
    url: string;
  }) => Promise<void>;
};

export function createMailer(env: EmailConfig): Mailer {
  const client = new Retransmit(env.RETRANSMIT_API_KEY);

  return {
    async sendAuthLink({ kind, to, url }) {
      const element = createElement(AuthLinkEmail, { kind, url });
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);

      const { error } = await client.emails.send({
        from: env.EMAIL_FROM,
        to,
        subject: subjectFor(kind),
        html,
        text,
        tags: [{ name: "category", value: kind }],
      });

      // Better Auth swallows nothing here: a rejected promise surfaces to the
      // caller as a failed request, which is what we want — silently dropping a
      // sign-in link would leave the user waiting for mail that never arrives.
      if (error) {
        throw new Error(`Failed to send ${kind} email: ${JSON.stringify(error)}`);
      }
    },

    async sendOrganizationInvite({ to, organizationName, inviterName, url }) {
      const element = createElement(OrganizationInviteEmail, {
        organizationName,
        inviterName,
        url,
      });
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);

      const { error } = await client.emails.send({
        from: env.EMAIL_FROM,
        to,
        subject: ORGANIZATION_INVITE_SUBJECT(organizationName),
        html,
        text,
        tags: [{ name: "category", value: "organization-invite" }],
      });

      // A dropped invitation looks to the inviter like it was sent, and to the
      // colleague like it never existed. Surface the failure instead.
      if (error) {
        throw new Error(`Failed to send invitation email: ${JSON.stringify(error)}`);
      }
    },
  };
}

export type { AuthLinkKind };
