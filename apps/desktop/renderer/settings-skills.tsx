/**
 * Settings > Skills: the instructions local answers follow.
 *
 * The dashboard's Skills page, for one person. A few skills ship with the app
 * and can be edited, turned off, or put back; the rest are the person's own.
 * What the dashboard calls "when relevant" is missing on purpose: loading a
 * skill on demand is a tool call, local mode has no tools, so a skill that is
 * on is in every answer.
 */
import { useEffect, useState } from "react";

import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import { Input } from "@onirix/ui/components/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@onirix/ui/components/input-group";
import { Label } from "@onirix/ui/components/label";
import { Spinner } from "@onirix/ui/components/spinner";
import { Switch } from "@onirix/ui/components/switch";
import { Textarea } from "@onirix/ui/components/textarea";
import { BlocksIcon, PlusIcon, RotateCcwIcon, SearchIcon, Trash2Icon } from "@onirix/ui/lib/icons";
import { cn } from "@onirix/ui/lib/utils";

import { LIMITS, type LocalSkill, type SkillDraft } from "../src/local-bridge";

import { errorMessage, getBridge } from "./bridge";
import { Modal, ModalDescription, ModalTitle } from "./modal";
import { Section } from "./settings-section";
import { TILE } from "./tokens";

export function SkillsSettings() {
  const [skills, setSkills] = useState<LocalSkill[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** `"new"` is the empty form; a skill is that skill's. */
  const [editing, setEditing] = useState<LocalSkill | "new" | null>(null);

  async function refresh() {
    setSkills(await getBridge().skills.list());
  }

  useEffect(() => {
    let stale = false;
    void getBridge()
      .skills.list()
      .then((listed) => {
        if (!stale) setSkills(listed);
      })
      .catch((failure: unknown) => {
        if (!stale) setError(errorMessage(failure));
      });
    return () => {
      stale = true;
    };
  }, []);

  async function toggle(skill: LocalSkill, enabled: boolean) {
    setError(null);
    try {
      const { name, description, instructions } = skill;
      await getBridge().skills.update(skill.id, { name, description, instructions, enabled });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      await refresh();
    }
  }

  // Name and description both: someone searching "expenses" is as likely to be
  // recalling what a skill is for as what it was called.
  const query = search.trim().toLowerCase();
  const shown = (skills ?? []).filter(
    (row) =>
      !query ||
      row.name.toLowerCase().includes(query) ||
      row.description.toLowerCase().includes(query),
  );

  return (
    <>
      <Section
        title="Skills"
        description="Instructions the assistant follows when it answers. Every skill that is on goes into every answer, so keep them short."
      >
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
          <Button
            variant="outline"
            className="rounded-full px-4"
            disabled={skills === null || skills.length >= LIMITS.skills}
            onClick={() => setEditing("new")}
          >
            <PlusIcon />
            Create skill
          </Button>
        </div>

        {error ? (
          <p className="text-destructive text-sm select-text" role="alert">
            {error}
          </p>
        ) : null}

        {skills === null ? (
          error ? null : (
            <div className={cn("flex justify-center py-6", TILE)}>
              <Spinner />
            </div>
          )
        ) : shown.length === 0 ? (
          <p className={cn("text-ink-03 px-4 py-6 text-center text-sm", TILE)}>
            No skill matches that.
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
                    "hover:bg-tint-01 focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-inset",
                    !row.enabled && "opacity-55",
                  )}
                >
                  <BlocksIcon className="text-ink-02 size-4 shrink-0" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{row.name}</span>
                    <span className="text-ink-03 truncate text-xs" title={row.description}>
                      {row.description}
                    </span>
                  </span>
                  {row.builtIn ? <Badge variant="info">Built-in</Badge> : null}
                </button>
                <Switch
                  checked={row.enabled}
                  aria-label={`${row.name} is ${row.enabled ? "on" : "off"}`}
                  onCheckedChange={(enabled) => void toggle(row, enabled)}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {editing ? (
        <SkillDialog
          skill={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onChanged={refresh}
        />
      ) : null}
    </>
  );
}

/** Create and edit: one form over a different starting point. */
function SkillDialog({
  skill,
  onClose,
  onChanged,
}: {
  skill: LocalSkill | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const builtIn = skill?.builtIn ?? false;
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [instructions, setInstructions] = useState(skill?.instructions ?? "");
  const [enabled, setEnabled] = useState(skill?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  /** Delete is asked twice: unlike a document, the text exists nowhere else. */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Runs one change, and closes on success. The text stays put on failure. */
  async function run(change: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await change();
      await onChanged();
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  const draft: SkillDraft = {
    name: name.trim(),
    description: description.trim(),
    instructions: instructions.trim(),
    enabled,
  };
  const incomplete = !draft.name || !draft.description || !draft.instructions;

  return (
    <Modal open onOpenChange={(open) => !open && onClose()} className="w-[640px] gap-5 p-6">
      <div className="flex flex-col gap-1.5">
        <ModalTitle className="text-base font-semibold">
          {skill ? `Edit ${skill.name}` : "Create skill"}
        </ModalTitle>
        <ModalDescription className="text-ink-03">
          {builtIn
            ? "Built in. Edit the text, or reset it to the Onirix default."
            : "Tell the assistant what to do."}
        </ModalDescription>
      </div>

      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        {/* A built-in's name is what ties it to the text it resets to. */}
        {builtIn ? null : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="skill-name">Name</Label>
            <Input
              id="skill-name"
              value={name}
              maxLength={LIMITS.skillNameChars}
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
            maxLength={LIMITS.skillDescriptionChars}
            placeholder="How to answer questions about expenses and travel limits."
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="skill-instructions">Instructions</Label>
          <Textarea
            id="skill-instructions"
            value={instructions}
            maxLength={LIMITS.skillInstructionsChars}
            // The shared textarea sizes to its content, so `rows` does nothing:
            // the floor is what makes an empty one look like a place to write.
            className="max-h-80 min-h-48 font-mono text-xs"
            placeholder={
              "# Expenses\n- Quote the limit and the currency it is stated in.\n- Name the approver for anything above it."
            }
            onChange={(event) => setInstructions(event.target.value)}
          />
        </div>

        <label className="flex items-center gap-2.5 text-sm">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          Enabled
        </label>

        {error ? (
          <p className="text-destructive text-sm select-text" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {/* Destructive and confirming sit at opposite ends, so neither is hit
            by reflex. */}
        {skill && builtIn ? (
          <Button
            variant="ghost"
            className="mr-auto rounded-full px-4"
            disabled={busy}
            onClick={() => void run(() => getBridge().skills.reset(skill.id))}
          >
            <RotateCcwIcon />
            Reset to default
          </Button>
        ) : skill ? (
          <Button
            variant="ghost"
            className="mr-auto rounded-full px-4"
            disabled={busy}
            onClick={() =>
              confirmingDelete
                ? void run(() => getBridge().skills.remove(skill.id))
                : setConfirmingDelete(true)
            }
          >
            <Trash2Icon className="text-destructive" />
            {confirmingDelete ? "Delete for good" : "Delete"}
          </Button>
        ) : (
          <span className="mr-auto" />
        )}
        <Button variant="outline" className="rounded-full px-4" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="rounded-full px-4"
          disabled={incomplete || busy}
          onClick={() =>
            void run(() =>
              skill ? getBridge().skills.update(skill.id, draft) : getBridge().skills.create(draft),
            )
          }
        >
          {busy ? <Spinner /> : null}
          {skill ? "Save" : "Create skill"}
        </Button>
      </div>
    </Modal>
  );
}
