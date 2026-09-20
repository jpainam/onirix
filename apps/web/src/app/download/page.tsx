import type { Metadata } from "next";
import { DownloadIcon, LaptopIcon, ServerIcon } from "@onirix/ui/lib/icons";

import { CtaLink } from "@/components/cta-link";
import { DownloadButton } from "@/components/download-button";
import { ModelSetupDemo } from "@/components/model-setup-demo";
import {
  Container,
  Eyebrow,
  HairlineCell,
  HairlineGrid,
  Heading,
  Lead,
  MediaPanel,
  Section,
  SectionIntro,
} from "@/components/section";
import {
  type DesktopDownload,
  desktopDownloads,
  desktopDownloadsPublished,
} from "@/lib/desktop-downloads";

export const metadata: Metadata = {
  title: "Download Onirix for desktop",
  description:
    "The Onirix desktop app for macOS, Windows, and Linux. Your workspace in its own window, with open models that run on your computer.",
};

// The availability check in desktop-downloads.ts keeps its own answer; the
// page re-renders often enough to pick up a release within a minute of it
// landing.
export const revalidate = 60;

/**
 * The desktop download page.
 *
 * It says what the app is before it says anything else, because the honest
 * description is also the one that prevents a bad install: this is a client
 * for an Onirix server, not a server in a box.
 */
export default async function DownloadPage() {
  const downloads = desktopDownloads();
  const published = await desktopDownloadsPublished();

  const platforms = ["macOS", "Windows", "Linux"].map((platform) => ({
    platform,
    files: downloads.filter((entry) => entry.platform === platform),
  }));

  return (
    <>
      {/* Hero, on paper */}
      <Container className="pt-10 pb-14 sm:pt-16 sm:pb-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div className="motion-safe:animate-rise-in flex flex-col items-start">
            <Eyebrow>Desktop app</Eyebrow>
            <Heading as="h1" className="mt-4 text-3xl sm:text-4xl">
              Onirix on your desktop.
            </Heading>
            <Lead className="mt-5">
              Your workspace in its own window. Open models download and run
              on the same computer.
            </Lead>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <DownloadButton downloads={downloads} published={published} />
              <CtaLink href="#all" variant="secondary">
                All platforms
              </CtaLink>
            </div>
            <p className="text-ink-03 mt-4 font-mono text-xs">macOS, Windows, Linux. Free.</p>
          </div>
          <MediaPanel>
            <ModelSetupDemo />
          </MediaPanel>
        </div>
      </Container>

      {/* Open models, on sand */}
      <Section id="models" labelledBy="models-heading" className="bg-wash-sand">
        <SectionIntro
          eyebrow="Open models"
          title="Two ways to bring a model."
          titleId="models-heading"
        />
        <HairlineGrid className="mt-12">
          <HairlineCell icon={LaptopIcon} title="Run it on this computer" aside="same machine">
            Pick a model and click Download. The app installs Ollama, pulls the
            model, and serves it. Nothing leaves the machine. Onirix has to be
            running on the same computer.
          </HairlineCell>
          <HairlineCell icon={ServerIcon} title="Point at a server" aside="any reachable address">
            Enter the address of an Ollama or OpenAI-compatible server. Onirix
            tests it from where it runs, then lists what it serves.
          </HairlineCell>
        </HairlineGrid>
      </Section>

      {/* Installers, on stone */}
      <Section id="all" labelledBy="all-heading" className="bg-tint-01">
        <SectionIntro eyebrow="Downloads" title="Pick your platform." titleId="all-heading" />
        <div className="mt-12 grid border-t md:grid-cols-3">
          {platforms.map(({ platform, files }) => (
            <div
              key={platform}
              className="flex flex-col gap-5 border-b py-6 md:border-r md:px-6 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
            >
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-medium">{platform}</h3>
                <p className="text-ink-03 text-sm">{files[0]?.requirement}</p>
              </div>
              <ul className="mt-auto flex flex-col gap-2">
                {files.map((file) => (
                  <li key={file.file}>
                    <FileLink file={file} published={published} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {published ? null : (
          <p className="text-ink-03 mt-6 text-sm">The first release is not published yet.</p>
        )}
      </Section>

      {/* What it is, on ink */}
      <Section labelledBy="client-heading" className="dark bg-tint-01 text-foreground">
        <div className="flex flex-col items-start gap-8">
          <SectionIntro
            eyebrow="What it is"
            title="A client, not a server."
            titleId="client-heading"
            lead="The app connects to an Onirix server: yours in Docker, or your team's. Accounts, documents, and permissions stay there."
          />
          <div className="flex flex-wrap gap-3">
            <CtaLink href="/#self-host">Self-host Onirix</CtaLink>
            <CtaLink href="/security" variant="secondary">
              Security overview
            </CtaLink>
          </div>
        </div>
      </Section>
    </>
  );
}

function FileLink({ file, published }: { file: DesktopDownload; published: boolean }) {
  if (!published) {
    return (
      <span className="text-ink-03 flex items-center justify-between gap-3 rounded-full border border-dashed px-5 py-2.5 text-sm">
        {file.variant}
        <span className="font-mono text-xs">Coming soon</span>
      </span>
    );
  }
  return (
    <a
      href={file.href}
      download
      className="bg-card hover:bg-tint-02 flex items-center justify-between gap-3 rounded-full border px-5 py-2.5 text-sm font-medium transition-colors"
    >
      {file.variant}
      <DownloadIcon className="text-ink-03 size-4" aria-hidden />
    </a>
  );
}
