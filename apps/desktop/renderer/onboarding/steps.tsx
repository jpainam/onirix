// Adapted from Synara (MIT), Copyright (c) 2026 T3 Tools Inc. and Emanuele Di Pietro.

/**
 * The bodies of the setup steps that are only words: the welcome, the choice
 * of how Onirix answers, and the closing summary. The steps that do work
 * (model store, API key, server) are the same components Settings uses.
 */
import {
  CpuIcon,
  FileTextIcon,
  KeyRoundIcon,
  LockIcon,
  type LucideIcon,
  ServerIcon,
  SlidersHorizontalIcon,
} from "@onirix/ui/lib/icons";

import { cn } from "@onirix/ui/lib/utils";

import { OPTION, TILE } from "../tokens";

const WELCOME_POINTS: readonly { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Private by default",
    description: "Chats and documents stay on this computer.",
    icon: LockIcon,
  },
  {
    title: "Your own model",
    description: "A local model, or your own API key.",
    icon: SlidersHorizontalIcon,
  },
  {
    title: "Answers from your files",
    description: "Attach documents and see the passage behind each claim.",
    icon: FileTextIcon,
  },
];

export function WelcomeStep() {
  return (
    <ul className="grid grid-cols-3 gap-4">
      {WELCOME_POINTS.map((point) => (
        <li key={point.title} className={cn("flex flex-col gap-2.5 p-5", TILE)}>
          <point.icon className="text-ink-04 size-4.5" aria-hidden />
          <span className="font-medium">{point.title}</span>
          <span className="text-ink-03 leading-normal">{point.description}</span>
        </li>
      ))}
    </ul>
  );
}

export type SetupPath = "local" | "api" | "server";

const PATHS: readonly { id: SetupPath; title: string; description: string; icon: LucideIcon }[] = [
  {
    id: "local",
    title: "Local",
    description: "Download an open source model. Nothing leaves this computer.",
    icon: CpuIcon,
  },
  {
    id: "api",
    title: "API key",
    description: "Use your own key from OpenAI, Anthropic, Google or xAI.",
    icon: KeyRoundIcon,
  },
  {
    id: "server",
    title: "Server",
    description: "Connect to your company's Onirix server for shared knowledge and teams.",
    icon: ServerIcon,
  },
];

export function ChoiceStep({
  value,
  onChange,
  onConfirm,
}: {
  value: SetupPath;
  onChange: (path: SetupPath) => void;
  /** A double click on a card is the card and Continue in one gesture. */
  onConfirm: () => void;
}) {
  return (
    <div role="radiogroup" aria-label="How Onirix answers" className="grid grid-cols-3 gap-4">
      {PATHS.map((path) => (
        <button
          key={path.id}
          type="button"
          role="radio"
          aria-checked={value === path.id}
          onClick={() => onChange(path.id)}
          onDoubleClick={onConfirm}
          className={cn(OPTION, "flex h-44 flex-col gap-2.5 p-5")}
        >
          <path.icon className="text-ink-04 size-4.5" aria-hidden />
          <span className="font-medium">{path.title}</span>
          <span className="text-ink-03 leading-normal">{path.description}</span>
        </button>
      ))}
    </div>
  );
}

const DONE_POINTS = [
  "Attach documents from the panel on the right. Answers cite the passage they used.",
  "Your chats are in the sidebar, and only on this computer.",
  "Change the model, or connect a server, in Settings.",
];

export function DoneStep() {
  return (
    <ul className={cn("mx-auto w-full max-w-md divide-y", TILE)}>
      {DONE_POINTS.map((point) => (
        <li key={point} className="text-ink-04 px-4 py-3">
          {point}
        </li>
      ))}
    </ul>
  );
}
