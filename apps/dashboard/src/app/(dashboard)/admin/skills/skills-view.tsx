"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BlocksIcon,
  CodeIcon,
  EyeIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  UserIcon,
} from "@onirix/ui/lib/icons";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@onirix/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@onirix/ui/components/dialog";
import { Input } from "@onirix/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@onirix/ui/components/input-group";
import { Label } from "@onirix/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@onirix/ui/components/select";
import { Separator } from "@onirix/ui/components/separator";
import { Spinner } from "@onirix/ui/components/spinner";
import { Switch } from "@onirix/ui/components/switch";
import { Textarea } from "@onirix/ui/components/textarea";
import { MessageResponse } from "@onirix/ui/components/ai-elements/message";
import { cn } from "@onirix/ui/lib/utils";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";

import { Page, PageHeader } from "@/components/page";
import { trpc } from "@/utils/trpc";

type Skill = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  loading: "always" | "on_demand";
  enabled: boolean;
  author: string;
  /** Seeded with the product rather than written here: resettable, not deletable. */
  builtIn: boolean;
};

/** The editable half of a skill, which is what both dialogs hand back. */
type SkillDraft = Omit<Skill, "id" | "builtIn" | "author">;

const LOADING_LABEL: Record<Skill["loading"], string> = {
  always: "Always applied",
  on_demand: "Applied when relevant",
};

/**
 * The dropdown's own wording, kept in one place because Base UI resolves the
 * trigger's label from `items` rather than from the rendered `SelectItem`, and
 * shows the bare value when the two drift apart.
 */
const LOADING_OPTIONS: { value: Skill["loading"]; label: string }[] = [
  { value: "on_demand", label: "When relevant" },
  { value: "always", label: "Always" },
];

/**
 * Skills: the instructions the assistant follows when it answers.
 *
 * This is where the product's behaviour stopped being code. A skill pairs a
 * one-line description with a body of Markdown, and the two are used very
 * differently: the description is in every prompt, the body usually is not.
 * That split is the point: a workspace can accumulate house rules
 * without every question paying for all of them.
 *
 * Built-in skills ship with the product and are shown read-only. They are not
 * rows in this workspace's database but constants in the code that depends on
 * them, so editing one here would be editing something the next deploy replaces.
 */
