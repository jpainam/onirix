"use client"

// A two-pane browser for downloadable models: the list on the left, the
// chosen model and its download on the right. Shared by the dashboard (models
// land on the workspace's Ollama) and the desktop app (models land on this
// computer), so it knows nothing about where a download goes: it draws state
// it is handed and reports clicks.

import * as React from "react"
import {
  BrainIcon,
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  InfoIcon,
  SearchIcon,
  Trash2Icon,
  WrenchIcon,
  XIcon,
  type LucideIcon,
} from "@onirix/ui/lib/icons"
import { cn } from "cn"

import { PublisherLogo, hasPublisherLogo } from "@onirix/ui/brand/publisher-logo"
import { Badge } from "@onirix/ui/components/badge"
import { Button } from "@onirix/ui/components/button"
import { Input } from "@onirix/ui/components/input"

export type BrowserCapability = "vision" | "tools" | "reasoning"

/**
 * Only `id` and `label` are required: a model found on disk that no catalog
 * describes is still listed, with whatever is known about it.
 */
export type BrowserModel = {
  id: string
  label: string
  publisher?: string
  summary?: string
  description?: string
  parameters?: string
  contextTokens?: number
  capabilities?: BrowserCapability[]
  downloadGb?: number
  license?: string
  /** `YYYY-MM`. */
  released?: string
  /** `owner/name` on Hugging Face. */
  huggingFace?: string
  /** False for a model no library page exists for. */
  inLibrary?: boolean
}

export type BrowserProgress = {
  status: string
  completedBytes: number
  totalBytes: number
}

export type BrowserBlocked = {
  message: React.ReactNode
  action?: React.ReactNode
}

export type BrowserModelState = {
  /** Size on disk once downloaded, null while it is not. */
  installedBytes: number | null
  progress: BrowserProgress | null
}

const CAPABILITIES: Record<BrowserCapability, { label: string; icon: LucideIcon }> = {
  vision: { label: "Vision", icon: EyeIcon },
  tools: { label: "Tools", icon: WrenchIcon },
  reasoning: { label: "Reasoning", icon: BrainIcon },
}

