"use client";

/**
 * The form behind every connector: what to read, who may see it, how often.
 *
 * One component for connecting and for editing, because the questions are the
 * same both times. The fields differ by kind and live in their own blocks
 * below; what is shared is the name, the audience and the schedule, and the
 * rule that a secret left blank on edit keeps the stored one.
 */
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, ExternalLinkIcon, ShieldIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  CONNECTOR_CATALOG,
  type ConnectorType,
  DRIVE_READONLY_SCOPE,
  WEBSITE_MAX_PAGES_DEFAULT,
  WEBSITE_MAX_PAGES_LIMIT,
  type WebsiteMode,
  type connectorConfigUpdateSchema,
} from "@onirix/connectors/config";
import type { z } from "zod";

import { Button } from "@onirix/ui/components/button";
import { Checkbox } from "@onirix/ui/components/checkbox";
import { Input } from "@onirix/ui/components/input";
import { Label } from "@onirix/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@onirix/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@onirix/ui/components/select";
import { Spinner } from "@onirix/ui/components/spinner";
import { Tabs, TabsList, TabsTrigger } from "@onirix/ui/components/tabs";
import { Textarea } from "@onirix/ui/components/textarea";

import { MembershipPicker } from "@/components/membership-picker";
import { authClient } from "@/lib/auth-client";
import { SYNC_INTERVALS } from "@/lib/format";
import { trpc } from "@/utils/trpc";

export type ConnectorConfigDraft = z.input<typeof connectorConfigUpdateSchema>;

export type ConnectorFormValues = {
  name: string;
  config: ConnectorConfigDraft;
  visibility: "organization" | "teams";
  teamIds: string[];
  syncIntervalMinutes: number | null;
};

type Team = { id: string; name: string };

/** The blank settings of each kind, as the form starts from them. */
function emptyConfig(type: ConnectorType): ConnectorConfigDraft {
  switch (type) {
    case "website":
      return {
        type,
        baseUrl: "",
        mode: "recursive",
        maxPages: WEBSITE_MAX_PAGES_DEFAULT,
        excludePaths: [],
        render: "server",
      };
    case "google_drive":
      return {
        type,
        auth: { kind: "service_account", clientEmail: "", privateKey: "", impersonate: null },
        folderUrls: [],
        includeMyDrive: false,
        includeSharedDrives: false,
      };
    case "onedrive":
      return { type, tenantId: "", clientId: "", clientSecret: "", users: [], folderPath: "" };
    case "s3":
      return { type, bucket: "", prefix: "", region: "us-east-1", endpoint: null, accessKeyId: "", secretAccessKey: "" };
  }
}

