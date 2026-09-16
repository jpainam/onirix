/**
 * What each connector needs to know, as data.
 *
 * Shared by the form that collects it, the procedure that validates it, the
 * row that stores it and the worker that reads it, so one shape is enough.
 * Secrets are named here too: `mapSecrets` is how the database layer seals
 * them without knowing what each connector keeps where.
 */
import { z } from "zod";

export const CONNECTOR_TYPES = ["website", "google_drive", "onedrive", "s3"] as const;
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

/** The Drive permission a linked Google account has to grant for the connector to read. */
export const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

/**
 * What the Sources page says about each kind of connector before one exists.
 * No behaviour lives here; it is the catalogue's copy, safe for the browser.
 */
export const CONNECTOR_CATALOG: Record<
  ConnectorType,
  { label: string; description: string; defaultSyncIntervalMinutes: number | null }
> = {
  website: {
    label: "Website",
    description: "A public page, everything a sitemap lists, or a whole site followed link by link.",
    defaultSyncIntervalMinutes: 60 * 24,
  },
  google_drive: {
    label: "Google Drive",
    description: "Folders, shared drives or a My Drive. Docs, Sheets and Slides are exported as they are read.",
    defaultSyncIntervalMinutes: 60,
  },
  onedrive: {
    label: "OneDrive",
    description: "The OneDrive of chosen people in your Microsoft 365 tenant, through an app registration.",
    defaultSyncIntervalMinutes: 60,
  },
  s3: {
    label: "Amazon S3",
    description: "A bucket or a prefix inside one, on AWS or any S3-compatible store such as MinIO or R2.",
    defaultSyncIntervalMinutes: 60 * 24,
  },
};

/** How much of a website to read. */
export const WEBSITE_MODES = ["single", "sitemap", "recursive"] as const;
export type WebsiteMode = (typeof WEBSITE_MODES)[number];

export const WEBSITE_MAX_PAGES_DEFAULT = 500;
export const WEBSITE_MAX_PAGES_LIMIT = 5000;

const httpUrl = z
  .string()
  .trim()
  .min(1)
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
  .pipe(
    z.string().url().refine((value) => /^https?:\/\//i.test(value), {
      message: "Enter a web address starting with http:// or https://.",
    }),
  );

export const websiteConfigSchema = z.object({
  type: z.literal("website"),
  /** The page, the sitemap, or the root of the site, depending on `mode`. */
  baseUrl: httpUrl,
  mode: z.enum(WEBSITE_MODES),
  maxPages: z.number().int().min(1).max(WEBSITE_MAX_PAGES_LIMIT).default(WEBSITE_MAX_PAGES_DEFAULT),
  /** Path prefixes never fetched, like `/blog/` or `/fr/`. */
  excludePaths: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  /**
   * How a page's HTML is obtained. `server` fetches what the site sends,
   * which reads any server-rendered page and costs nothing. `browser` renders
   * the page through Firecrawl first, for sites that draw their content with
   * JavaScript; it needs the deployment's Firecrawl key and spends its credits.
   */
  render: z.enum(["server", "browser"]).default("server"),
});

const email = z.string().trim().email();

/**
 * A service account key, as Google issues it in JSON. Only the two fields the
 * signature needs are kept. `impersonate` is for domain-wide delegation: the
 * account acts as this user and sees what they see.
 */
export const googleServiceAccountAuthSchema = z.object({
  kind: z.literal("service_account"),
  clientEmail: email,
  privateKey: z.string().trim().min(1),
  impersonate: email.nullable().default(null),
});

/**
 * A Google account someone linked to Onirix and granted Drive access. The
 * refresh token is copied onto the source at connect time so the connector
 * keeps working if that person later unlinks Google from their own account.
 */
export const googleOAuthAuthSchema = z.object({
  kind: z.literal("oauth"),
  refreshToken: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  accountEmail: z.string().nullable().default(null),
});

export const googleDriveConfigSchema = z.object({
  type: z.literal("google_drive"),
  auth: z.discriminatedUnion("kind", [googleServiceAccountAuthSchema, googleOAuthAuthSchema]),
  /** Folder or shared-drive links, as copied from the browser. */
  folderUrls: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  /** Everything in the account's own My Drive. */
  includeMyDrive: z.boolean().default(false),
  /** Every shared drive the account can see. */
  includeSharedDrives: z.boolean().default(false),
});

export const s3ConfigSchema = z.object({
  type: z.literal("s3"),
  bucket: z
    .string()
    .trim()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/, "Enter the bucket name, not a URL."),
  /** Only keys under this prefix are read. Empty means the whole bucket. */
  prefix: z.string().trim().max(500).default(""),
  region: z.string().trim().min(1).max(40).default("us-east-1"),
  /** Set for MinIO, Cloudflare R2 and other S3-compatible stores. Null means AWS. */
  endpoint: z
    .string()
    .trim()
    .nullable()
    .transform((value) => (value ? value : null))
    .pipe(z.string().url().nullable())
    .default(null),
  accessKeyId: z.string().trim().min(1),
  secretAccessKey: z.string().trim().min(1),
});

export const onedriveConfigSchema = z.object({
  type: z.literal("onedrive"),
  /** The Entra ID (Azure AD) tenant the app registration lives in. */
  tenantId: z.string().trim().min(1),
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  /** Whose OneDrive to read, by sign-in address. */
  users: z.array(email).min(1).max(100),
  /** A folder inside each drive, like `Policies/2026`. Empty means the whole drive. */
  folderPath: z
    .string()
    .trim()
    .transform((value) => value.replace(/^\/+|\/+$/g, ""))
    .default(""),
});

