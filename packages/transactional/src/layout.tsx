/**
 * Shared chrome for every transactional email.
 *
 * Mail clients strip external stylesheets and most `<style>` rules, so all
 * styling here is inline on the elements themselves.
 */
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";
import type { ReactNode } from "react";

export const APP_NAME = "Onirix";

const styles = {
  body: {
    backgroundColor: "#f7f7f8",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: 0,
    padding: "40px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    margin: "0 auto",
    maxWidth: "480px",
    padding: "40px",
  },
  wordmark: {
    color: "#111827",
    fontSize: "20px",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    margin: "0 0 32px",
  },
  heading: {
    color: "#111827",
    fontSize: "24px",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    lineHeight: "32px",
    margin: "0 0 12px",
  },
  divider: { borderColor: "#e5e7eb", margin: "32px 0 16px" },
  footer: { color: "#9ca3af", fontSize: "12px", lineHeight: "18px", margin: 0 },
} as const;

export function EmailLayout({
  preview,
  heading,
  children,
}: {
  preview: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.wordmark}>{APP_NAME}</Text>
          <Text style={styles.heading}>{heading}</Text>
          <Section>{children}</Section>
          <Hr style={styles.divider} />
          <Text style={styles.footer}>
            You received this email because someone requested it for this address at{" "}
            {APP_NAME}. If that was not you, you can safely ignore it — no action will be
            taken.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const shared = {
  paragraph: {
    color: "#374151",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 24px",
  },
  button: {
    backgroundColor: "#111827",
    borderRadius: "8px",
    color: "#ffffff",
    display: "block",
    fontSize: "15px",
    fontWeight: 600,
    padding: "12px 20px",
    textAlign: "center",
    textDecoration: "none",
  },
  fallbackLabel: {
    color: "#6b7280",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "24px 0 4px",
  },
  fallbackLink: {
    color: "#4b5563",
    fontSize: "13px",
    lineHeight: "20px",
    margin: 0,
    wordBreak: "break-all",
  },
  expiry: {
    color: "#6b7280",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "24px 0 0",
  },
} as const;