function gigabytes(bytes: number): string {
  const gb = bytes / 1e9
  return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`
}

function contextLabel(tokens: number): string {
  return `${Math.round(tokens / 1024)}K tokens`
}

function releasedLabel(released: string): string {
  const [year, month] = released.split("-").map(Number)
  if (!year || !month) return released
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })
}

/**
 * The publisher's mark on a tile. A model from someone we have no mark for,
 * or one found on disk with no publisher at all, gets its first letter.
 */
function ModelTile({
  model,
  className,
  logoClassName,
}: {
  model: BrowserModel
  className?: string
  logoClassName?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-tint-02 text-ink-05 flex shrink-0 items-center justify-center rounded-lg font-semibold",
        className
      )}
    >
      {model.publisher && hasPublisherLogo(model.publisher) ? (
        <PublisherLogo publisher={model.publisher} className={logoClassName} />
      ) : (
        model.label.slice(0, 1).toUpperCase()
      )}
    </span>
  )
}

function DownloadProgress({ label, progress }: { label: string; progress: BrowserProgress }) {
  const known = progress.totalBytes > 0
  const percent = known
    ? Math.min(100, Math.round((progress.completedBytes / progress.totalBytes) * 100))
    : 0
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? percent : undefined}
        aria-label={`Downloading ${label}`}
        className="bg-tint-03 h-1 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-ink-03 font-figure truncate text-xs">
        {known
          ? `${gigabytes(progress.completedBytes)} of ${gigabytes(progress.totalBytes)} (${percent}%)`
          : progress.status || "Starting"}
      </span>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5 text-sm">
      <dt className="text-ink-03 shrink-0">{label}</dt>
      <dd className="min-w-0 text-right select-text">{children}</dd>
    </div>
  )
}

export function ModelBrowser({
  models,
  stateOf,
  destination,
  blocked,
  readOnly = false,
  error,
  onDownload,
  onCancel,
  onRemove,
  removeBlocked,
  rowBadge,
  installedActions,
  className,
}: {
  models: BrowserModel[]
  stateOf: (id: string) => BrowserModelState
  /** Where a download lands, as a sentence: "Downloads to this computer." */
  destination: string
  /**
   * Set when nothing can be downloaded yet. It is said once, across the top of
   * the page, with the way to fix it; every Download button stays in view but
   * disabled, so it is plain that the step is one for the page and not one per
   * model.
   */
  blocked?: BrowserBlocked | null
  /** Someone who may look but not download or remove. */
  readOnly?: boolean
  error?: string | null
  onDownload: (id: string) => void
  onCancel: (id: string) => void
  onRemove: (id: string) => void
  /** Why a downloaded model cannot be removed right now, if it cannot. */
  removeBlocked?: (id: string) => string | null
  /** A status pill for the list row: "In use", "Enabled". */
  rowBadge?: (id: string) => React.ReactNode
  /** What can be done with a model once it is on disk. */
  installedActions?: (model: BrowserModel) => React.ReactNode
  className?: string
}) {
  const [query, setQuery] = React.useState("")
  const [onlyDownloaded, setOnlyDownloaded] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const needle = query.trim().toLowerCase()
  const visible = models.filter((model) => {
    if (onlyDownloaded && stateOf(model.id).installedBytes === null) return false
    if (!needle) return true
    return [model.label, model.id, model.publisher, model.summary]
      .filter(Boolean)
      .some((text) => text!.toLowerCase().includes(needle))
  })

  const selected =
    visible.find((model) => model.id === selectedId) ??
    models.find((model) => model.id === selectedId) ??
    visible[0] ??
    null
  const downloadedCount = models.filter(
    (model) => stateOf(model.id).installedBytes !== null
  ).length

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {blocked ? (
        <div
          role="status"
          className="bg-info-subtle flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3"
        >
          <InfoIcon className="text-info size-5 shrink-0" />
          <p className="min-w-0 flex-1 basis-64 text-sm select-text">{blocked.message}</p>
          {blocked.action}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex max-h-72 min-h-0 shrink-0 flex-col border-b md:max-h-none md:w-80 md:border-r md:border-b-0">
          <div className="flex flex-col gap-2 p-3">
            <div className="relative">
              <SearchIcon className="text-ink-03 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models"
                aria-label="Search models"
                className="pl-9"
              />
            </div>
            <div className="flex gap-1" role="group" aria-label="Filter models">
              {(
                [
                  [false, `All (${models.length})`],
                  [true, `Downloaded (${downloadedCount})`],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={label}
                  variant={onlyDownloaded === value ? "secondary" : "muted"}
                  size="sm"
                  className="rounded-full"
                  aria-pressed={onlyDownloaded === value}
                  onClick={() => setOnlyDownloaded(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {visible.length === 0 ? (
              <li className="text-ink-03 px-3 py-6 text-center text-sm">
                {onlyDownloaded && !needle ? "Nothing downloaded yet." : "No model matches."}
              </li>
            ) : null}
            {visible.map((model) => {
              const state = stateOf(model.id)
              const active = selected?.id === model.id
              return (
                <li key={model.id}>
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    onClick={() => setSelectedId(model.id)}
                    className={cn(
                      "focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-3 motion-reduce:transition-none",
                      active ? "bg-tint-02" : "hover:bg-tint-01"
                    )}
                  >
                    <ModelTile model={model} className="size-9 text-sm" logoClassName="size-5" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{model.label}</span>
                        {state.installedBytes !== null ? (
                          <CheckIcon
                            className="text-success size-3.5 shrink-0"
                            aria-label="Downloaded"
                          />
                        ) : null}
                      </span>
                      <span className="text-ink-03 truncate text-xs">
                        {state.progress
                          ? "Downloading"
                          : (model.summary ?? model.id)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {rowBadge?.(model.id)}
                      <span className="text-ink-03 font-figure text-xs">
                        {state.installedBytes !== null
                          ? gigabytes(state.installedBytes)
                          : model.downloadGb
                            ? `${model.downloadGb} GB`
                            : ""}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {selected ? (
            <ModelDetails
              key={selected.id}
              model={selected}
              state={stateOf(selected.id)}
              destination={destination}
              blocked={Boolean(blocked)}
              readOnly={readOnly}
              error={error}
              removeBlocked={removeBlocked?.(selected.id) ?? null}
              onDownload={() => onDownload(selected.id)}
              onCancel={() => onCancel(selected.id)}
              onRemove={() => onRemove(selected.id)}
              actions={installedActions?.(selected)}
            />
          ) : (
            <p className="text-ink-03 p-8 text-sm">Choose a model to see what it is.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function ModelDetails({
  model,
  state,
  destination,
  blocked,
  readOnly,
  error,
  removeBlocked,
  onDownload,
  onCancel,
  onRemove,
  actions,
}: {
  model: BrowserModel
  state: BrowserModelState
  destination: string
  blocked: boolean
  readOnly: boolean
  error: string | null | undefined
  removeBlocked: string | null
  onDownload: () => void
  onCancel: () => void
  onRemove: () => void
  actions: React.ReactNode
}) {
  const installed = state.installedBytes !== null
  const capabilities = model.capabilities ?? []

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 md:p-8">
      <header className="flex items-center gap-4">
        <ModelTile model={model} className="size-14 rounded-xl text-xl" logoClassName="size-8" />
        <div className="flex min-w-0 flex-col">
          <h2 className="tracking-display truncate text-2xl font-semibold">{model.label}</h2>
          <span className="text-ink-03 truncate text-sm select-text">
            {[model.publisher, model.id].filter(Boolean).join(" · ")}
          </span>
        </div>
      </header>

      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium">
              {installed ? "Downloaded" : state.progress ? "Downloading" : "Download"}
            </span>
            <span className="text-ink-03 text-xs">
              {installed
                ? `${gigabytes(state.installedBytes ?? 0)} on disk`
                : [model.downloadGb ? `About ${model.downloadGb} GB` : null, destination]
                    .filter(Boolean)
                    .join(". ")}
            </span>
          </div>

          {state.progress ? (
            <div className="flex w-full items-center gap-2 sm:w-72">
              <DownloadProgress label={model.label} progress={state.progress} />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Cancel downloading ${model.label}`}
                onClick={onCancel}
              >
                <XIcon />
              </Button>
            </div>
          ) : installed ? (
            <div className="flex shrink-0 items-center gap-1">
              {actions}
              {readOnly ? null : (
                <Button
                  variant="destructive"
                  size="icon-sm"
                  aria-label={`Remove ${model.label}`}
                  title={removeBlocked ?? "Remove from disk"}
                  disabled={removeBlocked !== null}
                  onClick={onRemove}
                >
                  <Trash2Icon />
                </Button>
              )}
            </div>
          ) : readOnly ? null : (
            <Button
              className="shrink-0 rounded-full px-4"
              disabled={blocked}
              onClick={onDownload}
            >
              <DownloadIcon />
              Download{model.downloadGb ? ` ${model.downloadGb} GB` : ""}
            </Button>
          )}
        </div>

        {error ? (
          <p className="text-destructive text-sm select-text" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {model.description ? (
        <p className="text-ink-04 text-sm leading-6 select-text">{model.description}</p>
      ) : null}

      <dl className="bg-card divide-y rounded-xl border">
        {model.parameters ? <Fact label="Parameters">{model.parameters}</Fact> : null}
        {model.contextTokens ? (
          <Fact label="Context">{contextLabel(model.contextTokens)}</Fact>
        ) : null}
        {capabilities.length > 0 ? (
          <Fact label="Capabilities">
            <span className="flex flex-wrap justify-end gap-1">
              {capabilities.map((capability) => {
                const { label, icon: Icon } = CAPABILITIES[capability]
                return (
                  <Badge key={capability} variant="muted">
                    <Icon />
                    {label}
                  </Badge>
                )
              })}
            </span>
          </Fact>
        ) : null}
        {model.license ? <Fact label="License">{model.license}</Fact> : null}
        {model.released ? <Fact label="Released">{releasedLabel(model.released)}</Fact> : null}
        <Fact label="Runs on">Ollama</Fact>
      </dl>

      <div className="flex flex-wrap gap-2">
        {model.inLibrary === false ? null : (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            nativeButton={false}
            render={
              <a
                href={`https://ollama.com/library/${model.id}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            Ollama library
            <ExternalLinkIcon />
          </Button>
        )}
        {model.huggingFace ? (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            nativeButton={false}
            render={
              <a
                href={`https://huggingface.co/${model.huggingFace}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            Hugging Face
            <ExternalLinkIcon />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