export const connectorConfigSchema = z.discriminatedUnion("type", [
  websiteConfigSchema,
  googleDriveConfigSchema,
  onedriveConfigSchema,
  s3ConfigSchema,
]);

export type ConnectorConfig = z.infer<typeof connectorConfigSchema>;
export type ConnectorConfigInput = z.input<typeof connectorConfigSchema>;
export type WebsiteConfig = z.infer<typeof websiteConfigSchema>;
export type GoogleDriveConfig = z.infer<typeof googleDriveConfigSchema>;
export type S3Config = z.infer<typeof s3ConfigSchema>;
export type OneDriveConfig = z.infer<typeof onedriveConfigSchema>;

/**
 * Applies `transform` to every secret in a config and returns the result.
 *
 * The one place that knows which fields are credentials. Sealing for storage,
 * opening for use, and blanking for the edit form are all this with a
 * different function.
 */
export function mapSecrets(
  config: ConnectorConfig,
  transform: (value: string) => string,
): ConnectorConfig {
  switch (config.type) {
    case "website":
      return config;
    case "google_drive":
      return {
        ...config,
        auth:
          config.auth.kind === "service_account"
            ? { ...config.auth, privateKey: transform(config.auth.privateKey) }
            : {
                ...config.auth,
                refreshToken: transform(config.auth.refreshToken),
                clientSecret: transform(config.auth.clientSecret),
              },
      };
    case "s3":
      return { ...config, secretAccessKey: transform(config.secretAccessKey) };
    case "onedrive":
      return { ...config, clientSecret: transform(config.clientSecret) };
  }
}

/** Marks the place of a secret in a config sent to the browser. */
export const SECRET_PLACEHOLDER = "";

/** A config safe to send to a client: every secret blanked. */
export function redactConfig(config: ConnectorConfig): ConnectorConfig {
  return mapSecrets(config, () => SECRET_PLACEHOLDER);
}

/**
 * Fills blank secrets in `incoming` from `existing`, so an edit form that did
 * not retype a key keeps the stored one.
 *
 * Only when the two configs are the same kind of thing: a Drive source that
 * switches from a service account to a linked account has to supply the new
 * credentials in full.
 */
export function mergeSecrets(incoming: ConnectorConfig, existing: ConnectorConfig): ConnectorConfig {
  if (incoming.type !== existing.type) return incoming;
  switch (incoming.type) {
    case "website":
      return incoming;
    case "google_drive": {
      const previous = (existing as GoogleDriveConfig).auth;
      if (incoming.auth.kind !== previous.kind) return incoming;
      if (incoming.auth.kind === "service_account" && previous.kind === "service_account") {
        return {
          ...incoming,
          auth: { ...incoming.auth, privateKey: incoming.auth.privateKey || previous.privateKey },
        };
      }
      if (incoming.auth.kind === "oauth" && previous.kind === "oauth") {
        return {
          ...incoming,
          auth: {
            ...incoming.auth,
            refreshToken: incoming.auth.refreshToken || previous.refreshToken,
            clientSecret: incoming.auth.clientSecret || previous.clientSecret,
          },
        };
      }
      return incoming;
    }
    case "s3":
      return {
        ...incoming,
        secretAccessKey: incoming.secretAccessKey || (existing as S3Config).secretAccessKey,
      };
    case "onedrive":
      return {
        ...incoming,
        clientSecret: incoming.clientSecret || (existing as OneDriveConfig).clientSecret,
      };
  }
}

/**
 * Validates a config as the edit form sends it: secrets may be blank, to be
 * filled from the stored config by `mergeSecrets`. Everything else is checked
 * as strictly as on create.
 */
export const connectorConfigUpdateSchema = z.discriminatedUnion("type", [
  websiteConfigSchema,
  googleDriveConfigSchema.extend({
    auth: z.discriminatedUnion("kind", [
      googleServiceAccountAuthSchema.extend({ privateKey: z.string().trim().default("") }),
      googleOAuthAuthSchema.extend({
        refreshToken: z.string().default(""),
        clientId: z.string().default(""),
        clientSecret: z.string().default(""),
      }),
    ]),
  }),
  onedriveConfigSchema.extend({ clientSecret: z.string().trim().default("") }),
  s3ConfigSchema.extend({ secretAccessKey: z.string().trim().default("") }),
]);

/** One line saying where a source points, for lists. Never includes a secret. */
export function describeConfig(config: ConnectorConfig): string {
  switch (config.type) {
    case "website": {
      const host = safeHost(config.baseUrl);
      const scope =
        config.mode === "single"
          ? "one page"
          : config.mode === "sitemap"
            ? "pages in the sitemap"
            : `whole site, up to ${config.maxPages} pages`;
      return `${host} · ${scope}${config.render === "browser" ? " · browser-rendered" : ""}`;
    }
    case "google_drive": {
      const parts: string[] = [];
      if (config.folderUrls.length > 0) {
        parts.push(`${config.folderUrls.length} ${config.folderUrls.length === 1 ? "folder" : "folders"}`);
      }
      if (config.includeMyDrive) parts.push("My Drive");
      if (config.includeSharedDrives) parts.push("shared drives");
      const who =
        config.auth.kind === "oauth"
          ? (config.auth.accountEmail ?? "linked Google account")
          : config.auth.impersonate
            ? `as ${config.auth.impersonate}`
            : config.auth.clientEmail;
      return `${parts.join(", ") || "nothing selected"} · ${who}`;
    }
    case "s3":
      return `${config.bucket}${config.prefix ? `/${config.prefix}` : ""} · ${config.endpoint ? safeHost(config.endpoint) : config.region}`;
    case "onedrive":
      return `${config.users.length} ${config.users.length === 1 ? "drive" : "drives"}${config.folderPath ? ` · ${config.folderPath}` : ""}`;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
