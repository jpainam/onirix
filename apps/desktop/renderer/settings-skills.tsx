/**
 * Settings > Skills: the instructions local answers follow.
 *
 * The screen is the shared one, the dashboard's. What differs is where a skill
 * is kept (this computer, through the bridge) and that "when relevant" is
 * missing on purpose: loading a skill on demand is a tool call, local mode has
 * no tools, so a skill that is on is in every answer.
 */
import { code } from "@streamdown/code";
import { useEffect, useState } from "react";
import { Streamdown } from "streamdown";

import { SkillsSettings as SkillsScreen } from "@onirix/ui/components/skills-settings";

import { LIMITS, type LocalSkill } from "../src/local-bridge";

import { errorMessage, getBridge } from "./bridge";

// Held at module scope so the memoised markdown is not invalidated per render.
const plugins = { code };

/** The bridge rejects with an IPC-wrapped error; the screen shows a sentence. */
async function readable<T>(change: Promise<T>): Promise<T> {
  try {
    return await change;
  } catch (failure) {
    throw new Error(errorMessage(failure));
  }
}

export function SkillsSettings() {
  const [skills, setSkills] = useState<LocalSkill[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  /** The list is read again whether the change landed or not. */
  function change(work: Promise<unknown>) {
    return readable(work).finally(refresh);
  }

  return (
    <SkillsScreen
      skills={skills}
      error={error}
      limits={{
        skills: LIMITS.skills,
        nameChars: LIMITS.skillNameChars,
        descriptionChars: LIMITS.skillDescriptionChars,
        instructionsChars: LIMITS.skillInstructionsChars,
      }}
      preview={(markdown) => <Streamdown plugins={plugins}>{markdown}</Streamdown>}
      onCreate={({ loading: _loading, ...draft }) => change(getBridge().skills.create(draft))}
      onUpdate={(id, { loading: _loading, ...draft }) =>
        change(getBridge().skills.update(id, draft))
      }
      onReset={(id) => change(getBridge().skills.reset(id))}
      onDelete={(id) => change(getBridge().skills.remove(id))}
    />
  );
}
