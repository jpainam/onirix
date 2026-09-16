import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRightIcon,
  BarChart3Icon,
  CheckIcon,
  DatabaseIcon,
  FileSearchIcon,
  LockIcon,
  MessageSquareTextIcon,
  ServerIcon,
  SparklesIcon,
  UploadIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@onirix/ui/components/button";

import { AnswerDemo } from "@/components/marketing/answer-demo";
import { ChartDemo } from "@/components/marketing/chart-demo";
import {
  Container,
  Eyebrow,
  Heading,
  Lead,
  Section,
  SectionIntro,
} from "@/components/marketing/section";
import { ProviderLogo } from "@/components/provider-logo";
import { AFTER_SIGN_IN } from "@/lib/auth-client";
import { auth } from "@/services";

export const metadata: Metadata = {
  title: "Onirix. Ask your company. See the evidence.",
  description:
    "Onirix turns private company documents into cited answers and source-backed charts, using the AI models and infrastructure your organization chooses.",
};

const FACTS = [
  { value: "5", label: "model providers, your credentials" },
  { value: "9", label: "document formats indexed" },
  { value: "3", label: "visibility levels, enforced in the query" },
  { value: "0", label: "outbound requests with Ollama" },
] as const;

const PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "google", label: "Google" },
  { id: "xai", label: "xAI" },
  { id: "ollama", label: "Ollama" },
] as const;

const FORMATS = ["PDF", "DOCX", "XLSX", "XLS", "CSV", "Markdown", "HTML", "JSON", "Text"];

const QUESTIONS = [
  "What is our international remote-work policy, and which exceptions need approval?",
  "Show quarterly attainment by account executive and mark the 85% target.",
  "How does authentication work, and where are organization permissions enforced?",
  "Compare the renewal terms in these agreements and call out conflicts.",
];

const STACK = [
  { name: "web", role: "Next.js application" },
  { name: "worker", role: "Background indexing" },
  { name: "postgres", role: "Metadata, chats, citations" },
  { name: "opensearch", role: "Hybrid vector and keyword index" },
  { name: "redis", role: "Indexing queue" },
  { name: "minio", role: "Uploaded originals, or any S3 store" },
] as const;

/**
 * The front door.
 *
 * A visitor with a live session has no use for a pitch, so they go straight
 * to the workspace. Everyone else gets the product in the order PRODUCT.md
 * asks for: the headline, an answer with citations and its passage, a chart
 * from a spreadsheet, the three claims, then the call to action. Nothing on
 * this page is promised that the product does not do today.
 */
