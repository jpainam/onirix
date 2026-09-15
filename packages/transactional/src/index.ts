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

export type EmailConfig = {
  RETRANSMIT_API_KEY: string;
  EMAIL_FROM: string;
};

export type Mailer = {
  sendAuthLink: (input: { kind: AuthLinkKind; to: string; url: string }) => Promise<void>;
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
  };
}

export type { AuthLinkKind };
