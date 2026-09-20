/**
 * Local mode's settings: one page per row of the settings menu (see
 * settings-nav.ts), shown in the content area while the sidebar holds the
 * menu. The header row names the page, as it names a conversation elsewhere.
 *
 * The menu is the workspace's, whole. A page that needs a server still opens:
 * it says what it is for and what it needs, with the form that connects one
 * right there (see `needsServer` in settings-nav.ts). Documents and skills are
 * not among those: they work here.
 */
import type { ReactNode } from "react";

import { PROVIDERS } from "@onirix/llm/catalog";
import { AppearanceSettings } from "@onirix/ui/components/appearance-settings";
import { Button } from "@onirix/ui/components/button";
import { cn } from "@onirix/ui/lib/utils";

import type { Appearance, LibraryDocument, LocalState, ModelChoice } from "../src/local-bridge";

import { errorMessage, getBridge } from "./bridge";
import { describeChoice } from "./model-label";
import { ModelLibrary } from "./model-library";
import { ServerForm } from "./server-form";
import { DocumentsSettings } from "./settings-documents";
import { type SettingsPage, serverOnlyReason, settingsTitle } from "./settings-nav";
import { Section } from "./settings-section";
import { SkillsSettings } from "./settings-skills";
import { OPTION, TILE } from "./tokens";

/** One line of a settings tile: what it is on the left, the control on the right. */
function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm">{title}</span>
        {description ? <span className="text-ink-03 text-xs select-text">{description}</span> : null}
      </div>
      {children}
    </div>
  );
}

const SHORTCUTS: readonly { keys: string; what: string }[] = [
  { keys: "N", what: "New session" },
  { keys: "B", what: "Open or close the sidebar" },
  { keys: ",", what: "Settings" },
];

