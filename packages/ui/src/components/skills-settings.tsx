"use client"

// The Skills screen: the instructions the assistant follows when it answers.
// Shared by the dashboard (a workspace's skills, on the server) and the
// desktop app's local mode (one person's, on their computer), so it knows
// nothing about where a skill is kept: it draws the list it is handed and
// reports what the person asked for. A handler that rejects leaves the dialog
// open with its text in place and the reason shown.

import * as React from "react"
import {
  BlocksIcon,
  CodeIcon,
  EyeIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
} from "@onirix/ui/lib/icons"
import { cn } from "cn"

import { Badge } from "@onirix/ui/components/badge"
import { Button } from "@onirix/ui/components/button"
import { Input } from "@onirix/ui/components/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@onirix/ui/components/input-group"
import { Label } from "@onirix/ui/components/label"
import { Modal, ModalDescription, ModalTitle } from "@onirix/ui/components/modal"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@onirix/ui/components/select"
import { TILE } from "@onirix/ui/components/settings-section"
import { Spinner } from "@onirix/ui/components/spinner"
import { Switch } from "@onirix/ui/components/switch"
import { Textarea } from "@onirix/ui/components/textarea"

export type SkillLoading = "always" | "on_demand"

export type Skill = {
  id: string
  name: string
  description: string
  instructions: string
  enabled: boolean
  /** Ships with the product: resettable, not deletable, and its name is fixed. */
  builtIn: boolean
  /** Only where skills can be loaded on demand; see `loadingModes`. */
  loading?: SkillLoading
  /** Only where more than one person writes skills. */
  author?: string
}

/** The editable half of a skill, which is what the dialog hands back. */
export type SkillDraft = Pick<
  Skill,
  "name" | "description" | "instructions" | "enabled" | "loading"
>

export type SkillLimits = {
  skills?: number
  nameChars?: number
  descriptionChars?: number
  instructionsChars?: number
}

/**
 * The dropdown's own wording, kept in one place because Base UI resolves the
 * trigger's label from `items` rather than from the rendered `SelectItem`, and
 * shows the bare value when the two drift apart.
 */
const LOADING_OPTIONS: { value: SkillLoading; label: string }[] = [
  { value: "on_demand", label: "When relevant" },
  { value: "always", label: "Always" },
]

function message(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure)
}

