"use client";

import { DownloadIcon } from "@onirix/ui/lib/icons";
import { useSyncExternalStore } from "react";

import { CtaLink, CtaPlaceholder } from "@/components/cta-link";
import type { DesktopDownload, DesktopOs } from "@/lib/desktop-downloads";

function detectOs(): DesktopOs {
  const agent = navigator.userAgent;
  if (/Windows/i.test(agent)) return "windows";
  if (/Linux|X11/i.test(agent) && !/Android/i.test(agent)) return "linux";
  return "mac";
}

const subscribe = () => () => {};

/**
 * The one download button, for the visitor's own platform.
 *
 * The server cannot know the platform, so it renders the macOS build and the
 * client corrects it after hydration. A browser does not reveal whether a Mac
 * is Apple silicon or Intel; the button offers Apple silicon, which is every
 * Mac sold since 2020, and the full list sits right below for the rest.
 */
export function DownloadButton({
  downloads,
  published,
}: {
  downloads: DesktopDownload[];
  published: boolean;
}) {
  const os = useSyncExternalStore<DesktopOs>(subscribe, detectOs, () => "mac");
  const download = downloads.find((entry) => entry.os === os) ?? downloads[0];

  if (!download || !published) {
    return <CtaPlaceholder>Coming soon</CtaPlaceholder>;
  }

  return (
    <CtaLink href={download.href} download>
      <DownloadIcon className="size-4" aria-hidden />
      Download for {download.platform}
    </CtaLink>
  );
}
