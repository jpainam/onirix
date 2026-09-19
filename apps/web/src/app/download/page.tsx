import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon, LaptopIcon, ServerIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@onirix/ui/components/button";

import { DownloadButton } from "@/components/marketing/download-button";
import { ModelSetupDemo } from "@/components/marketing/model-setup-demo";
import {
  Container,
  Heading,
  Lead,
  Section,
  SectionIntro,
} from "@/components/marketing/section";
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
      <div className="relative overflow-hidden">
        <div
          className="paper-grid absolute inset-0 mask-b-from-30% mask-b-to-95%"
          aria-hidden
        />
        <Container className="relative pt-20 pb-16 sm:pt-28 sm:pb-20">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="flex flex-col items-start gap-6">
              <span className="bg-card text-ink-03 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs tracking-widest uppercase">
                Desktop app
              </span>
              <Heading as="h1" className="text-4xl leading-none tracking-hero sm:text-6xl">
                Onirix on your desktop.
              </Heading>
              <Lead>
                Your workspace in its own window. Open models download and run
                on the same computer.
              </Lead>
              <div className="flex flex-wrap items-center gap-3">
                <DownloadButton downloads={downloads} published={published} />
                <Button variant="outline" size="lg" nativeButton={false} render={<Link href="#all" />}>
                  All platforms
                </Button>
              </div>
              <p className="text-ink-02 font-mono text-xs">macOS, Windows, Linux. Free.</p>
            </div>
            <ModelSetupDemo />
          </div>
        </Container>
      </div>

      <Section id="models" className="bg-wash-sand">
        <SectionIntro eyebrow="Open models" title="Two ways to bring a model." />
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border md:grid-cols-2">
          <Way
            icon={LaptopIcon}
            title="Run it on this computer"
            body="Pick a model and click Download. The app installs Ollama, pulls the model, and serves it. Nothing leaves the machine."
            note="Needs Onirix running on the same computer"
          />
          <Way
            icon={ServerIcon}
            title="Point at a server"
            body="Enter the address of an Ollama or OpenAI-compatible server. Onirix tests it from where it runs, then lists what it serves."
            note="Any address your Onirix server can reach"
          />
        </div>
      </Section>

      <Section id="all">
        <SectionIntro eyebrow="Downloads" title="Pick your platform." />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {platforms.map(({ platform, files }) => (
            <div key={platform} className="bg-card flex flex-col gap-5 rounded-2xl border p-6">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold tracking-heading">{platform}</h3>
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
          <p className="text-ink-03 mt-6 text-sm">
            The first release is not published yet.
          </p>
        )}
      </Section>

      <Section className="dark bg-tint-01 text-foreground">
        <div className="flex max-w-2xl flex-col gap-6">
          <SectionIntro
            eyebrow="What it is"
            title="A client, not a server."
            lead="The app connects to an Onirix server: yours in Docker, or your team's. Accounts, documents, and permissions stay there."
          />
          <div className="flex flex-wrap gap-3">
            <Button nativeButton={false} render={<Link href="/#self-host" />}>
              Self-host Onirix
            </Button>
            <Button variant="secondary" nativeButton={false} render={<Link href="/security" />}>
              Security overview
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}

function FileLink({ file, published }: { file: DesktopDownload; published: boolean }) {
  if (!published) {
    return (
      <span className="text-ink-02 flex items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 text-sm">
        {file.variant}
        <span className="font-mono text-xs">Coming soon</span>
      </span>
    );
  }
  return (
    <a
      href={file.href}
      download
      className="hover:bg-tint-01 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors"
    >
      {file.variant}
      <DownloadIcon className="text-ink-03 size-4" aria-hidden />
    </a>
  );
}

function Way({
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
      <span className="bg-tint-02 text-ink-04 flex size-10 items-center justify-center rounded-xl">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <h3 className="text-lg font-semibold tracking-heading">{title}</h3>
      <p className="text-ink-03 text-sm leading-6">{body}</p>
      <p className="text-ink-02 mt-auto border-t pt-4 font-mono text-xs">{note}</p>
    </div>
  );
}
