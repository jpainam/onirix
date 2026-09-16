/**
 * Access tokens for the Drive API, from either kind of credential.
 *
 * Google's own client library would do this, but it is a large dependency for
 * two token requests, and a service-account assertion is a signed JWT that
 * Node's crypto produces in a dozen lines.
 */
import { createSign } from "node:crypto";

import { DRIVE_READONLY_SCOPE } from "../config";
import { ConnectorError } from "../types";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type AccessToken = { token: string; expiresAt: number };

export async function serviceAccountToken(auth: {
  clientEmail: string;
  privateKey: string;
  impersonate: string | null;
}): Promise<AccessToken> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: auth.clientEmail,
      scope: DRIVE_READONLY_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
      ...(auth.impersonate ? { sub: auth.impersonate } : {}),
    }),
  );
  const input = `${header}.${claims}`;

  let signature: string;
  try {
    // A key pasted from the JSON file may carry literal `\n` sequences.
    const pem = auth.privateKey.includes("\\n") ? auth.privateKey.replace(/\\n/g, "\n") : auth.privateKey;
    signature = createSign("RSA-SHA256").update(input).sign(pem, "base64url");
  } catch {
    throw new ConnectorError("credential", "The service account's private key could not be read. Paste the whole JSON key file.");
  }

  return requestToken({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: `${input}.${signature}`,
  });
}

export async function refreshedToken(auth: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<AccessToken> {
  return requestToken({
    grant_type: "refresh_token",
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
    refresh_token: auth.refreshToken,
  });
}

async function requestToken(form: Record<string, string>): Promise<AccessToken> {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ConnectorError("unreachable", "Google's token service could not be reached.");
  }

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    const detail = payload.error_description ?? payload.error ?? `HTTP ${response.status}`;
    throw new ConnectorError(
      "credential",
      payload.error === "invalid_grant"
        ? `Google refused the credentials (${detail}). For a service account, check the key and any impersonated user; for a linked account, sign in to Google again.`
        : `Google refused the credentials: ${detail}`,
    );
  }

  return {
    token: payload.access_token,
    // A minute early, so a token never expires between check and use.
    expiresAt: Date.now() + ((payload.expires_in ?? 3600) - 60) * 1000,
  };
}

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}
