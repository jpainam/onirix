"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BlocksIcon, CodeIcon, EyeIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@onirix/ui/components/dialog";
import { Input } from "@onirix/ui/components/input";
import { Label } from "@onirix/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@onirix/ui/components/select";
import { Spinner } from "@onirix/ui/components/spinner";
import { Switch } from "@onirix/ui/components/switch";
import { Textarea } from "@onirix/ui/components/textarea";
import { MessageResponse } from "@onirix/ui/components/ai-elements/message";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";

import { Notice, Page, PageHeader, Row, Section } from "@/components/page";
import { trpc } from "@/utils/trpc";

type Skill = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  loading: "always" | "on_demand";
  enabled: boolean;
  builtIn: boolean;
};

/** The editable half of a skill, which is what both dialogs hand back. */
type SkillDraft = Omit<Skill, "id" | "builtIn">;

const LOADING_LABEL: Record<Skill["loading"], string> = {
  always: "Always applied",
  on_demand: "Applied when relevant",
};

/**
 * Skills: the instructions the assistant follows when it answers.
 *
 * This is where the product's behaviour stopped being code. A skill pairs a
 * one-line description with a body of Markdown, and the two are used very
 * differently: the description is in every prompt, the body usually is not.
 * That split is the whole point — a workspace can accumulate house rules
 * without every question paying for all of them.
 *
 * Built-in skills ship with the product and are shown read-only. They are not
 * rows in this workspace's database but constants in the code that depends on
 * them, so editing one here would be editing something the next deploy replaces.
 */
export function SkillsView({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
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
  const setEnabled = useMutation(
    trpc.skill.setEnabled.mutationOptions({
      onSuccess: invalidate,
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

  return (
    <Page>
      <PageHeader
        icon={BlocksIcon}
        title="Skills"
        description="Instructions the assistant follows when it answers."
        action={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon />
              Create skill
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-10">
        <Notice
          icon={BlocksIcon}
          title="A description is not a label"
          description="For a skill applied when relevant, the description is all the assistant sees until it decides to read the rest. Say when the skill applies, not just what it is about."
        />

        <Section
          title="Skills"
          description="Built-in skills ship with Onirix and cannot be edited."
        >
          {skills.isPending ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : skills.data && skills.data.length > 0 ? (
            <div className="flex flex-col gap-2">
              {skills.data.map((skill) => (
                <Row
                  key={skill.id}
                  icon={<BlocksIcon />}
                  title={
                    <span className="flex items-center gap-2">
                      {skill.name}
                      {skill.builtIn ? <Badge variant="muted">Built-in</Badge> : null}
                      {!skill.enabled ? <Badge variant="muted">Off</Badge> : null}
                    </span>
                  }
                  description={`${skill.description} · ${LOADING_LABEL[skill.loading]}`}
                  action={
                    <div className="flex items-center gap-1">
                      {skill.builtIn ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(skill)}
                        >
                          <EyeIcon />
                          View
                        </Button>
                      ) : canManage ? (
                        <>
                          <Switch
                            checked={skill.enabled}
                            aria-label={`Enable ${skill.name}`}
                            onCheckedChange={(enabled) =>
                              setEnabled.mutate({ id: skill.id, enabled })
                            }
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditing(skill)}
                          >
                            <PencilIcon />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleting(skill)}
                          >
                            <Trash2Icon className="text-destructive" />
                            Delete
                          </Button>
                        </>
                      ) : null}
                    </div>
                  }
                />
              ))}
            </div>
          ) : (
            <Empty variant="outline">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BlocksIcon />
                </EmptyMedia>
                <EmptyTitle>No skills yet</EmptyTitle>
                <EmptyDescription>
                  Write one to teach the assistant something it cannot infer from
                  your documents.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </Section>
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
          onClose={() => setEditing(null)}
          onSubmit={async (draft) => {
            await update.mutateAsync({ ...draft, id: editing.id });
          }}
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
 * Create, edit, and read a built-in — one form over a different starting point,
 * and read-only when the skill is not this workspace's to change.
 */
function SkillDialog({
  skill,
  onClose,
  onSubmit,
}: {
  skill?: Skill;
  onClose: () => void;
  onSubmit: (draft: SkillDraft) => Promise<void>;
}) {
  const readOnly = skill?.builtIn ?? false;
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
              ? "A built-in skill. It ships with Onirix and cannot be edited."
              : "The description decides when this applies. The instructions decide what happens then."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {readOnly ? null : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="skill-name">Name</Label>
                <Input
                  id="skill-name"
                  value={name}
                  placeholder="expense-policy"
                  onChange={(event) => setName(event.target.value)}
                />
                <p className="text-ink-03 text-xs">
                  Lowercase, hyphenated. The assistant refers to the skill by this.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="skill-description">Description</Label>
                <Input
                  id="skill-description"
                  value={description}
                  placeholder="How to answer questions about expenses, reimbursement and travel limits."
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="skill-loading">When to apply it</Label>
                <Select
                  value={loading}
                  onValueChange={(value) => setLoading(value as Skill["loading"])}
                >
                  <SelectTrigger id="skill-loading">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_demand">
                      When relevant — the assistant reads it if the description matches
                    </SelectItem>
                    <SelectItem value="always">
                      Always — included in every answer
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-ink-03 text-xs">
                  {loading === "always"
                    ? "Costs a little on every question. Right for something short that nearly always applies."
                    : "Costs nothing until it applies, and a moment's pause when it does. Right for anything long or narrow."}
                </p>
              </div>
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
