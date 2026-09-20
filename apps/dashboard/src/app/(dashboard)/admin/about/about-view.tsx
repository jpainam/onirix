"use client";

import { useSyncExternalStore } from "react";

import { Row, Section, TILE } from "@onirix/ui/components/settings-section";
import { cn } from "@onirix/ui/lib/utils";

import { getDesktopBridge } from "@/lib/desktop";

const subscribe = () => () => {};

export function AboutView({ version }: { version: string }) {
  // The desktop window is a second program with a version of its own.
  const desktopVersion = useSyncExternalStore(
    subscribe,
    () => getDesktopBridge()?.version ?? null,
    () => null,
  );

  return (
    <Section title="Version">
      <div className={cn("divide-y", TILE)}>
        <Row title="Server" description={`Onirix ${version}`} />
        {desktopVersion ? (
          <Row title="Desktop app" description={`Onirix ${desktopVersion}`} />
        ) : null}
      </div>
    </Section>
  );
}
