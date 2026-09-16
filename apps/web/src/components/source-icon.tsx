import {
  ArchiveIcon,
  CloudIcon,
  DatabaseIcon,
  FolderIcon,
  GlobeIcon,
  type LucideIcon,
  UploadIcon,
} from "lucide-react";

import { cn } from "@onirix/ui/lib/utils";

import { ProviderLogo } from "@/components/provider-logo";

/**
 * How each kind of source is named and drawn across the admin surfaces.
 *
 * The keys are `source.type` values. Kinds the schema reserves but nothing
 * connects yet are left out on purpose: a label with no connector behind it
 * is a promise the page cannot keep.
 */
export const SOURCE_KINDS: Record<string, { label: string; icon: LucideIcon; logo?: string }> = {
  file_upload: { label: "File uploads", icon: UploadIcon },
  website: { label: "Website", icon: GlobeIcon },
  google_drive: { label: "Google Drive", icon: FolderIcon, logo: "google" },
  onedrive: { label: "OneDrive", icon: CloudIcon },
  s3: { label: "Amazon S3", icon: ArchiveIcon },
  postgres: { label: "PostgreSQL", icon: DatabaseIcon },
};

export function sourceKindLabel(type: string): string {
  return SOURCE_KINDS[type]?.label ?? type.replaceAll("_", " ");
}

export function sourceKindIcon(type: string): LucideIcon {
  return SOURCE_KINDS[type]?.icon ?? DatabaseIcon;
}

/** The tile that stands for a source in a list: its brand mark when we have one, a glyph otherwise. */
export function SourceIcon({ type, className }: { type: string; className?: string }) {
  const kind = SOURCE_KINDS[type];
  if (kind?.logo) {
    return <ProviderLogo id={kind.logo} label={kind.label} className={className} />;
  }
  const Icon = kind?.icon ?? DatabaseIcon;
  return (
    <span
      className={cn(
        "bg-tint-02 text-ink-04 flex size-7 shrink-0 items-center justify-center rounded-lg",
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}