export function ConnectorForm({
  type,
  mode,
  initial,
  teams,
  submitting,
  onSubmit,
  onCancel,
}: {
  type: ConnectorType;
  mode: "create" | "edit";
  initial?: Partial<ConnectorFormValues>;
  teams: Team[];
  submitting: boolean;
  onSubmit: (values: ConnectorFormValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [config, setConfig] = useState<ConnectorConfigDraft>(initial?.config ?? emptyConfig(type));
  const [visibility, setVisibility] = useState<"organization" | "teams">(initial?.visibility ?? "organization");
  const [teamIds, setTeamIds] = useState<string[]>(initial?.teamIds ?? []);
  const [interval, setInterval] = useState<number | null>(
    initial?.syncIntervalMinutes === undefined
      ? CONNECTOR_CATALOG[type].defaultSyncIntervalMinutes
      : initial.syncIntervalMinutes,
  );

  const catalog = CONNECTOR_CATALOG[type];

  /** The name most people would give it, from the settings, until they type one. */
  const suggestedName = suggestName(config);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (visibility === "teams" && teamIds.length === 0) {
      toast.error("Choose at least one team, or make the source visible to everyone.");
      return;
    }
    onSubmit({
      name: name.trim() || suggestedName || catalog.label,
      config,
      visibility,
      teamIds: visibility === "teams" ? teamIds : [],
      syncIntervalMinutes: interval,
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {config.type === "website" ? (
        <WebsiteFields value={config} onChange={setConfig} />
      ) : config.type === "google_drive" ? (
        <GoogleDriveFields value={config} onChange={setConfig} mode={mode} />
      ) : config.type === "onedrive" ? (
        <OneDriveFields value={config} onChange={setConfig} mode={mode} />
      ) : (
        <S3Fields value={config} onChange={setConfig} mode={mode} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock label="Name" htmlFor="connector-name" hint="How it appears in citations and on this page.">
          <Input
            id="connector-name"
            value={name}
            placeholder={suggestedName || catalog.label}
            onChange={(event) => setName(event.target.value)}
          />
        </FieldBlock>

        <FieldBlock label="Keep up to date" hint="The worker re-reads the source on this schedule.">
          <Select
            value={interval === null ? "manual" : String(interval)}
            onValueChange={(value) => setInterval(value === "manual" ? null : Number(value))}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {SYNC_INTERVALS.find((entry) => entry.value === interval)?.label ?? "Custom"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SYNC_INTERVALS.map((entry) => (
                <SelectItem key={entry.label} value={entry.value === null ? "manual" : String(entry.value)}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBlock>
      </div>

      <FieldBlock
        label="Who can find what it brings in"
        hint="Every document from this source takes this audience. Existing documents keep theirs."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={visibility}
            onValueChange={(value) => {
              const next = String(value) as "organization" | "teams";
              if (next === "teams" && teams.length === 0) {
                toast.error("Create a team on the Teams page first.");
                return;
              }
              setVisibility(next);
            }}
          >
            <SelectTrigger>
              <SelectValue>{visibility === "organization" ? "Everyone in the workspace" : "Chosen teams"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="organization">Everyone in the workspace</SelectItem>
              <SelectItem value="teams">Chosen teams</SelectItem>
            </SelectContent>
          </Select>
          {visibility === "teams" ? (
            <MembershipPicker
              selected={teams.filter((team) => teamIds.includes(team.id)).map((team) => ({ id: team.id, label: team.name }))}
              options={teams.map((team) => ({ id: team.id, label: team.name }))}
              editable
              addLabel="Add a team"
              emptyLabel="No teams"
              searchPlaceholder="Search teams"
              notFoundLabel="No such team."
              removeLabel={(option) => `Remove ${option.label}`}
              onAdd={(option) => setTeamIds((current) => [...new Set([...current, option.id])])}
              onRemove={(option) => setTeamIds((current) => current.filter((id) => id !== option.id))}
            />
          ) : null}
        </div>
        <p className="text-ink-03 flex items-start gap-2 text-xs leading-4">
          <ShieldIcon className="mt-0.5 size-3.5 shrink-0" />
          Admins do not see past a team restriction. Only members of the chosen teams will find these documents.
        </p>
      </FieldBlock>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {submitting
            ? mode === "create"
              ? "Checking the source…"
              : "Saving…"
            : mode === "create"
              ? "Connect and sync"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function suggestName(config: ConnectorConfigDraft): string {
  switch (config.type) {
    case "website":
      try {
        return new URL(/^https?:\/\//i.test(config.baseUrl) ? config.baseUrl : `https://${config.baseUrl}`).host;
      } catch {
        return "";
      }
    case "s3":
      return config.bucket ? `${config.bucket}${config.prefix ? `/${config.prefix}` : ""}` : "";
    case "google_drive":
      return "Google Drive";
    case "onedrive":
      return "OneDrive";
  }
}

/* --------------------------------------------------------------------- */
/* Website                                                               */
/* --------------------------------------------------------------------- */

const WEBSITE_MODE_OPTIONS: { value: WebsiteMode; label: string; description: string }[] = [
  {
    value: "single",
    label: "One page",
    description: "Just the address you enter. For a policy page or a long article.",
  },
  {
    value: "sitemap",
    label: "Pages in the sitemap",
    description: "Everything the site's sitemap lists. Predictable, and the site decides what is in.",
  },
  {
    value: "recursive",
    label: "Whole site",
    description: "Start at the address and follow every link under it, up to a page limit.",
  },
];

function WebsiteFields({
  value,
  onChange,
}: {
  value: Extract<ConnectorConfigDraft, { type: "website" }>;
  onChange: (next: ConnectorConfigDraft) => void;
}) {
  const [excludeText, setExcludeText] = useState((value.excludePaths ?? []).join("\n"));
  const mode = value.mode;
  const capabilities = useQuery(trpc.connector.capabilities.queryOptions());
  const canRender = capabilities.data?.browserRendering ?? false;

  return (
    <div className="flex flex-col gap-5">
      <FieldBlock
        label="Web address"
        htmlFor="website-url"
        hint={
          mode === "sitemap"
            ? "The site, or the sitemap's own address. Both work."
            : mode === "recursive"
              ? "Start here. Only pages under this address are followed, so /docs stays inside the docs."
              : "The page to read."
        }
      >
        <Input
          id="website-url"
          type="url"
          inputMode="url"
          required
          placeholder="https://docs.example.com"
          value={value.baseUrl}
          onChange={(event) => onChange({ ...value, baseUrl: event.target.value })}
        />
      </FieldBlock>

      <FieldBlock label="How much to read">
        <RadioGroup
          value={mode}
          onValueChange={(next) => onChange({ ...value, mode: next as WebsiteMode })}
        >
          {WEBSITE_MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="bg-card hover:bg-tint-01 has-data-checked:border-primary flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors"
            >
              <RadioGroupItem value={option.value} className="mt-0.5" />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-ink-03 text-xs leading-4">{option.description}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </FieldBlock>

      {mode !== "single" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {mode === "recursive" ? (
            <FieldBlock
              label="Page limit"
              htmlFor="website-max-pages"
              hint={`The crawl stops here. Up to ${WEBSITE_MAX_PAGES_LIMIT.toLocaleString()}.`}
            >
              <Input
                id="website-max-pages"
                type="number"
                min={1}
                max={WEBSITE_MAX_PAGES_LIMIT}
                value={value.maxPages ?? WEBSITE_MAX_PAGES_DEFAULT}
                onChange={(event) =>
                  onChange({
                    ...value,
                    maxPages: Math.min(WEBSITE_MAX_PAGES_LIMIT, Math.max(1, Number(event.target.value) || 1)),
                  })
                }
              />
            </FieldBlock>
          ) : null}
          <FieldBlock
            label="Leave out paths"
            htmlFor="website-exclude"
            hint="One per line. Pages whose path starts with any of these are never read."
          >
            <Textarea
              id="website-exclude"
              rows={2}
              placeholder={"/blog/\n/fr/"}
              value={excludeText}
              onChange={(event) => {
                setExcludeText(event.target.value);
                onChange({ ...value, excludePaths: lines(event.target.value) });
              }}
            />
          </FieldBlock>
        </div>
      ) : null}

      <CheckRow
        id="website-render"
        label="Render pages in a browser first"
        hint={
          canRender
            ? "For sites that draw their content with JavaScript. Slower, and each page spends a Firecrawl credit. Most documentation, help centres and marketing sites read fine without it."
            : "Needs FIRECRAWL_API_KEY on this deployment. Without it, pages are read as the server sends them, which suits most documentation, help centres and marketing sites."
        }
        checked={value.render === "browser"}
        disabled={!canRender}
        onChange={(checked) => onChange({ ...value, render: checked ? "browser" : "server" })}
      />
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Google Drive                                                          */
/* --------------------------------------------------------------------- */

function GoogleDriveFields({
  value,
  onChange,
  mode,
}: {
  value: Extract<ConnectorConfigDraft, { type: "google_drive" }>;
  onChange: (next: ConnectorConfigDraft) => void;
  mode: "create" | "edit";
}) {
  const [folderText, setFolderText] = useState((value.folderUrls ?? []).join("\n"));
  const [keyText, setKeyText] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const google = useQuery(trpc.connector.googleAccount.queryOptions());
  const oauthAvailable = google.data?.available ?? false;
  const auth = value.auth;

  function pasteKey(text: string) {
    setKeyText(text);
    setKeyError(null);
    if (!text.trim()) {
      onChange({ ...value, auth: { kind: "service_account", clientEmail: "", privateKey: "", impersonate: serviceAccount(auth).impersonate } });
      return;
    }
    try {
      const parsed = JSON.parse(text) as { client_email?: string; private_key?: string };
      if (!parsed.client_email || !parsed.private_key) {
        setKeyError("This JSON has no client_email and private_key. Download the key from the service account's Keys tab.");
        return;
      }
      onChange({
        ...value,
        auth: {
          kind: "service_account",
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
          impersonate: serviceAccount(auth).impersonate,
        },
      });
    } catch {
      setKeyError("Paste the whole JSON key file, as downloaded from Google Cloud.");
    }
  }

  async function linkGoogle() {
    setLinking(true);
    try {
      const result = await authClient.linkSocial({
        provider: "google",
        callbackURL: window.location.href,
        scopes: [DRIVE_READONLY_SCOPE],
      });
      if (result.error) toast.error(result.error.message ?? "Google could not be linked.");
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <FieldBlock label="Read Drive as">
        <Tabs
          value={auth.kind}
          onValueChange={(next) =>
            onChange({
              ...value,
              auth:
                next === "oauth"
                  ? { kind: "oauth", refreshToken: "", clientId: "", clientSecret: "", accountEmail: null }
                  : { kind: "service_account", clientEmail: "", privateKey: "", impersonate: null },
            })
          }
        >
          <TabsList>
            <TabsTrigger value="service_account">A service account</TabsTrigger>
            <TabsTrigger value="oauth" disabled={!oauthAvailable}>
              My Google account
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {!oauthAvailable && !google.isPending ? (
          <p className="text-ink-03 text-xs leading-4">
            Reading through your own Google account needs Google sign-in configured on this deployment.
          </p>
        ) : null}
      </FieldBlock>

      {auth.kind === "service_account" ? (
        <>
          <FieldBlock
            label="Service account key"
            htmlFor="drive-key"
            hint={
              mode === "edit" && !keyText
                ? "Leave blank to keep the stored key. Paste a new JSON key file to replace it."
                : "Paste the JSON key file. Share the folders with the account's email, or set a user to act as below."
            }
            error={keyError}
          >
            <Textarea
              id="drive-key"
              rows={4}
              spellCheck={false}
              placeholder='{ "type": "service_account", "client_email": "...", "private_key": "..." }'
              value={keyText}
              onChange={(event) => pasteKey(event.target.value)}
            />
            {auth.clientEmail ? (
              <p className="text-success flex items-center gap-1.5 text-xs">
                <CheckIcon className="size-3.5" />
                {auth.clientEmail}
              </p>
            ) : null}
          </FieldBlock>
          <FieldBlock
            label="Act as (optional)"
            htmlFor="drive-impersonate"
            hint="With domain-wide delegation, the account reads what this person can see."
          >
            <Input
              id="drive-impersonate"
              type="email"
              placeholder="someone@company.com"
              value={auth.impersonate ?? ""}
              onChange={(event) =>
                onChange({ ...value, auth: { ...auth, impersonate: event.target.value.trim() || null } })
              }
            />
          </FieldBlock>
        </>
      ) : (
        <div className="bg-card flex items-center gap-3 rounded-xl border px-4 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold">
              {google.data?.hasDriveAccess ? "Your Google account has Drive access" : "Link your Google account"}
            </span>
            <span className="text-ink-03 text-xs leading-4">
              {google.data?.hasDriveAccess
                ? "The source reads what you can see, and keeps working if you later unlink Google from your account."
                : "Onirix asks Google for read-only access to your Drive. Folders you cannot open stay out."}
            </span>
          </div>
          {google.data?.hasDriveAccess ? (
            <CheckIcon className="text-success size-5 shrink-0" />
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => void linkGoogle()} disabled={linking}>
              {linking ? <Spinner /> : <ExternalLinkIcon />}
              Link Google
            </Button>
          )}
        </div>
      )}

      <FieldBlock
        label="Folders and shared drives"
        htmlFor="drive-folders"
        hint="One link per line, as copied from the browser. Subfolders are included."
      >
        <Textarea
          id="drive-folders"
          rows={3}
          placeholder={"https://drive.google.com/drive/folders/1AbC…\nhttps://drive.google.com/drive/u/0/folders/0BxY…"}
          value={folderText}
          onChange={(event) => {
            setFolderText(event.target.value);
            onChange({ ...value, folderUrls: lines(event.target.value) });
          }}
        />
      </FieldBlock>

      <div className="flex flex-col gap-2">
        <CheckRow
          id="drive-my-drive"
          label="Everything in My Drive"
          hint="The account's own drive, top to bottom."
          checked={value.includeMyDrive ?? false}
          onChange={(checked) => onChange({ ...value, includeMyDrive: checked })}
        />
        <CheckRow
          id="drive-shared"
          label="Every shared drive the account can see"
          hint="For a workspace that wants all of its shared drives without listing them."
          checked={value.includeSharedDrives ?? false}
          onChange={(checked) => onChange({ ...value, includeSharedDrives: checked })}
        />
      </div>
    </div>
  );
}

function serviceAccount(auth: Extract<ConnectorConfigDraft, { type: "google_drive" }>["auth"]) {
  return auth.kind === "service_account" ? auth : { clientEmail: "", privateKey: "", impersonate: null };
}

/* --------------------------------------------------------------------- */
/* OneDrive                                                              */
/* --------------------------------------------------------------------- */

function OneDriveFields({
  value,
  onChange,
  mode,
}: {
  value: Extract<ConnectorConfigDraft, { type: "onedrive" }>;
  onChange: (next: ConnectorConfigDraft) => void;
  mode: "create" | "edit";
}) {
  const [usersText, setUsersText] = useState((value.users ?? []).join("\n"));

  return (
    <div className="flex flex-col gap-5">
      <p className="text-ink-03 text-xs leading-4">
        Register an app in Microsoft Entra ID, give it the <span className="font-mono">Files.Read.All</span>{" "}
        application permission with admin consent, and create a client secret. Onirix reads the drives of the
        people listed below with it.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock label="Tenant ID" htmlFor="od-tenant">
          <Input
            id="od-tenant"
            required
            spellCheck={false}
            placeholder="contoso.onmicrosoft.com or a GUID"
            value={value.tenantId}
            onChange={(event) => onChange({ ...value, tenantId: event.target.value })}
          />
        </FieldBlock>
        <FieldBlock label="Client ID" htmlFor="od-client">
          <Input
            id="od-client"
            required
            spellCheck={false}
            value={value.clientId}
            onChange={(event) => onChange({ ...value, clientId: event.target.value })}
          />
        </FieldBlock>
      </div>

      <FieldBlock
        label="Client secret"
        htmlFor="od-secret"
        hint={mode === "edit" ? "Leave blank to keep the stored secret." : undefined}
      >
        <Input
          id="od-secret"
          type="password"
          required={mode === "create"}
          autoComplete="off"
          value={value.clientSecret ?? ""}
          onChange={(event) => onChange({ ...value, clientSecret: event.target.value })}
        />
      </FieldBlock>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock label="Whose OneDrive" htmlFor="od-users" hint="Sign-in addresses, one per line.">
          <Textarea
            id="od-users"
            rows={3}
            required
            placeholder={"hr@company.com\nfinance@company.com"}
            value={usersText}
            onChange={(event) => {
              setUsersText(event.target.value);
              onChange({ ...value, users: lines(event.target.value) });
            }}
          />
        </FieldBlock>
        <FieldBlock label="Folder (optional)" htmlFor="od-folder" hint="Inside each drive. Empty reads the whole drive.">
          <Input
            id="od-folder"
            placeholder="Policies/2026"
            value={value.folderPath ?? ""}
            onChange={(event) => onChange({ ...value, folderPath: event.target.value })}
          />
        </FieldBlock>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Amazon S3                                                             */
/* --------------------------------------------------------------------- */

function S3Fields({
  value,
  onChange,
  mode,
}: {
  value: Extract<ConnectorConfigDraft, { type: "s3" }>;
  onChange: (next: ConnectorConfigDraft) => void;
  mode: "create" | "edit";
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock label="Bucket" htmlFor="s3-bucket">
          <Input
            id="s3-bucket"
            required
            spellCheck={false}
            placeholder="company-documents"
            value={value.bucket}
            onChange={(event) => onChange({ ...value, bucket: event.target.value.trim() })}
          />
        </FieldBlock>
        <FieldBlock label="Prefix (optional)" htmlFor="s3-prefix" hint="Only keys under it are read.">
          <Input
            id="s3-prefix"
            spellCheck={false}
            placeholder="policies/"
            value={value.prefix ?? ""}
            onChange={(event) => onChange({ ...value, prefix: event.target.value })}
          />
        </FieldBlock>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock label="Access key ID" htmlFor="s3-key">
          <Input
            id="s3-key"
            required
            spellCheck={false}
            autoComplete="off"
            value={value.accessKeyId}
            onChange={(event) => onChange({ ...value, accessKeyId: event.target.value })}
          />
        </FieldBlock>
        <FieldBlock
          label="Secret access key"
          htmlFor="s3-secret"
          hint={mode === "edit" ? "Leave blank to keep the stored key." : undefined}
        >
          <Input
            id="s3-secret"
            type="password"
            required={mode === "create"}
            autoComplete="off"
            value={value.secretAccessKey ?? ""}
            onChange={(event) => onChange({ ...value, secretAccessKey: event.target.value })}
          />
        </FieldBlock>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock label="Region" htmlFor="s3-region">
          <Input
            id="s3-region"
            required
            spellCheck={false}
            placeholder="us-east-1"
            value={value.region ?? ""}
            onChange={(event) => onChange({ ...value, region: event.target.value })}
          />
        </FieldBlock>
        <FieldBlock
          label="Endpoint (optional)"
          htmlFor="s3-endpoint"
          hint="For MinIO, Cloudflare R2 and other S3-compatible stores. Leave blank for AWS."
        >
          <Input
            id="s3-endpoint"
            type="url"
            spellCheck={false}
            placeholder="https://minio.internal:9000"
            value={value.endpoint ?? ""}
            onChange={(event) => onChange({ ...value, endpoint: event.target.value || null })}
          />
        </FieldBlock>
      </div>

      <p className="text-ink-03 text-xs leading-4">
        The key needs <span className="font-mono">s3:ListBucket</span> and{" "}
        <span className="font-mono">s3:GetObject</span> on the bucket. Files are read by extension: PDF, Word,
        Excel, CSV, Markdown, HTML, JSON and plain text.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Shared bits                                                           */
/* --------------------------------------------------------------------- */

function FieldBlock({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-destructive text-xs leading-4">{error}</p> : null}
      {hint && !error ? <p className="text-ink-03 text-xs leading-4">{hint}</p> : null}
    </div>
  );
}

function CheckRow({
  id,
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="bg-card has-disabled:opacity-60 flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 has-disabled:cursor-not-allowed"
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(Boolean(next))}
        className="mt-0.5"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-ink-03 text-xs leading-4">{hint}</span>
      </span>
    </label>
  );
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