export default async function LandingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect(AFTER_SIGN_IN);

  return (
    <>
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div
          className="paper-grid absolute inset-0 mask-b-from-30% mask-b-to-95%"
          aria-hidden
        />
        <Container className="relative pt-20 pb-16 sm:pt-28 sm:pb-20">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
            <span className="bg-card text-ink-03 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs tracking-widest uppercase">
              <span className="bg-success size-1.5 rounded-full" aria-hidden />
              Private AI workspace
            </span>
            <Heading as="h1" className="text-4xl leading-none tracking-hero sm:text-6xl lg:text-7xl">
              Ask your company.
              <br />
              See the evidence.
            </Heading>
            <Lead className="max-w-2xl">
              Onirix turns private company documents into cited answers and
              interactive, source-backed charts, using the AI models and
              infrastructure your organization chooses.
            </Lead>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" nativeButton={false} render={<Link href="/login?mode=signup" />}>
                Create a workspace
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
              <Button variant="outline" size="lg" nativeButton={false} render={<Link href="/security" />}>
                How we handle your data
              </Button>
            </div>
          </div>

          <div className="mt-16 sm:mt-20">
            <AnswerDemo />
          </div>
        </Container>
      </div>

      {/* Facts strip */}
      <div className="border-y">
        <Container>
          <dl className="grid grid-cols-2 divide-x md:grid-cols-4">
            {FACTS.map((fact) => (
              <div key={fact.label} className="flex flex-col gap-1 px-4 py-8 first:pl-0 sm:px-6">
                <dd className="font-mono text-3xl font-medium tabular-nums">{fact.value}</dd>
                <dt className="text-ink-03 text-sm leading-5">{fact.label}</dt>
              </div>
            ))}
          </dl>
        </Container>
      </div>

      {/* Product: the three proof points, each with its evidence */}
      <Section id="product">
        <SectionIntro
          eyebrow="The product"
          title="Answers your team can check."
          lead="Every answer and every number stays connected to the file it came from."
        />

        <div className="mt-16 grid gap-12 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-5">
            <IconTile icon={BarChart3Icon} />
            <Heading as="h3">See the story in your data</Heading>
            <p className="text-ink-03 leading-7">
              Numbers in spreadsheets and reports become charts. Each series
              cites its document, and the table is one click away.
            </p>
            <ul className="text-ink-04 flex flex-col gap-2 text-sm">
              <Check>Bar, line, area, pie, and scatter</Check>
              <Check>Citations on the series</Check>
              <Check>Charts are data, never generated code</Check>
            </ul>
          </div>
          <ChartDemo />
        </div>

        <div className="mt-20 grid gap-px overflow-hidden rounded-2xl border md:grid-cols-3">
          <Claim
            icon={FileSearchIcon}
            title="Verify every answer"
            body="Each claim links to the passage behind it, opened beside the answer, with a link to the original file."
            note="Citations, passage panel, original link"
          />
          <Claim
            icon={LockIcon}
            title="Permissions apply before retrieval"
            body="Organization, team, or private visibility is enforced in the query. An admin does not silently read every team's documents."
            note="PostgreSQL query and OpenSearch filter agree"
          />
          <Claim
            icon={ServerIcon}
            title="Keep control"
            body="Self-host in Docker, bring your own provider, or run Ollama and send nothing outside your network."
            note="Docker, your provider, or fully local"
          />
        </div>
      </Section>

      {/* How it works */}
      <Section id="how-it-works" className="bg-tint-01">
        <SectionIntro
          eyebrow="How it works"
          title="From a folder of files to a cited answer."
          align="center"
        />
        <ol className="mt-16 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          <Step
            n={1}
            icon={SparklesIcon}
            title="Connect a provider"
            body="OpenAI, Anthropic, Google, xAI, or Ollama. Enable several, set a default."
          />
          <Step
            n={2}
            icon={UploadIcon}
            title="Upload documents"
            body="Originals are kept. Text is extracted, chunked, embedded, and indexed in the background."
          />
          <Step
            n={3}
            icon={MessageSquareTextIcon}
            title="Ask a question"
            body="Hybrid retrieval hands the strongest passages to the model. Answers stream."
          />
          <Step
            n={4}
            icon={DatabaseIcon}
            title="Check the sources"
            body="Markers open the passage, its source, and its date. Missing evidence is said out loud."
          />
        </ol>
      </Section>

      {/* Providers and formats */}
      <Section id="providers">
        <div className="grid gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <SectionIntro
              eyebrow="Model providers"
              title="You pick the model."
              lead="Onirix uses your credentials, encrypted at rest. Nothing goes to a provider you did not choose."
            />
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PROVIDERS.map((provider) => (
                <li
                  key={provider.id}
                  className="bg-card flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium"
                >
                  <ProviderLogo id={provider.id} label={provider.label} />
                  {provider.label}
                </li>
              ))}
              <li className="text-ink-03 flex items-center rounded-xl border border-dashed px-4 py-3 text-sm">
                Several at once, one default
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-6">
            <SectionIntro
              eyebrow="Documents"
              title="Upload what you already have."
              lead="Up to 50 MB per file, with page and sheet anchors so a citation lands in the right place."
            />
            <ul className="flex flex-wrap gap-2">
              {FORMATS.map((format) => (
                <li
                  key={format}
                  className="bg-tint-02 text-ink-04 rounded-md px-2.5 py-1 font-mono text-xs"
                >
                  {format}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Where it fits */}
      <Section className="bg-wash-sand">
        <SectionIntro
          eyebrow="Where it fits"
          title="The questions teams ask."
        />
        <ul className="mt-12 grid gap-3 md:grid-cols-2">
          {QUESTIONS.map((question) => (
            <li
              key={question}
              className="bg-card flex items-start gap-3 rounded-xl border px-5 py-4 text-sm leading-6"
            >
              <MessageSquareTextIcon className="text-ink-02 mt-1 size-4 shrink-0" aria-hidden />
              <span>{question}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Self-host: the one ink band on the page */}
      <Section id="self-host" className="dark bg-tint-01 text-foreground">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
          <div className="flex flex-col gap-6">
            <SectionIntro
              eyebrow="Self-hosting"
              title="Your infrastructure. Your model."
              lead="The whole stack runs in Docker on servers you operate. With Ollama, nothing leaves the network."
            />
            <div className="flex flex-wrap gap-3">
              <Button nativeButton={false} render={<Link href="/security" />}>
                Read the security overview
              </Button>
              <Button variant="secondary" nativeButton={false} render={<Link href="/security#hosting" />}>
                Hosting and providers
              </Button>
            </div>
          </div>

          <div className="bg-tint-02 overflow-hidden rounded-2xl border shadow-md">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-ink-03 font-mono text-xs">docker compose</span>
              <span className="text-success flex items-center gap-1.5 font-mono text-xs">
                <span className="bg-success size-1.5 rounded-full" aria-hidden />
                6 services
              </span>
            </div>
            <ul className="divide-y">
              {STACK.map((service) => (
                <li key={service.name} className="flex items-center gap-4 px-4 py-3">
                  <span className="text-ink-04 w-24 shrink-0 font-mono text-sm">{service.name}</span>
                  <span className="text-ink-03 text-sm">{service.role}</span>
                </li>
              ))}
            </ul>
            <div className="bg-tint-03 flex items-center gap-2 px-4 py-3 font-mono text-xs">
              <span className="text-ink-02">$</span>
              <span className="text-ink-04">pnpm run docker:up</span>
            </div>
          </div>
        </div>
      </Section>

      {/* Closing: bookends the hero with the same paper grid */}
      <Section
        backdrop={
          <div
            className="paper-grid absolute inset-0 mask-t-from-20% mask-t-to-90%"
            aria-hidden
          />
        }
      >
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <Eyebrow>Get started</Eyebrow>
          <Heading className="text-4xl sm:text-5xl">
            Turn company knowledge into answers your team can trust.
          </Heading>
          <Lead>Create a workspace, connect a provider, upload a folder.</Lead>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" nativeButton={false} render={<Link href="/login?mode=signup" />}>
              Create a workspace
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button variant="ghost" size="lg" nativeButton={false} render={<Link href="/login" />}>
              Sign in
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="bg-tint-02 text-ink-04 flex size-10 items-center justify-center rounded-xl">
      <Icon className="size-5" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <CheckIcon className="text-success mt-1 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

function Claim({
  icon: Icon,
  title,
  body,
  note,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  note: string;
}) {
  return (
    <div className="bg-card flex flex-col gap-4 p-6 sm:p-8">
      <IconTile icon={Icon} />
      <h3 className="text-lg font-semibold tracking-heading">{title}</h3>
      <p className="text-ink-03 text-sm leading-6">{body}</p>
      <p className="text-ink-02 mt-auto border-t pt-4 font-mono text-xs">{note}</p>
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
    <li className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="bg-card flex size-9 items-center justify-center rounded-full border font-mono text-sm">
          {n}
        </span>
        <span className="bg-border h-px flex-1" aria-hidden />
        <Icon className="text-ink-03 size-5" strokeWidth={1.75} aria-hidden />
      </div>
      <h3 className="text-base font-semibold tracking-heading">{title}</h3>
      <p className="text-ink-03 text-sm leading-6">{body}</p>
    </li>
  );
}