export function SkillsSettings({
  skills,
  error = null,
  canManage = true,
  loadingModes = false,
  limits = {},
  preview,
  onCreate,
  onUpdate,
  onReset,
  onDelete,
}: {
  /** Null while the list is on its way. */
  skills: Skill[] | null
  /** Why the list could not be read. */
  error?: string | null
  /** Without it the screen is for reading: no switches, no form. */
  canManage?: boolean
  /**
   * Offers "when relevant" beside "always". Loading a skill on demand is a
   * tool call, so an app whose model has no tools leaves this off and every
   * skill that is on is in every answer.
   */
  loadingModes?: boolean
  limits?: SkillLimits
  /**
   * Renders the instructions as the Markdown they are. The caller's, because
   * each app already bundles a renderer of its own weight; without one the
   * dialog shows the source alone.
   */
  preview?: (markdown: string) => React.ReactNode
  onCreate: (draft: SkillDraft) => Promise<unknown>
  onUpdate: (id: string, draft: SkillDraft) => Promise<unknown>
  onReset: (id: string) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
}) {
  const [search, setSearch] = React.useState("")
  /** `"new"` is the empty form; a skill is that skill's. */
  const [editing, setEditing] = React.useState<Skill | "new" | null>(null)
  const [toggleError, setToggleError] = React.useState<string | null>(null)

  async function toggle(skill: Skill, enabled: boolean) {
    setToggleError(null)
    try {
      const { name, description, instructions, loading } = skill
      await onUpdate(skill.id, {
        name,
        description,
        instructions,
        loading,
        enabled,
      })
    } catch (failure) {
      setToggleError(message(failure))
    }
  }

  // Name and description both: someone searching "expenses" is as likely to be
  // recalling what a skill is for as what it was called.
  const query = search.trim().toLowerCase()
  const shown = (skills ?? []).filter(
    (row) =>
      !query ||
      row.name.toLowerCase().includes(query) ||
      row.description.toLowerCase().includes(query)
  )
  const full = limits.skills !== undefined && (skills?.length ?? 0) >= limits.skills
  const shownError = toggleError ?? error

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search skills"
            aria-label="Search skills"
          />
        </InputGroup>
        {canManage ? (
          <Button
            variant="outline"
            size="pill"
            disabled={skills === null || full}
            onClick={() => setEditing("new")}
          >
            <PlusIcon />
            Create skill
          </Button>
        ) : null}
      </div>

      {shownError ? (
        <p className="text-sm text-destructive select-text" role="alert">
          {shownError}
        </p>
      ) : null}

      {skills === null ? (
        error ? null : (
          <div className={cn("flex justify-center py-6", TILE)}>
            <Spinner />
          </div>
        )
      ) : shown.length === 0 ? (
        <p className={cn("px-4 py-6 text-center text-sm text-ink-03", TILE)}>
          {query ? "No skill matches that." : "No skills yet."}
        </p>
      ) : (
        <ul className={cn("divide-y overflow-hidden", TILE)}>
          {shown.map((row) => (
            <li key={row.id} className="flex min-h-14 items-center gap-3 pr-4">
              {/* The row opens the skill; the switch beside it is its own
                  control, so turning one off does not take a dialog. */}
              <button
                type="button"
                aria-label={`Open ${row.name}`}
                onClick={() => setEditing(row)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left outline-none hover:bg-tint-01 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  !row.enabled && "opacity-55"
                )}
              >
                <BlocksIcon className="size-4 shrink-0 text-ink-02" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{row.name}</span>
                  <span
                    className="truncate text-xs text-ink-03"
                    title={row.description}
                  >
                    {row.description}
                  </span>
                </span>
                {loadingModes && row.loading === "always" ? (
                  <Badge variant="muted">Always applied</Badge>
                ) : null}
                {row.builtIn ? <Badge variant="info">Built-in</Badge> : null}
              </button>
              <Switch
                checked={row.enabled}
                disabled={!canManage}
                aria-label={`${row.name} is ${row.enabled ? "on" : "off"}`}
                onCheckedChange={(enabled) => void toggle(row, enabled)}
              />
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <SkillDialog
          skill={editing === "new" ? null : editing}
          readOnly={!canManage}
          loadingModes={loadingModes}
          limits={limits}
          preview={preview}
          onClose={() => setEditing(null)}
          onSave={(draft) =>
            editing === "new" ? onCreate(draft) : onUpdate(editing.id, draft)
          }
          onReset={onReset}
          onDelete={onDelete}
        />
      ) : null}
    </div>
  )
}

/**
 * Create, edit, and read: one form over a different starting point, and a
 * reading view when the skills are not this person's to change.
 */
function SkillDialog({
  skill,
  readOnly,
  loadingModes,
  limits,
  preview,
  onClose,
  onSave,
  onReset,
  onDelete,
}: {
  skill: Skill | null
  readOnly: boolean
  loadingModes: boolean
  limits: SkillLimits
  preview?: (markdown: string) => React.ReactNode
  onClose: () => void
  onSave: (draft: SkillDraft) => Promise<unknown>
  onReset: (id: string) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
}) {
  const builtIn = skill?.builtIn ?? false
  const [name, setName] = React.useState(skill?.name ?? "")
  const [description, setDescription] = React.useState(skill?.description ?? "")
  const [instructions, setInstructions] = React.useState(
    skill?.instructions ?? ""
  )
  const [loading, setLoading] = React.useState<SkillLoading>(
    skill?.loading ?? "on_demand"
  )
  const [enabled, setEnabled] = React.useState(skill?.enabled ?? true)
  // Rendered is how a reader checks the writing; source is how they check the
  // Markdown.
  const [view, setView] = React.useState<"preview" | "source">(
    readOnly && preview ? "preview" : "source"
  )
  const [busy, setBusy] = React.useState(false)
  /** Delete is asked twice: the text exists nowhere else. */
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  /** Runs one change, and closes on success. The text stays put on failure. */
  async function run(change: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await change()
      onClose()
    } catch (failure) {
      setError(message(failure))
      setBusy(false)
    }
  }

  const draft: SkillDraft = {
    name: name.trim(),
    description: description.trim(),
    instructions: instructions.trim(),
    enabled,
    loading: loadingModes ? loading : undefined,
  }
  const incomplete = !draft.name || !draft.description || !draft.instructions

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      className="w-[640px] gap-5 p-6"
    >
      <div className="flex flex-col gap-1.5">
        <ModalTitle className="text-base font-semibold">
          {readOnly ? skill?.name : skill ? `Edit ${skill.name}` : "Create skill"}
        </ModalTitle>
        <ModalDescription className="text-ink-03">
          {readOnly
            ? "You cannot change these skills."
            : builtIn
              ? "Built in. Edit the text, or reset it to the Onirix default."
              : loadingModes
                ? "Tell the assistant what to do, and when."
                : "Tell the assistant what to do."}
          {skill?.author && !builtIn ? ` Written by ${skill.author}.` : null}
        </ModalDescription>
      </div>

      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        {readOnly ? null : (
          <>
            {/* A built-in's name is what ties it to the text it resets to. */}
            {builtIn ? null : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="skill-name">Name</Label>
                <Input
                  id="skill-name"
                  value={name}
                  maxLength={limits.nameChars}
                  placeholder="expense-policy"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-description">Description</Label>
              <Input
                id="skill-description"
                value={description}
                maxLength={limits.descriptionChars}
                placeholder="How to answer questions about expenses and travel limits."
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            {/* Built-ins are applied by default, and that is the whole of what
                they are: one reaching the model only when it thinks to ask is
                not something to offer by accident. */}
            {loadingModes && !builtIn ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="skill-loading">When to apply it</Label>
                <Select
                  items={LOADING_OPTIONS}
                  value={loading}
                  onValueChange={(value) => setLoading(value as SkillLoading)}
                >
                  <SelectTrigger id="skill-loading" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOADING_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-ink-03">
                  {loading === "always"
                    ? "In every answer, so keep it short."
                    : "Read only when the description matches the question."}
                </p>
              </div>
            ) : null}
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="skill-instructions">Instructions</Label>
            {preview ? (
              <div className="flex items-center gap-1">
                <Button
                  variant={view === "preview" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="Preview"
                  aria-pressed={view === "preview"}
                  onClick={() => setView("preview")}
                >
                  <EyeIcon />
                </Button>
                <Button
                  variant={view === "source" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="Source"
                  aria-pressed={view === "source"}
                  onClick={() => setView("source")}
                >
                  <CodeIcon />
                </Button>
              </div>
            ) : null}
          </div>

          {view === "source" && !readOnly ? (
            <Textarea
              id="skill-instructions"
              value={instructions}
              maxLength={limits.instructionsChars}
              // The shared textarea sizes to its content, so `rows` does
              // nothing: the floor is what makes an empty one look like a
              // place to write.
              className="max-h-80 min-h-48 font-mono text-xs"
              placeholder={
                "# Expenses\n- Quote the limit and the currency it is stated in.\n- Name the approver for anything above it."
              }
              onChange={(event) => setInstructions(event.target.value)}
            />
          ) : view === "source" ? (
            <pre className="max-h-80 min-h-48 overflow-auto rounded-lg border bg-tint-01 p-3 font-mono text-xs whitespace-pre-wrap select-text">
              {instructions}
            </pre>
          ) : (
            <div className="max-h-80 min-h-48 overflow-auto rounded-lg border bg-card p-3 text-sm select-text">
              {instructions.trim() ? (
                preview?.(instructions)
              ) : (
                <p className="text-xs text-ink-03">Nothing written yet.</p>
              )}
            </div>
          )}
        </div>

        {readOnly ? null : (
          <label className="flex items-center gap-2.5 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            Enabled
          </label>
        )}

        {error ? (
          <p className="text-sm text-destructive select-text" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {/* Destructive and confirming sit at opposite ends, so neither is hit
            by reflex. */}
        {readOnly || !skill ? (
          <span className="mr-auto" />
        ) : builtIn ? (
          <Button
            variant="ghost"
            size="pill"
            className="mr-auto"
            disabled={busy}
            onClick={() => void run(() => onReset(skill.id))}
          >
            <RotateCcwIcon />
            Reset to default
          </Button>
        ) : (
          <Button
            variant="destructive"
            size="pill"
            className="mr-auto"
            disabled={busy}
            onClick={() =>
              confirmingDelete
                ? void run(() => onDelete(skill.id))
                : setConfirmingDelete(true)
            }
          >
            <Trash2Icon />
            {confirmingDelete ? "Delete for good" : "Delete"}
          </Button>
        )}
        <Button variant="outline" size="pill" onClick={onClose}>
          {readOnly ? "Close" : "Cancel"}
        </Button>
        {readOnly ? null : (
          <Button
            size="pill"
            disabled={incomplete || busy}
            onClick={() => void run(() => onSave(draft))}
          >
            {busy ? <Spinner /> : null}
            {skill ? "Save" : "Create skill"}
          </Button>
        )}
      </div>
    </Modal>
  )
}