export function SkillsView({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [deleting, setDeleting] = useState<Skill | null>(null);

  const skills = useQuery(trpc.skill.list.queryOptions());

  const invalidate = () => void queryClient.invalidateQueries();

  const create = useMutation(
    trpc.skill.create.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Skill created.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const update = useMutation(
    trpc.skill.update.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Skill saved.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const reset = useMutation(
    trpc.skill.reset.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Reset to the Onirix default.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const remove = useMutation(
    trpc.skill.delete.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Skill deleted.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  // Name and description both, because a reader searching "expenses" is as
  // likely to be recalling what a skill is for as what it was called.
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = skills.data ?? [];
    if (!needle) return all;
    return all.filter(
      (skill) =>
        skill.name.toLowerCase().includes(needle) ||
        skill.description.toLowerCase().includes(needle),
    );
  }, [skills.data, query]);

  return (
    <Page>
      <PageHeader
        icon={BlocksIcon}
        title="Skills"
        description="Instructions the assistant reaches for. Built-in skills ship with Onirix; the rest are your workspace's own."
        action={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon />
              Create skill
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-6">
        <InputGroup size="lg">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            placeholder="Search skills…"
            aria-label="Search skills"
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>

        {skills.isPending ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : matches.length > 0 ? (
          <>
            <div className="flex flex-col gap-3">
              <p className="text-ink-03 text-sm">Browse skills</p>
              {/* One column until there is room for two to stay readable: a
                  description clipped at two lines needs the width to be worth
                  reading at all. */}
              <div className="grid gap-4 md:grid-cols-2">
                {matches.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    onOpen={() => setEditing(skill)}
                  />
                ))}
              </div>
            </div>

            {/* The count sits under the grid rather than beside the heading, so
                it reads as the end of the list instead of competing with the
                search field for the reader's attention on the way in. */}
            <div className="flex items-center gap-4">
              <Separator className="flex-1" />
              <span className="text-ink-03 shrink-0 text-xs">
                {matches.length} {matches.length === 1 ? "skill" : "skills"}
              </span>
              <Separator className="flex-1" />
            </div>
          </>
        ) : (
          <Empty variant="outline">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BlocksIcon />
              </EmptyMedia>
              <EmptyTitle>
                {query.trim() ? "No matching skills" : "No skills yet"}
              </EmptyTitle>
              <EmptyDescription>
                {query.trim()
                  ? "Nothing here answers to that name or description."
                  : "Write one to teach the assistant something it cannot infer from your documents."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      {creating ? (
        <SkillDialog
          onClose={() => setCreating(false)}
          onSubmit={async (draft) => {
            await create.mutateAsync(draft);
          }}
        />
      ) : null}

      {editing ? (
        <SkillDialog
          skill={editing}
          canManage={canManage}
          onClose={() => setEditing(null)}
          onSubmit={async (draft) => {
            // `name` and `loading` are sent for every skill and ignored by the
            // server for a built-in, so the form has one submit path.
            await update.mutateAsync({ ...draft, id: editing.id });
          }}
          onReset={
            editing.builtIn
              ? async () => {
                  await reset.mutateAsync({ id: editing.id });
                }
              : undefined
          }
          // Closing first keeps the two dialogs from stacking: the reader is
          // asked to confirm against the page, not against the form they were
          // halfway through.
          onRequestDelete={
            editing.builtIn
              ? undefined
              : () => {
                  setDeleting(editing);
                  setEditing(null);
                }
          }
        />
      ) : null}

      {deleting ? (
        <DeleteSkillDialog
          skill={deleting}
          onClose={() => setDeleting(null)}
          onDelete={async () => {
            await remove.mutateAsync({ id: deleting.id });
          }}
        />
      ) : null}
    </Page>
  );
}

/**
 * One skill, as the browse grid shows it.
 *
 * The whole card opens the skill rather than an edit button in a corner: a
 * built-in has nothing to edit but is still worth reading, and the same gesture
 * should work on both.
 */
function SkillCard({ skill, onOpen }: { skill: Skill; onOpen: () => void }) {
  return (
    // The dimming of a disabled skill lives on a plain wrapper: a card owns its
    // own effects, and this is a statement about the skill rather than a
    // treatment of the card.
    <div className={cn(!skill.enabled && "opacity-55")}>
      <Card
        interactive
        role="button"
        tabIndex={0}
        aria-label={`Open ${skill.name}`}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
      >
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <BlocksIcon className="text-ink-03 size-4 shrink-0" />
              {skill.name}
            </span>
          </CardTitle>
          {/* Clamped rather than truncated: two lines of a description say what
              a skill is for, where one ellipsised line usually does not. */}
          <CardDescription>
            <span className="line-clamp-2">{skill.description}</span>
          </CardDescription>
        </CardHeader>

        <CardFooter className="justify-between">
          <span className="text-ink-03 flex min-w-0 items-center gap-1.5 text-xs">
            <UserIcon className="size-3.5 shrink-0" />
            <span className="truncate">{skill.author}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {skill.loading === "always" ? (
              <Badge variant="muted">Always applied</Badge>
            ) : null}
            {!skill.enabled ? <Badge variant="muted">Off</Badge> : null}
            {/* `info` rather than the default: a built-in is a statement of
                origin, not a status to act on, and the blue wash reads as a
                label where the primary fill would read as a call to action. */}
            {skill.builtIn ? <Badge variant="info">Built-in</Badge> : null}
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}

/**
 * Create, edit, and read a built-in: one form over a different starting point,
 * and read-only when the skill is not this workspace's to change.
 */
function SkillDialog({
  skill,
  canManage = true,
  onClose,
  onSubmit,
  onReset,
  onRequestDelete,
}: {
  skill?: Skill;
  canManage?: boolean;
  onClose: () => void;
  onSubmit: (draft: SkillDraft) => Promise<void>;
  onReset?: () => Promise<void>;
  onRequestDelete?: () => void;
}) {
  // Without the permission this is a reading view, not a form that would fail
  // on save. A built-in is editable, but only its text: the name is what ties
  // the override to the constant it overrides, and the loading mode is what
  // "applied by default" means.
  const readOnly = !canManage;
  const builtIn = skill?.builtIn ?? false;
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [instructions, setInstructions] = useState(skill?.instructions ?? "");
  const [loading, setLoading] = useState<Skill["loading"]>(skill?.loading ?? "on_demand");
  const [enabled, setEnabled] = useState(skill?.enabled ?? true);
  // Onyx's dialog offers the same two views of a skill body. Rendered is how a
  // reader checks the writing; source is how they check the Markdown.
  const [view, setView] = useState<"preview" | "source">(
    readOnly ? "preview" : "source",
  );
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        loading,
        enabled,
      });
      onClose();
    } catch {
      // The mutation's own `onError` has already told the reader what happened;
      // the dialog stays open with their text in it so it is not lost.
    } finally {
      setSaving(false);
    }
  }

  const incomplete = !name.trim() || !description.trim() || !instructions.trim();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? skill?.name : skill ? `Edit ${skill.name}` : "Create skill"}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? "You cannot change this workspace's skills."
              : builtIn
                ? "Built in. Edit the text, or reset it to the Onirix default."
                : "Tell the assistant what to do, and when."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {readOnly ? null : (
            <>
              {/* A built-in's name is not the workspace's to change: it is what
                  ties the override to the constant it overrides, and it is what
                  the model writes into `load_skill`. */}
              {builtIn ? null : (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="skill-name">Name</Label>
                  <Input
                    id="skill-name"
                    value={name}
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
                  placeholder="How to answer questions about expenses and travel limits."
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>

              {/* Built-ins are applied by default, and that is the whole of
                  what they are: `grounding` reaching the model only when it
                  thinks to ask is not something to offer by accident. */}
              {builtIn ? null : (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="skill-loading">When to apply it</Label>
                  <Select
                    items={LOADING_OPTIONS}
                    value={loading}
                    onValueChange={(value) => setLoading(value as Skill["loading"])}
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
                  <p className="text-ink-03 text-xs">
                    {loading === "always"
                      ? "In every answer, so keep it short."
                      : "Read only when the description matches the question."}
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="skill-instructions">Instructions</Label>
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
            </div>

            {view === "source" && !readOnly ? (
              <Textarea
                id="skill-instructions"
                value={instructions}
                rows={12}
                placeholder={"# Expenses\n- Quote the limit and the currency it is stated in.\n- Name the approver for anything above it."}
                onChange={(event) => setInstructions(event.target.value)}
              />
            ) : view === "source" ? (
              <pre className="bg-tint-01 max-h-96 overflow-auto rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap">
                {instructions}
              </pre>
            ) : (
              <div className="bg-card max-h-96 overflow-auto rounded-lg border p-3 text-sm">
                {instructions.trim() ? (
                  <MessageResponse>{instructions}</MessageResponse>
                ) : (
                  <p className="text-ink-03 text-xs">Nothing written yet.</p>
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
        </div>

        <DialogFooter>
          {/* Pushed to the far side of the footer: destructive and confirming
              sit at opposite ends so neither is hit by reflex. */}
          {onRequestDelete && !readOnly ? (
            <Button variant="ghost" className="mr-auto" onClick={onRequestDelete}>
              <Trash2Icon className="text-destructive" />
              Delete
            </Button>
          ) : onReset && !readOnly ? (
            <Button
              variant="ghost"
              className="mr-auto"
              disabled={resetting}
              onClick={() => {
                setResetting(true);
                void onReset()
                  .then(onClose)
                  .catch(() => {})
                  .finally(() => setResetting(false));
              }}
            >
              {resetting ? <Spinner /> : <RotateCcwIcon />}
              Reset to default
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {readOnly ? null : (
            <Button onClick={() => void submit()} disabled={incomplete || saving}>
              {saving ? <Spinner /> : null}
              {skill ? "Save" : "Create skill"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSkillDialog({
  skill,
  onClose,
  onDelete,
}: {
  skill: Skill;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  async function submit() {
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch {
      // Reported by the mutation; the dialog closes only on success.
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {skill.name}?</DialogTitle>
          <DialogDescription>
            The assistant stops following these instructions immediately. To keep
            the text but stop using it, turn the skill off instead.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void submit()} disabled={deleting}>
            {deleting ? <Spinner /> : null}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
