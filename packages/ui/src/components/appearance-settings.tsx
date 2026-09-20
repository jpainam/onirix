"use client"

// The layout of this screen (mode cards drawn as miniature windows, then one
// panel of rows per theme) is adapted from Synara (MIT),
// Copyright (c) 2026 T3 Tools Inc. and Emanuele Di Pietro.

import * as React from "react"
import { RotateCcwIcon } from "@onirix/ui/lib/icons"
import { cn } from "cn"

import { Button } from "@onirix/ui/components/button"
import { Input } from "@onirix/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@onirix/ui/components/select"
import { Slider } from "@onirix/ui/components/slider"
import {
  DEFAULT_APPEARANCE,
  THEME_PRESETS,
  applyStoredAppearance,
  parseThemeChoice,
  readStoredAppearance,
  sameChoice,
  sanitizeFont,
  saveAppearance,
  type Appearance,
  type TextSize,
  type ThemeChoice,
  type ThemeMode,
  type ThemeVariant,
} from "@onirix/ui/lib/appearance"

/* -------------------------------------------------------------------------- */
/* One shared copy of the choice, so the screen and a "Restore defaults"      */
/* button placed in a page header elsewhere stay in step.                      */
/* -------------------------------------------------------------------------- */

let current: Appearance | null = null
const listeners = new Set<() => void>()

function getAppearance(): Appearance {
  current ??= readStoredAppearance()
  return current
}

function setAppearance(next: Appearance) {
  current = next
  saveAppearance(next)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function useAppearance(): Appearance {
  return React.useSyncExternalStore(
    subscribe,
    getAppearance,
    // The server has no storage to read; the client corrects it on hydration.
    () => DEFAULT_APPEARANCE
  )
}

function usePrefersDark(): boolean {
  return React.useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia("(prefers-color-scheme: dark)")
      query.addEventListener("change", listener)
      return () => query.removeEventListener("change", listener)
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false
  )
}

/* -------------------------------------------------------------------------- */
/* Mode cards                                                                  */
/* -------------------------------------------------------------------------- */

// The miniatures show a fixed rendering of each mode. They have to look light
// and dark whatever colours the person has chosen, so they are drawn in fixed
// greys rather than from the theme's own tokens.
const MOCKUP: Record<ThemeVariant, Record<string, string>> = {
  light: {
    backdrop: "#e9e9e9",
    panel: "#f6f6f6",
    bar: "#cfcfcf",
    barSoft: "#e0e0e0",
    card: "#ffffff",
    row: "#e3e3e3",
    line: "#efefef",
  },
  dark: {
    backdrop: "#5f5f5f",
    panel: "#2c2c2c",
    bar: "#a6a6a6",
    barSoft: "#7d7d7d",
    card: "#3a3a3a",
    row: "#707070",
    line: "#4d4d4d",
  },
}

