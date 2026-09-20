import type { Metadata } from "next";
import {
  ArrowRightIcon,
  DatabaseIcon,
  FileSearchIcon,
  FilesIcon,
  HistoryIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "@onirix/ui/lib/icons";

import { ClosingCta } from "@/components/closing-cta";
import { CtaLink } from "@/components/cta-link";
import { DownloadButton } from "@/components/download-button";
import { Faq } from "@/components/faq";
import { HomepageRail } from "@/components/homepage-rail";
import { PrivacySection } from "@/components/privacy-section";
import { ProductTour } from "@/components/product-tour";
import { ProviderMarkRow } from "@/components/provider-mark-row";
import {
  Container,
  HairlineCell,
  HairlineGrid,
  Heading,
  Lead,
  MediaPanel,
  Section,
  SectionIntro,
} from "@/components/section";
import { ChartMock, CitedAnswerMock, ModelsMock } from "@/components/showcase-mocks";
import { SplitShowcase } from "@/components/split-showcase";
import { SIGN_UP_URL } from "@/lib/app-url";
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
 * Headline and the product itself, then the reason the product exists
 * (privacy), then what it does, where it runs, and how to get it. The bands
 * alternate paper, ink, stone and sand so no two neighbours share a colour.
 * Nothing on this page is promised that the product does not do today.
 */
export default async function LandingPage() {
  const downloads = desktopDownloads();
  const published = await desktopDownloadsPublished();

  return (
    <>
      {/* Hero, on paper: left-aligned, a modest headline, and the product. */}
      <section id="overview" aria-labelledby="overview-heading" className="scroll-mt-14">
        <Container className="pt-10 pb-14 sm:pt-16 sm:pb-20">
          <div className="motion-safe:animate-rise-in">
            <ProviderMarkRow />
            <Heading
              as="h1"
              id="overview-heading"
              className="mt-8 text-3xl sm:mt-10 sm:text-4xl"
            >
              Ask your company. See the evidence.
            </Heading>
            <Lead className="mt-5">
              Private AI for your company&apos;s documents and databases. Cited
              answers, from the model you choose, on servers you control.
            </Lead>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <CtaLink href={SIGN_UP_URL}>
                Create a workspace
                <ArrowRightIcon className="size-4" aria-hidden />
              </CtaLink>
              <CtaLink href="/#self-host" variant="secondary">
                Self-host it
              </CtaLink>
            </div>
          </div>

          <div id="tour" className="mt-10 scroll-mt-20 sm:mt-14">
            <h2 className="sr-only">Onirix product tour</h2>
            <ProductTour />
          </div>
        </Container>
      </section>

      {/* Privacy, on ink */}
      <PrivacySection />

      {/* What it does, on paper */}
      <Section id="features" labelledBy="features-heading">
        <SectionIntro
          eyebrow="Features"
          title="Answers your team can check."
          titleId="features-heading"
          lead="Every answer and every number stays connected to the file it came from."
        />

        <div className="mt-4 divide-y">
          <SplitShowcase
            kicker="01 / citations"
            title="Open the passage behind a claim"
            description="Citation markers open the cited passage beside the answer, with a link to the original file. When two documents disagree, the answer says so."
            tone="sand"
          >
            <CitedAnswerMock />
          </SplitShowcase>

          <SplitShowcase
            kicker="02 / charts"
            title="Chart the numbers in your files"
            description="Spreadsheets and reports become bar, line, area, pie, or scatter charts. Each series cites its sheet, and you can open the table or copy the data."
            reverse
          >
            <ChartMock />
          </SplitShowcase>

          <SplitShowcase
            kicker="03 / models"
            title="Pick the model, change it later"
            description="Connect OpenAI, Anthropic, Google, xAI, or your own Ollama server. Enable several at once and set the default."
            tone="sand"
          >
            <ModelsMock />
          </SplitShowcase>
        </div>
      </Section>

      {/* The rest of the product, on stone */}
      <Section id="details" labelledBy="details-heading" className="bg-tint-01">
        <SectionIntro
          eyebrow="In the box"
          title="Built for the files a company really has."
          titleId="details-heading"
        />
        <HairlineGrid className="mt-12">
          <HairlineCell icon={FilesIcon} title="The formats you already use" aside="50 MB per file">
            PDF, Word, Excel, CSV, Markdown, HTML, JSON, and text, indexed with
            page and sheet anchors.
          </HairlineCell>
          <HairlineCell icon={RefreshCwIcon} title="Connected sources" aside="scheduled sync">
            Websites, Google Drive, OneDrive, and S3 buckets sync on a schedule,
            and only what changed is indexed again.
          </HairlineCell>
          <HairlineCell icon={DatabaseIcon} title="Databases, read-only" aside="PostgreSQL">
            Ask questions of a connected database. Each query is a single
            SELECT in a read-only transaction with a row cap and a timeout.
          </HairlineCell>
          <HairlineCell icon={FileSearchIcon} title="Says when it does not know">
            Missing evidence is stated, and sourced facts are kept apart from
            inference.
          </HairlineCell>
          <HairlineCell icon={HistoryIcon} title="Answers stay auditable">
            Cited passages are saved with the conversation, so last month&apos;s
            answer can still be checked after a reindex.
          </HairlineCell>
          <HairlineCell icon={ShieldCheckIcon} title="Roles apart from reading rights">
            Owner, admin, member, and custom roles govern administration.
            Reading a document depends on teams and visibility only.
          </HairlineCell>
        </HairlineGrid>
      </Section>

      {/* Self-host, on sand */}
      <Section id="self-host" labelledBy="self-host-heading" className="bg-wash-sand">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div className="flex flex-col items-start gap-8">
            <SectionIntro
              eyebrow="Self-hosting"
              title="Your infrastructure. Your model."
              titleId="self-host-heading"
              lead="One compose file brings up the application, its worker, and the four services they depend on."
            />
            <div className="flex flex-wrap gap-3">
              <CtaLink href="/security#hosting">Hosting and providers</CtaLink>
              <CtaLink href="/security" variant="secondary">
                Security overview
              </CtaLink>
            </div>
          </div>

          <MediaPanel tone="paper">
            <div className="bg-card overflow-hidden rounded-lg border sm:rounded-xl">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <span className="text-ink-03 font-mono text-xs">docker compose</span>
                <span className="text-success flex items-center gap-1.5 font-mono text-xs">
                  <span className="bg-success size-1.5 rounded-full" aria-hidden />
                  6 services
                </span>
              </div>
              <ul className="divide-y">
                {STACK.map((service) => (
                  <li key={service.name} className="flex items-baseline gap-4 px-4 py-3">
                    <span className="w-24 shrink-0 font-mono text-sm">{service.name}</span>
                    <span className="text-ink-03 text-sm">{service.role}</span>
                  </li>
                ))}
              </ul>
              <div className="bg-tint-01 flex items-center gap-2 border-t px-4 py-3 font-mono text-xs">
                <span className="text-ink-03">$</span>
                <span>pnpm run docker:up</span>
              </div>
            </div>
          </MediaPanel>
        </div>
      </Section>

      {/* Desktop app, on paper */}
      <Section id="download" labelledBy="download-heading">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div className="flex flex-col items-start gap-8">
            <SectionIntro
              eyebrow="Desktop app"
              title="Onirix on your desktop."
              titleId="download-heading"
              lead="Your workspace in its own window. Open models download and run on the same computer."
            />
            <div className="flex flex-wrap items-center gap-3">
              <DownloadButton downloads={downloads} published={published} />
              <CtaLink href="/download" variant="secondary">
                All platforms
              </CtaLink>
            </div>
          </div>

          <MediaPanel>
            <ul className="bg-card divide-y overflow-hidden rounded-lg border sm:rounded-xl">
              {PLATFORMS.map((entry) => (
                <li
                  key={entry.platform}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <span className="font-medium">{entry.platform}</span>
                  <span className="text-ink-03 text-sm">{entry.detail}</span>
                </li>
              ))}
              <li className="text-ink-03 bg-tint-01 px-5 py-3 font-mono text-xs">
                A client for an Onirix server. Free.
              </li>
            </ul>
          </MediaPanel>
        </div>
      </Section>

      {/* FAQ, on stone */}
      <Faq />

      {/* Closing, on ink */}
      <ClosingCta />

      <HomepageRail />
    </>
  );
}
