/**
 * The three auth emails share one shape: a sentence, a button, and a copyable
 * fallback URL. They differ only in wording, so they are one template driven by
 * a `kind` discriminator rather than three near-identical files.
 */
import { Button, Link, Text } from "react-email";

import { EmailLayout, shared } from "./layout";

export type AuthLinkKind = "magic-link" | "verify-email" | "reset-password";

type Copy = {
  subject: string;
  preview: string;
  heading: string;
  body: string;
  action: string;
  expiry: string;
};

const COPY: Record<AuthLinkKind, Copy> = {
  "magic-link": {
    subject: "Your sign-in link",
    preview: "Sign in to Onirix — this link expires in 5 minutes.",
    heading: "Sign in to Onirix",
    body: "Click the button below to sign in. No password needed.",
    action: "Sign in",
    expiry: "This link expires in 5 minutes and can only be used once.",
  },
  "verify-email": {
    subject: "Verify your email address",
    preview: "Confirm your email address to finish setting up Onirix.",
    heading: "Verify your email",
    body: "Confirm this address to finish creating your Onirix account.",
    action: "Verify email",
    expiry: "This link expires in 1 hour.",
  },
  "reset-password": {
    subject: "Reset your password",
    preview: "Reset the password on your Onirix account.",
    heading: "Reset your password",
    body: "Choose a new password for your Onirix account. Your current password stays active until you do.",
    action: "Reset password",
    expiry: "This link expires in 1 hour and can only be used once.",
  },
};

export function subjectFor(kind: AuthLinkKind): string {
  return COPY[kind].subject;
}

export function AuthLinkEmail({ kind, url }: { kind: AuthLinkKind; url: string }) {
  const copy = COPY[kind];

  return (
    <EmailLayout preview={copy.preview} heading={copy.heading}>
      <Text style={shared.paragraph}>{copy.body}</Text>
      <Button href={url} style={shared.button}>
        {copy.action}
      </Button>
      <Text style={shared.fallbackLabel}>Or paste this link into your browser:</Text>
      <Text style={shared.fallbackLink}>
        <Link href={url} style={shared.fallbackLink}>
          {url}
        </Link>
      </Text>
      <Text style={shared.expiry}>{copy.expiry}</Text>
    </EmailLayout>
  );
}
