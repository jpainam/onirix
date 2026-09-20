/**
 * Local skills: the instructions a local answer follows.
 *
 * The same idea as a workspace's skills (packages/db/src/skills.ts): a few ship
 * with the app, the person can edit them, turn them off, put them back the way
 * they shipped, and write their own. They are one JSON file beside the chats.
 *
 * One thing differs from a server. There, a skill can load on demand through a
 * `load_skill` tool call. Local mode has no tools, and the small models it is
 * built to run are the ones least reliable at calling one, so every enabled
 * skill is in every prompt. That is why the page says to keep them short.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { writeJsonAtomic } from "./atomic-write";
import { LIMITS, type LocalSkill, type SkillDraft } from "./local-bridge";
import { localDir } from "./local-store";

type Seed = Omit<LocalSkill, "enabled" | "builtIn"> & { requiresContext?: boolean };

/**
 * The server's built-in skills, reworded for one person's documents. `charts`
 * is not among them: it describes a tool, and there are none here.
 *
 * A built-in's id is its own name, which is what lets one that was never
 * edited exist without a row in the file.
 */
const SEEDS: readonly Seed[] = [
  {
    id: "grounding",
    name: "grounding",
    description:
      "How to separate what the attached documents say from inference and general knowledge.",
    // Only sent with documents: "prefer the documents" means nothing without any.
    requiresContext: true,
    instructions: `# Grounding
- Answer from the person's documents supplied below, in preference to your general knowledge.
- Make it clear which parts of an answer come from the documents, which are your inference, and which are general knowledge.
- If the documents do not contain the answer, say so plainly. Never invent a source, a quotation, or a citation.
- If the documents disagree with each other, surface the disagreement instead of silently picking one.`,
  },
  {
    id: "citations",
    name: "citations",
    description: "How to cite the attached documents inline, so every claim can be checked.",
    // Telling a model how to cite when it has nothing to cite invites a
    // citation to a source that was never supplied.
    requiresContext: true,
    // The `[n]` format is a contract, not a style: the window turns those
    // markers into the chips that open a passage, so rewording it away costs
    // the answer its citations. "Reset to default" is the way back.
    instructions: `# Citations
CRITICAL: When referencing knowledge from the documents, cite the relevant statements INLINE using the format [1], [2], [3], matching the "index" of the supplied documents. Cite as you go rather than collecting citations at the end, and do not append links after a citation.`,
  },
  {
    id: "response-style",
    name: "response-style",
    description: "How an answer is shaped: what comes first, how it is formatted, how long it runs.",
    instructions: `# Response style
- Answer the question directly first, then supply the supporting detail.
- Use Markdown: headings, lists, and tables where they aid readability.
- Be concise. Do not restate the question or pad the answer.`,
  },
];

const SEEDS_BY_ID = new Map(SEEDS.map((seed) => [seed.id, seed]));

const OWN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The server's rule for a name (packages/api/src/routers/skill.ts). Nothing
 * here needs a model to reproduce it, but a skill written on this computer
 * should be one a server would accept as it is.
 */
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function skillsFile(): string {
  return join(localDir(), "skills.json");
}

export function assertSkillId(id: unknown): string {
  if (typeof id !== "string" || !(OWN_ID.test(id) || SEEDS_BY_ID.has(id))) {
    throw new Error("Unknown skill.");
  }
  return id;
}

/** A file on disk is input like any other: it may have been edited, or cut short. */
function parseStored(value: unknown): LocalSkill | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.description !== "string" ||
    typeof row.instructions !== "string" ||
    typeof row.enabled !== "boolean"
  ) {
    return null;
  }
  const builtIn = SEEDS_BY_ID.has(row.id);
  if (!builtIn && !OWN_ID.test(row.id)) return null;
  return {
    id: row.id,
    // A built-in keeps the name it shipped with, whatever the file says.
    name: builtIn ? row.id : row.name,
    description: row.description,
    instructions: row.instructions,
    enabled: row.enabled,
    builtIn,
  };
}

let cache: LocalSkill[] | null = null;

/**
 * What the file holds, plus any built-in it does not. Nothing is written on a
 * read: a built-in nobody has touched needs no row, and one shipped in a later
 * release shows up the same way. An edited or disabled row counts as present,
 * so this never reinstates text the person deliberately changed.
 */
