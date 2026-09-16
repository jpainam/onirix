import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3Icon,
  DatabaseIcon,
  FileSearchIcon,
  LockIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UploadIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@onirix/ui/components/button";

import { AFTER_SIGN_IN } from "@/lib/auth-client";
import { auth } from "@/services";

export const metadata: Metadata = {
  title: "Onirix. Ask your company. See the evidence.",
  description:
    "Onirix turns private company documents into cited answers and source-backed charts, using the AI models and infrastructure your organization chooses.",
};

/**
 * The front door.
 *
 * A visitor with a live session has no use for a pitch, so they go straight
 * to the workspace. Everyone else gets the product, in the words PRODUCT.md
 * uses for it: uploaded documents, grounded answers, cited charts,
 * permission-aware access, provider choice, self-hosting. Nothing beyond that
 * is promised here.
 */
export default async function LandingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect(AFTER_SIGN_IN);

  return (
    <>
      <section className="mx-auto w-full max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28 sm:pb-24">
        <div className="max-w-3xl">
          <p className="text-ink-03 mb-4 text-sm font-medium">
            A private AI workspace for organizational knowledge
          </p>
          <h1 className="text-4xl leading-tight font-semibold tracking-hero sm:text-6xl">
            Ask your company.
            <br />
            See the evidence.
          </h1>
          <p className="text-ink-03 mt-6 max-w-2xl text-lg leading-7">
            Onirix turns private company documents into cited answers and
            interactive, source-backed charts, using the AI models and
            infrastructure your organization chooses.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" render={<Link href="/login?mode=signup" />}>
              Get started
            </Button>
            <Button variant="outline" size="lg" render={<Link href="/security" />}>
              How we handle your data
            </Button>
          </div>
        </div>
      </section>

      <section className="border-border/60 border-y">
        <div className="mx-auto grid w-full max-w-6xl gap-px px-4 py-14 sm:grid-cols-3 sm:px-6">
          <Proof
            icon={FileSearchIcon}
            title="Verify every answer"
            body="Company-specific claims link to the passage behind them, opened beside the answer, with a link to the original file."
          />
          <Proof
            icon={BarChart3Icon}
            title="See the story in your data"
            body="Numbers in spreadsheets and reports become bar, line, area, pie, or scatter charts, with citations on the series."
          />
          <Proof
            icon={ServerIcon}
            title="Keep control"
            body="Self-host the whole stack, bring your own model provider, or run locally with Ollama and send nothing outside."
          />
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-display sm:text-3xl">
          How it works
        </h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <Step
            n={1}
            icon={SparklesIcon}
            title="Connect a provider"
            body="Pick OpenAI, Anthropic, Google, xAI, or self-hosted Ollama. Enable several, set a default. Onirix uses your credentials."
          />
          <Step
            n={2}
            icon={UploadIcon}
            title="Upload documents"
            body="PDF, Word, Excel, CSV, Markdown, HTML, JSON and plain text. Originals are kept, text is extracted, chunked, embedded and indexed in the background."
          />
          <Step
            n={3}
            icon={DatabaseIcon}
            title="Ask a question"
            body="Hybrid semantic and keyword retrieval, reranked for relevance and freshness, hands the strongest passages to the model. Answers stream."
          />
          <Step
            n={4}
            icon={ShieldCheckIcon}
            title="Check the sources"
            body="Citation markers open the cited passage with its title, source, date and link. Passages are snapshotted with the conversation, so old answers stay auditable."
          />
        </ol>
      </section>

      <section className="border-border/60 border-t">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <LockIcon className="text-ink-04 mb-4 size-8" strokeWidth={1.75} />
            <h2 className="text-2xl font-semibold tracking-display sm:text-3xl">
              Permissions apply before retrieval
            </h2>
            <p className="text-ink-03 mt-4 leading-7">
              Every document is visible to the whole organization, to selected
              teams plus its uploader, or to the uploader alone. The same rule
              runs in the metadata query and in the search index filter, so a
              passage nobody should see never reaches the model. An admin does
              not silently become a reader of every team&apos;s knowledge.
            </p>
            <Link
              href="/security"
              className="text-primary mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline"
            >
              Read the security overview
            </Link>
          </div>
          <dl className="grid gap-6 sm:grid-cols-2">
            <Fact
              term="Tenant boundaries"
              detail="Organizations are hard boundaries across documents, search, chats and membership."
            />
            <Fact
              term="Roles"
              detail="Owner, admin and member out of the box, plus custom roles with narrower grants."
            />
            <Fact
              term="Private conversations"
              detail="A conversation is visible to its author only."
            />
            <Fact
              term="Your infrastructure"
              detail="Docker on PostgreSQL, OpenSearch, Redis, and MinIO or any S3-compatible store."
            />
          </dl>
        </div>
      </section>

      <section className="border-border/60 border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-display sm:text-3xl">
            Answers your team can check.
          </h2>
          <p className="text-ink-03 max-w-2xl leading-7">
            Best for organizations with knowledge spread across many documents,
            team-restricted or sensitive material, a preference for
            self-hosting, and a need for answers employees can verify.
          </p>
          <Button size="lg" render={<Link href="/login?mode=signup" />}>
            Create a workspace
          </Button>
        </div>
      </section>
    </>
  );
}

function Proof({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-3 py-6 sm:px-6 sm:first:pl-0 sm:last:pr-0">
      <Icon className="text-ink-04 size-6" strokeWidth={1.75} />
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-ink-03 text-sm leading-6">{body}</p>
    </div>
  );
}

function Step({
  n,
  icon: Icon,
  title,
  body,
}: {
  n: number;
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <li className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="bg-tint-02 text-ink-03 flex size-7 items-center justify-center rounded-full font-mono text-xs">
          {n}
        </span>
        <Icon className="text-ink-04 size-5" strokeWidth={1.75} />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-ink-03 text-sm leading-6">{body}</p>
    </li>
  );
}

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="bg-card rounded-xl border p-5">
      <dt className="text-sm font-semibold">{term}</dt>
      <dd className="text-ink-03 mt-1 text-sm leading-6">{detail}</dd>
    </div>
  );
}