function MockupSurface({ variant }: { variant: ThemeVariant }) {
  const colors = MOCKUP[variant]
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{ backgroundColor: colors.backdrop }}
    >
      <div
        className="absolute inset-x-[8%] top-[14%] bottom-0 flex flex-col rounded-t-lg"
        style={{ backgroundColor: colors.panel }}
      >
        <div className="flex flex-col items-center gap-1 pt-[9%]">
          <div
            className="h-1 w-[38%] rounded-full"
            style={{ backgroundColor: colors.bar }}
          />
          <div
            className="h-[3px] w-[55%] rounded-full"
            style={{ backgroundColor: colors.barSoft }}
          />
        </div>
        <div
          className="mx-[9%] mt-[7%] min-h-0 flex-1 rounded-t-md"
          style={{ backgroundColor: colors.card }}
        >
          {[0, 1, 2].map((row) => (
            <div key={row} className="px-[10%] pt-[7%]">
              <div
                className="h-1 w-[36%] rounded-full"
                style={{ backgroundColor: colors.row }}
              />
              <div
                className="mt-[7%] h-px w-full"
                style={{ backgroundColor: colors.line }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const MODES: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

function ThemeModePicker({
  value,
  onValueChange,
}: {
  value: ThemeMode
  onValueChange: (value: ThemeMode) => void
}) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0
    if (step === 0) return
    event.preventDefault()
    const index = MODES.findIndex((mode) => mode.value === value)
    const next = MODES[(index + step + MODES.length) % MODES.length]!
    onValueChange(next.value)
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-mode="${next.value}"]`)
      ?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid w-full grid-cols-3 gap-3"
      onKeyDown={handleKeyDown}
    >
      {MODES.map((mode) => {
        const active = mode.value === value
        return (
          <button
            key={mode.value}
            type="button"
            role="radio"
            data-mode={mode.value}
            aria-checked={active}
            // One stop for the group; the arrow keys move within it.
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(mode.value)}
            className="group flex min-w-0 flex-col items-center gap-1.5 outline-none"
          >
            <div
              className={cn(
                "w-full rounded-[14px] border-2 p-[3px] transition-colors group-focus-visible:ring-[3px] group-focus-visible:ring-ring/50 motion-reduce:transition-none",
                active ? "border-foreground" : "border-transparent"
              )}
            >
              <div className="relative aspect-[10/7] w-full overflow-hidden rounded-[10px]">
                {mode.value === "system" ? (
                  <>
                    <MockupSurface variant="light" />
                    {/* The dark half is mirrored, so both halves keep their
                        rows in view after the split down the middle. */}
                    <div
                      className="absolute inset-0"
                      style={{ clipPath: "inset(0 0 0 50%)" }}
                    >
                      <div className="absolute inset-0 -scale-x-100">
                        <MockupSurface variant="dark" />
                      </div>
                    </div>
                  </>
                ) : (
                  <MockupSurface variant={mode.value} />
                )}
              </div>
            </div>
            <span
              className={cn(
                "text-sm",
                active ? "font-medium text-ink-05" : "text-ink-03"
              )}
            >
              {mode.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Theme panels                                                                */
/* -------------------------------------------------------------------------- */

/** Black or white, whichever reads on the given colour. */
function readableOn(hex: string): string {
  const channel = (start: number) => parseInt(hex.slice(start, start + 2), 16)
  const luminance =
    (0.299 * channel(1) + 0.587 * channel(3) + 0.114 * channel(5)) / 255
  return luminance > 0.6 ? "#000000" : "#ffffff"
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-t px-5 py-2.5">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const ink = readableOn(value)
  return (
    // The pill is the swatch: it is filled with the colour it sets, and the
    // platform's own colour picker opens from anywhere on it.
    <label
      className="relative flex h-9 w-48 cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 font-mono text-sm uppercase focus-within:ring-[3px] focus-within:ring-ring/50"
      style={{ backgroundColor: value, color: ink }}
    >
      <span
        aria-hidden
        className="size-4 shrink-0 rounded-full border"
        style={{ borderColor: ink, backgroundColor: value }}
      />
      {value}
      <input
        type="color"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  )
}

function ThemePanel({
  variant,
  active,
  lockedTo,
  choice,
  onChange,
}: {
  variant: ThemeVariant
  active: boolean
  /** The mode the app is pinned to, when that is why this panel is idle. */
  lockedTo: ThemeVariant | null
  choice: ThemeChoice
  onChange: (choice: ThemeChoice) => void
}) {
  const presets = THEME_PRESETS[variant]
  const preset = presets.find((entry) => sameChoice(entry.choice, choice))
  const [notice, setNotice] = React.useState<string | null>(null)
  const title = variant === "light" ? "Light theme" : "Dark theme"

  // A font is applied as it is typed, so it is cleaned as it is typed too.
  const set = (patch: Partial<ThemeChoice>) => onChange({ ...choice, ...patch })

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(choice, null, 2))
      setNotice("Copied.")
    } catch {
      setNotice("Could not reach the clipboard.")
    }
  }

  async function importFromClipboard() {
    try {
      const parsed = parseThemeChoice(
        await navigator.clipboard.readText(),
        variant
      )
      if (!parsed) return setNotice("The clipboard does not hold a theme.")
      onChange(parsed)
      setNotice("Imported.")
    } catch {
      setNotice("Could not reach the clipboard.")
    }
  }

  return (
    <section
      aria-label={title}
      className="overflow-hidden rounded-2xl border bg-tint-01"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pt-4">
        <h3 className="mr-auto text-base font-medium">{title}</h3>
        <button
          type="button"
          onClick={() => void importFromClipboard()}
          className="text-sm text-ink-03 transition-colors hover:text-ink-05"
        >
          Import
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          className="text-sm text-ink-03 transition-colors hover:text-ink-05"
        >
          Copy
        </button>
        <Select
          value={preset?.id ?? "custom"}
          onValueChange={(id) => {
            const next = presets.find((entry) => entry.id === id)
            if (next) onChange(next.choice)
          }}
        >
          <SelectTrigger className="w-40 bg-background" aria-label="Preset">
            <SelectValue>{preset?.label ?? "Custom"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {presets.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="px-5 pt-2 pb-4 text-sm text-ink-03" aria-live="polite">
        {notice ??
          (active
            ? "This is the active theme right now."
            : lockedTo
              ? `Inactive while the app is locked to ${lockedTo}.`
              : "Inactive while your system is set the other way.")}
      </p>

      <Row label="Accent">
        <ColorField
          label={`${title} accent`}
          value={choice.accent}
          onChange={(accent) => set({ accent })}
        />
      </Row>
      <Row label="Background">
        <ColorField
          label={`${title} background`}
          value={choice.background}
          onChange={(background) => set({ background })}
        />
      </Row>
      <Row label="Foreground">
        <ColorField
          label={`${title} foreground`}
          value={choice.foreground}
          onChange={(foreground) => set({ foreground })}
        />
      </Row>
      <Row label="UI font">
        <Input
          value={choice.uiFont}
          onChange={(event) => set({ uiFont: sanitizeFont(event.target.value) })}
          placeholder="System default"
          aria-label={`${title} UI font`}
          className="w-64 bg-background"
        />
      </Row>
      <Row label="Code font">
        <Input
          value={choice.codeFont}
          onChange={(event) =>
            set({ codeFont: sanitizeFont(event.target.value) })
          }
          placeholder={'"JetBrains Mono"'}
          aria-label={`${title} code font`}
          className="w-64 bg-background"
        />
      </Row>
      <Row label="Contrast">
        <div className="flex w-64 items-center gap-4">
          <Slider
            value={[choice.contrast]}
            min={0}
            max={100}
            step={5}
            aria-label={`${title} contrast`}
            onValueChange={(value) =>
              set({ contrast: Array.isArray(value) ? (value[0] ?? 0) : value })
            }
          />
          <span className="w-8 text-right font-mono text-sm tabular-nums text-ink-03">
            {choice.contrast}
          </span>
        </div>
      </Row>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                  */
/* -------------------------------------------------------------------------- */

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
]

/** Puts the colours, fonts, contrast and text size back; the mode is left. */
function RestoreAppearanceButton() {
  return (
    <Button variant="outline" onClick={() => setAppearance(DEFAULT_APPEARANCE)}>
      <RotateCcwIcon data-icon="inline-start" />
      Restore defaults
    </Button>
  )
}

function AppearanceSettings({
  mode,
  onModeChange,
  heading = true,
}: {
  /**
   * Light, dark, or following the system. Owned by the caller, since each app
   * already has its own way of holding it (next-themes, the desktop shell).
   */
  mode: ThemeMode
  onModeChange: (mode: ThemeMode) => void
  /** Off where the page supplies its own title and places the restore button. */
  heading?: boolean
}) {
  const appearance = useAppearance()
  const prefersDark = usePrefersDark()
  const showing: ThemeVariant =
    mode === "system" ? (prefersDark ? "dark" : "light") : mode

  return (
    <div className="flex flex-col gap-6">
      {heading ? (
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium tracking-display">Appearance</h1>
            <p className="mt-2 text-ink-03">
              Customize the theme, typography and contrast.
            </p>
          </div>
          <RestoreAppearanceButton />
        </header>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm text-ink-02">Theme</h2>
          <button
            type="button"
            onClick={() => onModeChange("system")}
            aria-label="Follow the system theme"
            title="Follow the system theme"
            className="flex size-6 items-center justify-center rounded-md text-ink-02 transition-colors hover:bg-tint-02 hover:text-ink-04"
          >
            <RotateCcwIcon className="size-3.5" />
          </button>
        </div>
        <ThemeModePicker value={mode} onValueChange={onModeChange} />
      </div>

      {(["light", "dark"] as const).map((variant) => (
        <ThemePanel
          key={variant}
          variant={variant}
          active={showing === variant}
          lockedTo={mode === "system" ? null : mode}
          choice={appearance[variant]}
          onChange={(choice) => setAppearance({ ...appearance, [variant]: choice })}
        />
      ))}

      <section
        aria-label="Typography"
        className="overflow-hidden rounded-2xl border bg-tint-01"
      >
        <h3 className="px-5 pt-4 pb-4 text-base font-medium">Typography</h3>
        <Row label="Text size">
          <div
            role="radiogroup"
            aria-label="Text size"
            className="flex rounded-lg border bg-background p-0.5"
          >
            {TEXT_SIZES.map((size) => (
              <button
                key={size.value}
                type="button"
                role="radio"
                aria-checked={appearance.textSize === size.value}
                onClick={() =>
                  setAppearance({ ...appearance, textSize: size.value })
                }
                className={cn(
                  "h-7 rounded-md px-3 text-sm text-ink-03 transition-colors hover:text-ink-05",
                  appearance.textSize === size.value &&
                    "bg-tint-02 text-ink-05"
                )}
              >
                {size.label}
              </button>
            ))}
          </div>
        </Row>
      </section>
    </div>
  )
}

/**
 * Rebuilds a person's overrides from their stored choice, once the app has
 * loaded. Rendered once near the root of an app; draws nothing.
 */
function AppearanceBoot() {
  React.useEffect(() => {
    // Applies, never saves: nothing is written that a person did not choose.
    applyStoredAppearance()
  }, [])
  return null
}

export { AppearanceBoot, AppearanceSettings, RestoreAppearanceButton }
