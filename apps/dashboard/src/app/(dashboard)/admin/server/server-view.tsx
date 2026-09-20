"use client";

import { useSyncExternalStore } from "react";

import { Button } from "@onirix/ui/components/button";
import { Row, Section, TILE } from "@onirix/ui/components/settings-section";

import { getDesktopBridge } from "@/lib/desktop";

const subscribe = () => () => {};

/**
 * Which Onirix server the desktop window is attached to, and the way to point
 * it somewhere else. A browser tab has an address bar for that, so the menu
 * only lists this page inside the desktop app.
 */
export function ServerView() {
  const origin = useSyncExternalStore(
    subscribe,
    () => getDesktopBridge()?.server.origin ?? null,
    () => null,
  );

  if (!origin) {
    return (
      <p className="text-ink-03 text-sm">
        This page belongs to the Onirix desktop app. In a browser, the server is the address you
        opened.
      </p>
    );
  }

  return (
    <Section
      title="Connected server"
      description="Documents, skills and settings here belong to this server's workspace."
    >
      <div className={TILE}>
        <Row title={origin} description="Changing it opens the connect screen, to point the app somewhere else.">
          <Button
            variant="outline"
            size="pill"
            onClick={() => void getDesktopBridge()?.server.change()}
          >
            Change server
          </Button>
        </Row>
      </div>
    </Section>
  );
}