export function SettingsView({
  page,
  banner,
  state,
  library,
  onLibraryChange,
  onModelChange,
  onAppearanceChange,
  onChangeModel,
  onReplaySetup,
}: {
  page: SettingsPage;
  /** A notice from the shell, shown under the header row. */
  banner: ReactNode;
  state: LocalState;
  library: LibraryDocument[];
  onLibraryChange: () => Promise<void>;
  onModelChange: (choice: ModelChoice | null) => void;
  onAppearanceChange: (appearance: Appearance) => void;
  /** Opens the setup at the choice of Local, API key, or Server. */
  onChangeModel: () => void;
  onReplaySetup: () => void;
}) {
  const { model } = state;
  const needsServer = serverOnlyReason(page);
  const modifier = state.platform === "darwin" ? "Cmd" : "Ctrl";

  async function useLocalModel(name: string) {
    try {
      onModelChange(await getBridge().model.useLocal(name));
    } catch (failure) {
      throw new Error(errorMessage(failure));
    }
  }

  async function changeApiModel(id: string) {
    onModelChange(await getBridge().model.changeApiModel(id));
  }

  async function removeModel() {
    await getBridge().model.clear();
    onModelChange(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* A settings page carries its own heading, so the top row says nothing
          and draws no line. It is still here: in the macOS window this empty
          strip is what the window is dragged by, and it keeps the page clear
          of the controls that sit in the corner while the sidebar is shut. */}
      <div data-slot="shell-header" aria-hidden className="h-shell shrink-0" />
      {banner}

      {page === "local-models" ? (
        /* The model browser is two panes that scroll on their own, so it takes
           the whole content area instead of the centred column. */
        <div className="flex min-h-0 flex-1 flex-col">
          <h1 className="px-6 pt-4 pb-4 text-2xl font-medium tracking-display">
            {settingsTitle(page)}
          </h1>
          <div className="min-h-0 flex-1 border-t">
            <ModelLibrary choice={model} onUse={useLocalModel} />
          </div>
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            "mx-auto flex w-full flex-col gap-10 px-6 pt-4 pb-10",
            // The Appearance screen is the shared one, laid out for a wider
            // column than a form needs.
            page === "appearance" ? "max-w-3xl" : "max-w-2xl",
          )}
        >
          {/* Appearance is the shared screen and brings its own heading. */}
          {page === "appearance" ? null : (
            <h1 className="text-2xl font-medium tracking-display">{settingsTitle(page)}</h1>
          )}
          {page === "general" ? (
            <>
              {/* Short on purpose. Local mode has few switches, and a page
                  padded with ones that do nothing would be worse than a short
                  page. What it does have is keys worth knowing. */}
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
            </>
          ) : null}

          {page === "appearance" ? (
            /* The product's shared Appearance screen, heading and "Restore
               defaults" included. The mode is the shell's to hold (it drives
               the native theme too); colours, fonts and contrast are the
               component's own, kept in this window's storage. */
            <AppearanceSettings mode={state.appearance} onModeChange={onAppearanceChange} heading />
          ) : null}

          {page === "model" ? (
            <Section title="Language model" description="What answers your messages in this app.">
              <div className={TILE}>
                <Row
                  title={model ? describeChoice(model) : "No language model is set up."}
                  description={
                    model
                      ? model.kind === "api"
                        ? "The key is stored encrypted on this computer."
                        : "Nothing you write leaves this computer."
                      : "You can look around without one. Sending a message needs one."
                  }
                >
                  <Button variant="outline" className="rounded-full px-4" onClick={onChangeModel}>
                    {model ? "Change" : "Set up a model"}
                  </Button>
                  {model ? (
                    <Button
                      variant="ghost"
                      className="rounded-full px-4"
                      onClick={() => void removeModel()}
                    >
                      Remove
                    </Button>
                  ) : null}
                </Row>
              </div>

              {model?.kind === "api" ? (
                <div
                  role="radiogroup"
                  aria-label={`${PROVIDERS[model.provider].label} model`}
                  className="flex flex-wrap gap-2"
                >
                  {PROVIDERS[model.provider].chatModels.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      role="radio"
                      aria-checked={model.model === entry.id}
                      onClick={() => void changeApiModel(entry.id)}
                      className={cn(OPTION, "h-9 rounded-full px-4 text-sm")}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </Section>
          ) : null}

          {page === "documents" ? (
            <DocumentsSettings library={library} onLibraryChange={onLibraryChange} />
          ) : null}

          {page === "skills" ? <SkillsSettings /> : null}

          {needsServer ? (
            <Section title="This needs an Onirix server" description={needsServer}>
              <div className={cn("p-4", TILE)}>
                <ServerForm defaultAddress={state.suggestedServer} />
              </div>
            </Section>
          ) : null}

          {page === "server" ? (
            <Section
              title="Connect a server"
              description="Your own documents work here. Shared company knowledge, connectors, teams and database sources live on an Onirix server."
            >
              <div className={cn("p-4", TILE)}>
                <ServerForm defaultAddress={state.suggestedServer} />
              </div>
            </Section>
          ) : null}

          {page === "about" ? (
            <Section title="About Onirix">
              <div className={cn("divide-y", TILE)}>
                <Row title="Version" description={`Onirix ${state.version}`}>
                  <Button
                    variant="outline"
                    className="rounded-full px-4"
                    onClick={() => void getBridge().app.checkForUpdates()}
                  >
                    Check for updates
                  </Button>
                </Row>
                <Row
                  title="Your data"
                  description="Chats, documents and settings are files in one folder on this computer."
                >
                  <Button
                    variant="outline"
                    className="rounded-full px-4"
                    onClick={() => void getBridge().app.openDataFolder()}
                  >
                    Open the folder
                  </Button>
                </Row>
                <Row title="Welcome tour">
                  <Button variant="outline" className="rounded-full px-4" onClick={onReplaySetup}>
                    Replay
                  </Button>
                </Row>
              </div>
            </Section>
          ) : null}
        </div>
      </div>
      )}
    </div>
  );
}
