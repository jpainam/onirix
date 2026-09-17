/**
 * The desktop installers the public site links to.
 *
 * File names are fixed by apps/desktop/electron-builder.yml and carry no
 * version, so "latest" is a stable URL and this list never needs a release to
 * touch it.
 */
import { env } from "@/env.server";

export type DesktopOs = "mac" | "windows" | "linux";

export type DesktopDownload = {
  os: DesktopOs;
  /** The platform, as a heading. */
  platform: string;
  /** What distinguishes this file from others for the same platform. */
  variant: string;
  requirement: string;
  file: string;
  href: string;
};

const FILES = [
  {
    os: "mac",
    platform: "macOS",
    variant: "Apple silicon",
    requirement: "macOS 12 or later",
    file: "Onirix-mac-arm64.dmg",
  },
  {
    os: "mac",
    platform: "macOS",
    variant: "Intel",
    requirement: "macOS 12 or later",
    file: "Onirix-mac-x64.dmg",
  },
  {
    os: "windows",
    platform: "Windows",
    variant: "64-bit installer",
    requirement: "Windows 10 or later",
    file: "Onirix-win-x64.exe",
  },
  {
    os: "linux",
    platform: "Linux",
    variant: "AppImage, x64",
    requirement: "Any recent distribution",
    file: "Onirix-linux-x64.AppImage",
  },
] as const;

export function desktopDownloads(): DesktopDownload[] {
  const base = env.DESKTOP_DOWNLOAD_URL.replace(/\/+$/, "");
  return FILES.map((entry) => ({ ...entry, href: `${base}/${entry.file}` }));
}

/**
 * Whether the installers are actually there to download.
 *
 * A fresh deployment, or one whose release job has not run yet, would
 * otherwise put four buttons on a public page that all lead to a 404. One
 * HEAD request, cached for an hour, is what it costs to not do that.
 */
export async function desktopDownloadsPublished(): Promise<boolean> {
  const [first] = desktopDownloads();
  if (!first) return false;
  try {
    const response = await fetch(first.href, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 3600 },
    });
    return response.ok;
  } catch {
    return false;
  }
}