function readSkills(): LocalSkill[] {
  if (cache) return cache;
  let stored: LocalSkill[] = [];
  try {
    const raw = JSON.parse(readFileSync(skillsFile(), "utf8")) as unknown;
    if (Array.isArray(raw)) {
      stored = raw.map(parseStored).filter((row): row is LocalSkill => row !== null);
    }
  } catch {
    // Missing or unreadable: the built-ins alone.
  }
  const byId = new Map(stored.map((row) => [row.id, row]));
  const builtIns = SEEDS.map((seed) => byId.get(seed.id) ?? fromSeed(seed));
  const own = stored
    .filter((row) => !row.builtIn)
    .sort((a, b) => a.name.localeCompare(b.name));
  cache = [...builtIns, ...own];
  return cache;
}

function fromSeed(seed: Seed): LocalSkill {
  return {
    id: seed.id,
    name: seed.name,
    description: seed.description,
    instructions: seed.instructions,
    enabled: true,
    builtIn: true,
  };
}

function writeSkills(next: LocalSkill[]): void {
  mkdirSync(localDir(), { recursive: true });
  writeJsonAtomic(
    skillsFile(),
    // `builtIn` is derived from the id on the way back in.
    next.map(({ builtIn: _builtIn, ...row }) => row),
  );
  cache = null;
}

function text(value: unknown, maxChars: number, what: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${what} is empty.`);
  const cleaned = value.trim();
  if (cleaned.length > maxChars) throw new Error(`${what} is too long.`);
  return cleaned;
}

function parseDraft(input: unknown): SkillDraft {
  const draft = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  const name = text(draft.name, LIMITS.skillNameChars, "The name");
  if (name.length < 2 || !NAME.test(name)) {
    throw new Error("Use lowercase letters, numbers and single hyphens, e.g. expense-policy.");
  }
  return {
    name,
    description: text(draft.description, LIMITS.skillDescriptionChars, "The description"),
    instructions: text(draft.instructions, LIMITS.skillInstructionsChars, "The instructions"),
    enabled: draft.enabled !== false,
  };
}

export function listSkills(): LocalSkill[] {
  return readSkills();
}

export function createSkill(input: unknown): LocalSkill {
  const draft = parseDraft(input);
  const skills = readSkills();
  if (skills.length >= LIMITS.skills) throw new Error(`Keep to ${LIMITS.skills} skills.`);
  if (skills.some((row) => row.name === draft.name)) {
    throw new Error("A skill with that name already exists.");
  }
  const created: LocalSkill = { id: randomUUID(), ...draft, builtIn: false };
  writeSkills([...skills, created]);
  return created;
}

export function updateSkill(id: string, input: unknown): LocalSkill {
  const skills = readSkills();
  const current = skills.find((row) => row.id === id);
  if (!current) throw new Error("That skill no longer exists.");
  // A built-in's name is what ties the row to the text it can be reset to, so
  // whatever the form sent for it is ignored.
  const draft = parseDraft(
    current.builtIn && typeof input === "object" && input !== null
      ? { ...input, name: current.name }
      : input,
  );
  if (skills.some((row) => row.id !== id && row.name === draft.name)) {
    throw new Error("A skill with that name already exists.");
  }
  const updated: LocalSkill = { ...current, ...draft };
  writeSkills(skills.map((row) => (row.id === id ? updated : row)));
  return updated;
}

/** Puts a built-in back the way it shipped, switched on. */
export function resetSkill(id: string): LocalSkill {
  const seed = SEEDS_BY_ID.get(id);
  if (!seed) throw new Error("Only a built-in skill can be reset.");
  const restored = fromSeed(seed);
  writeSkills(readSkills().map((row) => (row.id === id ? restored : row)));
  return restored;
}

export function removeSkill(id: string): void {
  // The grounding rules disappearing on a stray click is not a state worth
  // offering. A built-in can be turned off, which says the same thing on purpose.
  if (SEEDS_BY_ID.has(id)) throw new Error("A built-in skill can be turned off, not deleted.");
  writeSkills(readSkills().filter((row) => row.id !== id));
}

/** The enabled skills, as the block of the system prompt they make up. */
export function promptFor(options: { hasContext: boolean }): string {
  return readSkills()
    .filter((row) => row.enabled)
    .filter((row) => options.hasContext || !SEEDS_BY_ID.get(row.id)?.requiresContext)
    .map((row) => row.instructions.trim())
    .join("\n\n");
}
