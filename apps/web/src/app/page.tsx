import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckIcon,
  FileSearchIcon,
  FilesIcon,
  LockIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@onirix/ui/components/button";

import { DownloadButton } from "@/components/download-button";
import { FeatureCards } from "@/components/feature-cards";
import { ProductTour } from "@/components/product-tour";
import { ProviderLogo } from "@/components/provider-logo";
import {
  Container,
  Eyebrow,
  Heading,
  Lead,
  Section,
  SectionIntro,
} from "@/components/section";
import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/app-url";
import { desktopDownloads, desktopDownloadsPublished } from "@/lib/desktop-downloads";

export const metadata: Metadata = {
  title: "Onirix. Ask your company. See the evidence.",
  description:
    "Onirix turns private company documents into cited answers and source-backed charts, using the AI models and infrastructure your organization chooses.",
};

// The download band asks whether the installers exist (desktop-downloads.ts
// keeps its own answer); re-rendering each minute picks up a release soon
// after it lands.
export const revalidate = 60;

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

const PLATFORMS = [
  { platform: "macOS", detail: "Apple silicon and Intel" },
  { platform: "Windows", detail: "64-bit installer" },
  { platform: "Linux", detail: "AppImage, x64" },
] as const;

const STACK = [
  { name: "dashboard", role: "Next.js application" },
  { name: "worker", role: "Background indexing" },
  { name: "postgres", role: "Metadata, chats, citations" },
  { name: "opensearch", role: "Hybrid vector and keyword index" },
  { name: "redis", role: "Indexing queue" },
  { name: "minio", role: "Uploaded originals, or any S3 store" },
] as const;

/**
 * The front door.
 *
 * Headline, then the product itself in the tour, then what it does, where it
 * runs, and how to get it. Nothing on this page is promised that the product
 * does not do today.
 */
export default async function LandingPage() {
  const downloads = desktopDownloads();
  const published = await desktopDownloadsPublished();

  return (
    <>
      {/* Hero: one centred column, so the eye runs headline, promise, button.
          The product visual is the tour right below it. */}
      <Container className="pt-16 pb-14 sm:pt-24 sm:pb-20">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 text-center">
          <Heading as="h1" className="text-5xl leading-none tracking-hero sm:text-7xl lg:text-8xl">
            Ask your company.
            <br />
            See the evidence.
          </Heading>
          <Lead className="max-w-2xl sm:text-xl">
            Cited answers and source-backed charts from your private documents,
            on the models and servers you choose.
          </Lead>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" nativeButton={false} render={<a href={SIGN_UP_URL} />}>
              Create a workspace
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button variant="outline" size="lg" nativeButton={false} render={<Link href="/#self-host" />}>
              Self-host
            </Button>
          </div>
          <ul className="text-ink-03 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <HeroCheck>Your own model keys</HeroCheck>
            <HeroCheck>Runs in Docker</HeroCheck>
            <HeroCheck>Fully local with Ollama</HeroCheck>
          </ul>
          <ul className="flex items-center gap-2" aria-label="Supported model providers">
            {PROVIDERS.map((provider) => (
              <li key={provider.id} title={provider.label}>
                <ProviderLogo id={provider.id} label={provider.label} className="size-9 rounded-xl" />
                <span className="sr-only">{provider.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </Container>

      <ProductTour />

      {/* Facts: the ink band the tour's horizon resolves into */}
      <div className="dark bg-tint-01 text-foreground">
        <Container>
          <dl className="grid grid-cols-2 gap-y-8 py-12 md:grid-cols-4">
            {FACTS.map((fact) => (
              <div key={fact.label} className="flex flex-col gap-1 pr-6">
                <dd className="font-mono text-4xl font-medium tabular-nums">{fact.value}</dd>
                <dt className="text-ink-03 text-sm leading-5">{fact.label}</dt>
              </div>
            ))}
          </dl>
        </Container>
      </div>

      {/* Features */}
      <Section id="features">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
          <Eyebrow>Features</Eyebrow>
          <Heading className="text-4xl sm:text-5xl">Answers your team can check.</Heading>
          <Lead>
            Every answer and every number stays connected to the file it came
            from.
          </Lead>
        </div>

        <div className="mt-16">
          <FeatureCards />
        </div>

        <div className="mt-20 grid gap-10 border-t pt-12 md:grid-cols-3">
          <Claim
            icon={FileSearchIcon}
            title="Says when it does not know"
            body="Missing evidence is stated. Two documents that disagree are surfaced, not quietly resolved."
          />
          <Claim
            icon={LockIcon}
            title="Permissions before retrieval"
            body="Organization, team, or private visibility is enforced in the query. Admins do not read every team's documents."
          />
          <Claim
            icon={FilesIcon}
            title="The files you already have"
            body="PDF, DOCX, XLSX, CSV, Markdown, HTML, JSON, and text, up to 50 MB each, with page and sheet anchors."
          />
        </div>
      </Section>

      {/* Self-host, on ink */}
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

      {/* Download */}
      <Section id="download" className="bg-tint-01">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col items-start gap-6">
            <SectionIntro
              eyebrow="Desktop app"
              title="Onirix on your desktop."
              lead="Your workspace in its own window. Open models download and run on the same computer."
            />
            <div className="flex flex-wrap items-center gap-3">
              <DownloadButton downloads={downloads} published={published} />
              <Button variant="outline" size="lg" nativeButton={false} render={<Link href="/download" />}>
                All platforms
              </Button>
            </div>
          </div>

          <ul className="bg-card divide-y overflow-hidden rounded-2xl border">
            {PLATFORMS.map((entry) => (
              <li key={entry.platform} className="flex items-center justify-between gap-4 px-5 py-4">
                <span className="font-medium">{entry.platform}</span>
                <span className="text-ink-03 text-sm">{entry.detail}</span>
              </li>
            ))}
            <li className="text-ink-03 bg-tint-01 px-5 py-3 font-mono text-xs">
              A client for an Onirix server. Free.
            </li>
          </ul>
        </div>
      </Section>

      {/* Closing */}
      <Section
        backdrop={
          <div
            className="paper-grid absolute inset-0 mask-t-from-20% mask-t-to-90%"
            aria-hidden
          />
        }
      >
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <Heading className="text-4xl sm:text-5xl">Ask your first question.</Heading>
          <Lead>Create a workspace, connect a provider, upload a folder.</Lead>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" nativeButton={false} render={<a href={SIGN_UP_URL} />}>
              Create a workspace
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button variant="ghost" size="lg" nativeButton={false} render={<a href={SIGN_IN_URL} />}>
              Sign in
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}

function HeroCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <CheckIcon className="size-4 shrink-0" aria-hidden />
      {children}
    </li>
  );
}

function Claim({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Icon className="text-ink-03 size-5" strokeWidth={1.75} aria-hidden />
      <h3 className="text-lg font-semibold tracking-heading">{title}</h3>
      <p className="text-ink-03 leading-7">{body}</p>
    </div>
  );
}
