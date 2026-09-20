"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MessageResponse } from "@onirix/ui/components/ai-elements/message";
import {
  type SkillDraft,
  SkillsSettings,
} from "@onirix/ui/components/skills-settings";

import { Page, PageHeader } from "@/components/page";
import { trpc } from "@/utils/trpc";

/**
 * Skills: the instructions the assistant follows when it answers.
 *
 * This is where the product's behaviour stopped being code. A skill pairs a
 * one-line description with a body of Markdown, and the two are used very
 * differently: the description is in every prompt, the body usually is not.
 * That split is the point: a workspace can accumulate house rules
 * without every question paying for all of them.
 *
 * The screen itself is `@onirix/ui`'s, the same one the desktop app shows with
 * no server. This file only joins it to the workspace's skills.
 */
export function SkillsView({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const skills = useQuery(trpc.skill.list.queryOptions());

  // A failed change is reported by the screen, beside the text it failed on.
  const settled = { onSettled: () => void queryClient.invalidateQueries() };
  const create = useMutation(trpc.skill.create.mutationOptions(settled));
  const update = useMutation(trpc.skill.update.mutationOptions(settled));
  const reset = useMutation(trpc.skill.reset.mutationOptions(settled));
  const remove = useMutation(trpc.skill.delete.mutationOptions(settled));

  // `name` and `loading` are sent for every skill and ignored by the server
  // for a built-in, so the form has one submit path.
  const complete = ({ loading = "on_demand", ...draft }: SkillDraft) => ({
    ...draft,
    loading,
  });

  return (
    <Page>
      <PageHeader
        title="Skills"
        description="Instructions the assistant follows when it answers."
      />
      <SkillsSettings
        skills={skills.data ?? null}
        error={skills.error?.message ?? null}
        canManage={canManage}
        loadingModes
        // The skill router's own limits, so the form stops where it would.
        limits={{ nameChars: 64, descriptionChars: 200, instructionsChars: 20_000 }}
        preview={(markdown) => <MessageResponse>{markdown}</MessageResponse>}
        onCreate={(draft) => create.mutateAsync(complete(draft))}
        onUpdate={(id, draft) => update.mutateAsync({ ...complete(draft), id })}
        onReset={(id) => reset.mutateAsync({ id })}
        onDelete={(id) => remove.mutateAsync({ id })}
      />
    </Page>
  );
}
