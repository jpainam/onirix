/**
 * Small formatters for the admin surfaces.
 *
 * Dates read as distance when recent and as a date when not, because "3
 * minutes ago" is what an admin watching a sync wants and "12 Mar" is what an
 * admin reading a history wants.
 */

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "never";
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDuration(from: Date | string | null | undefined, to: Date | string | null | undefined): string | null {
  if (!from || !to) return null;
  const start = typeof from === "string" ? new Date(from) : from;
  const end = typeof to === "string" ? new Date(to) : to;
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatCount(value: number): string {
  return value.toLocaleString();
}

/** The sync schedules the product offers, as minutes. Null is "only when asked". */
export const SYNC_INTERVALS: { value: number | null; label: string }[] = [
  { value: null, label: "Only when I ask" },
  { value: 60, label: "Every hour" },
  { value: 60 * 6, label: "Every 6 hours" },
  { value: 60 * 24, label: "Every day" },
  { value: 60 * 24 * 7, label: "Every week" },
];

export function formatInterval(minutes: number | null): string {
  const known = SYNC_INTERVALS.find((entry) => entry.value === minutes);
  if (known) return known.label;
  if (minutes === null) return "Only when asked";
  if (minutes % (60 * 24) === 0) return `Every ${minutes / (60 * 24)} days`;
  if (minutes % 60 === 0) return `Every ${minutes / 60} hours`;
  return `Every ${minutes} minutes`;
}
