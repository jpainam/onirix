import type { Metadata } from "next";
import Link from "next/link";
import {
  BoxesIcon,
  DatabaseIcon,
  FileCheckIcon,
  KeyRoundIcon,
  LockIcon,
  MonitorSmartphoneIcon,
  ServerIcon,
  UsersIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@onirix/ui/components/button";

import { Container, Eyebrow, Heading, Lead } from "@/components/section";
import { SIGN_UP_URL } from "@/lib/app-url";

export const metadata: Metadata = {
  title: "Security at Onirix",
  description:
    "How Onirix authenticates people, isolates workspaces, enforces document permissions before retrieval, and protects stored credentials.",
};

const SECTIONS = [
  { id: "authentication", label: "Authentication" },
  { id: "sessions", label: "Sessions and devices" },
  { id: "permissions", label: "Document permissions" },
  { id: "isolation", label: "Workspace isolation" },
  { id: "roles", label: "Roles and administration" },
  { id: "secrets", label: "Secrets at rest" },
  { id: "databases", label: "Connected databases" },
  { id: "hosting", label: "Providers and hosting" },
  { id: "certifications", label: "Certifications" },
] as const;

/**
 * The public security overview.
 *
 * Every statement here describes something the code does today, and the
 * comments beside each block name where. When a control changes, this page
 * changes with it; when a certification is not held, the page says so rather
 * than implying it. A security reviewer who reads a claim here should be able
 * to find it in the source.
 */
export default function SecurityPage() {
  return (
    <>
      <div className="bg-tint-01">
        <Container className="py-16 sm:py-24">
          <div className="flex max-w-3xl flex-col gap-5">
            <Eyebrow>Security</Eyebrow>
            <Heading as="h1" className="text-4xl tracking-hero sm:text-6xl">
              What the product does with your documents, stated precisely.
            </Heading>
            <Lead>
              Onirix indexes documents that were never meant to leave your
              organization. This page describes the controls that exist in the
              product today, and is deliberately silent about anything that does not.
            </Lead>
          </div>

          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border md:grid-cols-3">
            <Summary
              title="Permissions before retrieval"
              body="Document visibility is enforced in the database query and in the search index filter. A passage the reader may not see never reaches the model."
            />
            <Summary
              title="Credentials sealed at rest"
              body="Provider API keys and database connection strings are encrypted with AES-256-GCM under a key the database never holds."
            />
            <Summary
              title="Your infrastructure, your model"
              body="Self-host the full stack in Docker and bring your own model provider. With Ollama, document text never leaves your network."
            />
          </div>
        </Container>
      </div>

      <Container className="grid gap-12 py-16 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-20 sm:py-20">
        <nav
          aria-label="On this page"
          className="hidden self-start lg:sticky lg:top-24 lg:block"
        >
          <p className="text-ink-02 mb-3 font-mono text-xs tracking-widest uppercase">
            On this page
          </p>
          <ul className="flex flex-col gap-1 border-l">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-ink-03 hover:text-foreground hover:border-foreground -ml-px block border-l border-transparent py-1 pl-4 text-sm transition-colors"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-20">
          {/* packages/auth/src/index.ts */}
          <Block
            id="authentication"
            icon={KeyRoundIcon}
            title="Authentication"
            lead="Three ways in, each of which proves control of the email address before an account can act."
          >
            <Item
              title="Email and password with mandatory verification"
              body="A new account cannot sign in until it clicks a mailed link. A sign-in attempt by an unverified account mails a fresh link rather than failing silently."
            />
            <Item
              title="Magic link"
              body="A one-time link sent to the address. No password is stored for accounts that only ever use it."
            />
            <Item
              title="Google sign-in, when the deployment enables it"
              body="Offered only if the operator configures OAuth credentials. A Google identity is linked to an existing account only when Google reports the address as verified and the existing account is verified too, so an unverified signup at someone else's address cannot capture their Google login."
            />
            <Item
              title="Password reset by mailed link"
              body="Resets go through a single-use link to the account's verified address."
            />
          </Block>

          {/* apps/dashboard/src/app/(dashboard)/admin/security, packages/api security router */}
          <Block
            id="sessions"
            icon={MonitorSmartphoneIcon}
            title="Sessions and devices"
            lead="Every person can see where they are signed in. Workspace administrators can see everyone."
          >
            <Item
              title="Device list"
              body="Each signed-in device is listed with its platform and last activity. A person can sign out of every other device in one action."
            />
            <Item
              title="Administrative revocation"
              body="Anyone with the member management grant can end any session in the workspace. Revocation is immediate: the next request finds no session and lands on the login page."
            />
            <Item
              title="Invitations expire"
              body="A workspace invitation is valid for seven days. Re-inviting the same address cancels the earlier link."
            />
          </Block>

          {/* packages/db/src/access.ts, packages/db/src/principal.ts */}
          <Block
            id="permissions"
            icon={LockIcon}
            title="Document permissions"
            lead="If someone cannot read a document, Onirix must not surface it through AI. One rule, evaluated in three places that must agree."
          >
            <Item
              title="Three visibility levels"
              body="A document is visible to the whole organization, to selected teams plus the uploader, or to the uploader alone. Visibility is set on upload and can be changed later."
            />
            <Item
              title="Enforced in the query, not after"
              body="The same access rule is applied in the PostgreSQL metadata query, in the OpenSearch retrieval filter, and by the indexer that writes the access tokens onto every chunk. Filtering never happens on results that were already fetched."
            />
            <Item
              title="Administrators do not bypass teams"
              body="Administrative roles govern who can manage members, sources and settings. They grant no reading rights. An admin who is not on a team does not see that team's documents in search or chat."
            />
            <Item
              title="Private conversations"
              body="A conversation belongs to its author. Cited passages are snapshotted with it, so an answer given last month can still be audited after the index has changed."
            />
          </Block>

          {/* packages/db/src/principal.ts, packages/auth session hook */}
          <Block
            id="isolation"
            icon={BoxesIcon}
            title="Workspace isolation"
            lead="An organization is the tenant boundary. Nothing is shared across it."
          >
            <Item
              title="Scoped on every request"
              body="Documents, search results, conversations, sources and membership are all resolved through the caller's organization. A request can never widen scope beyond a real membership row, even with a stale or forged active organization id."
            />
            <Item
              title="Team membership is intersected"
              body="Teams are checked against the organization in scope. Membership of a team in another organization grants nothing here."
            />
            <Item
              title="No self-service tenants"
              body="Members cannot create additional organizations from the interface, so a customer's knowledge cannot fragment into tenants that cannot see each other."
            />
          </Block>

          {/* packages/db/src/permissions.ts, packages/api permissionProcedure */}
          <Block
            id="roles"
            icon={UsersIcon}
            title="Roles and administration"
            lead="Roles are data, checked on the server for every mutation."
          >
            <Item
              title="Built-in and custom roles"
              body="Owner, admin and member exist in every workspace. Administrators can compose custom roles from a fixed set of grants over members, invitations, teams, sources, knowledge, skills, models, roles and usage."
            />
            <Item
              title="The interface is not the gate"
              body="Hiding a control decides only what a page draws. The procedure behind every control re-checks the same grant, so forcing a hidden control open achieves nothing."
            />
          </Block>

          {/* packages/db/src/secrets.ts */}
          <Block
            id="secrets"
            icon={FileCheckIcon}
            title="Secrets at rest"
            lead="Workspaces bring their own credentials. A copy of the database must not hand them over."
          >
            <Item
              title="AES-256-GCM, random nonce per value"
              body="Model provider API keys and connected database connection strings are sealed before they are written. Each value is authenticated, so a tampered or wrongly keyed value fails closed instead of decrypting to garbage."
            />
            <Item
              title="The key lives outside the database"
              body="The encryption key is one environment variable held by the web and worker processes and by nothing else. A database backup, a replica, or a badly scoped query yields ciphertext."
            />
            <Item
              title="Opened once per request, server-side only"
              body="Credentials are decrypted where the model call is made and never serialized to the browser."
            />
          </Block>

          {/* packages/datasource/src/postgres.ts */}
          <Block
            id="databases"
            icon={DatabaseIcon}
            title="Connected databases"
            lead="When a workspace connects a PostgreSQL database, the model can ask questions of it. It cannot change it."
          >
            <Item
              title="One SELECT, wrapped"
              body="Model-written SQL is embedded as a subquery inside a SELECT with a row cap. A second statement, an UPDATE, a COPY or anything that is not a single SELECT is a syntax error and never reaches the database."
            />
            <Item
              title="Read-only transaction with a timeout"
              body="Every query runs inside a READ ONLY transaction with a statement timeout, and the transaction is always rolled back."
            />
            <Item
              title="Read-only role recommended"
              body="The administrator connecting a database is asked to use a read-only role. Three layers, so a bug in one is caught by the next."
            />
          </Block>

          {/* PRODUCT.md: charts are validated data, not code */}
          <Block
            id="hosting"
            icon={ServerIcon}
            title="Model providers and hosting"
            lead="You decide which model sees your documents, and where the software runs."
          >
            <Item
              title="Bring your own provider"
              body="Chat and embedding calls go to the provider the workspace owner connects, under that workspace's own credentials. Onirix never routes document text through a provider you did not choose."
            />
            <Item
              title="Fully local is an option"
              body="With Ollama for both chat and embeddings, a deployment answers questions without any outbound request."
            />
            <Item
              title="Nothing model-written executes"
              body="Charts are generated as validated data, not as code or images, so no model output runs against private data."
            />
            <Item
              title="Self-hosted in Docker"
              body="PostgreSQL, OpenSearch, Redis, and MinIO or any S3-compatible store, on infrastructure you operate. Uploaded originals stay in your object store."
            />
          </Block>

          <section id="certifications" className="scroll-mt-24 border-t pt-16">
            <Eyebrow>Certifications and questionnaires</Eyebrow>
            <Heading className="mt-4">No audit claimed. Every control checkable.</Heading>
            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              <p className="text-ink-03 leading-7">
                Onirix has not yet completed a third-party audit such as SOC 2 or
                ISO 27001, and this page does not claim one. What it offers instead
                is a precise account of the controls in the product, each of which
                can be checked against the source. If your review needs a
                questionnaire completed or a control examined in more depth, write
                to us and we will answer directly.
              </p>
              <div className="bg-card flex flex-col gap-4 rounded-2xl border p-6">
                <div>
                  <h3 className="text-sm font-semibold">Security contact</h3>
                  <p className="text-ink-03 mt-1 text-sm leading-6">
                    Questionnaires, data handling questions, and vulnerability
                    reports all go to the same address. Please include enough
                    detail for us to reproduce a finding.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="self-start"
                  nativeButton={false} render={<a href="mailto:contact@logestalabs.com" />}
                >
                  contact@logestalabs.com
                </Button>
                <p className="text-ink-02 text-xs leading-5">
                  Self-hosting keeps data in the region and under the controls your
                  organization already operates, which is usually the first thing a
                  data protection review asks about.
                </p>
              </div>
            </div>
            <div className="mt-12 flex flex-wrap gap-3">
              <Button nativeButton={false} render={<a href={SIGN_UP_URL} />}>Create a workspace</Button>
              <Button variant="ghost" nativeButton={false} render={<Link href="/#self-host" />}>
                Back to self-hosting
              </Button>
            </div>
          </section>
        </div>
      </Container>
    </>
  );
}

function Summary({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-card flex flex-col gap-2 p-6">
      <h2 className="text-base font-semibold tracking-heading">{title}</h2>
      <p className="text-ink-03 text-sm leading-6">{body}</p>
    </div>
  );
}

function Block({
  id,
  icon: Icon,
  title,
  lead,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="grid scroll-mt-24 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]"
    >
      <div className="flex flex-col gap-3">
        <span className="bg-tint-02 text-ink-04 flex size-10 items-center justify-center rounded-xl">
          <Icon className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <h2 className="text-xl font-semibold tracking-heading">{title}</h2>
        <p className="text-ink-03 text-sm leading-6">{lead}</p>
      </div>
      <dl className="bg-card flex flex-col divide-y rounded-2xl border px-6">{children}</dl>
    </section>
  );
}

function Item({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-5">
      <dt className="text-sm font-semibold">{title}</dt>
      <dd className="text-ink-03 mt-1 text-sm leading-6">{body}</dd>
    </div>
  );
}
