"use client";

import { useSyncExternalStore } from "react";

import { Row, Section, TILE } from "@onirix/ui/components/settings-section";
import { cn } from "@onirix/ui/lib/utils";

const SHORTCUTS: readonly { keys: string; what: string }[] = [
  { keys: "K", what: "Search" },
  { keys: "B", what: "Open or close the sidebar" },
];

const subscribe = () => () => {};

/** The keys worth knowing, named the way this computer's keyboard names them. */
export function Shortcuts() {
  // Only the browser knows the platform, so the server renders "Ctrl" and a
  // Mac corrects it straight after.
  const mac = useSyncExternalStore(
    subscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
  const modifier = mac ? "Cmd" : "Ctrl";

  return (
    <Section title="Keyboard">
      <div className={cn("divide-y", TILE)}>
        {SHORTCUTS.map((shortcut) => (
          <Row key={shortcut.keys} title={shortcut.what}>
            <kbd className="text-ink-03 font-mono text-xs">
              {modifier} {shortcut.keys}
            </kbd>
          </Row>
        ))}
        <Row title="Send a message">
          <kbd className="text-ink-03 font-mono text-xs">Enter</kbd>
        </Row>
        <Row title="Add a line to a message">
          <kbd className="text-ink-03 font-mono text-xs">Shift Enter</kbd>
        </Row>
      </div>
    </Section>
  );
}
