/**
 * Local mode's settings: one page per row of the shared settings menu
 * (`@onirix/ui/lib/settings-nav`), shown in the content area while the
 * sidebar holds the menu.
 *
 * The menu is the workspace's, whole. A page that needs a server still opens:
 * it says what it is for and what it needs, with the form that connects one
 * right there (`needsServer`). Documents and skills are not among those: they
 * work here.
 */
import { type ReactNode, useState } from "react";

import { PROVIDERS, modelReasons } from "@onirix/llm/catalog";
import { AnswerEffortControl, answerEffortSummary } from "@onirix/ui/components/answer-effort";
import { AppearanceSettings } from "@onirix/ui/components/appearance-settings";
import { Button } from "@onirix/ui/components/button";
import { Switch } from "@onirix/ui/components/switch";
import { cn } from "@onirix/ui/lib/utils";

import type {
  Appearance,
  LibraryDocument,
  LocalState,
  ModelChoice,
  WebAccess,
} from "../src/local-bridge";

import { errorMessage, getBridge } from "./bridge";
import { describeChoice } from "./model-label";
import { ModelLibrary } from "./model-library";
import { ServerForm } from "./server-form";
import { DocumentsSettings } from "./settings-documents";
import { type SettingsPage, serverOnlyReason, settingsTitle } from "@onirix/ui/lib/settings-nav";
import { PageHeading, Row, Section } from "@onirix/ui/components/settings-section";
import { SkillsSettings } from "./settings-skills";
import { OPTION, TILE } from "./tokens";
import { WebAccessDialog } from "./web-access-dialog";

/** The sentence under a page's title, on the pages that have one to say. */
const LEAD: Partial<Record<SettingsPage, string>> = {
  skills:
    "Instructions the assistant follows when it answers. Every skill that is on goes into every answer, so keep them short.",
};

const SHORTCUTS: readonly { keys: string; what: string }[] = [
  { keys: "N", what: "New session" },
  { keys: "B", what: "Open or close the sidebar" },
  { keys: ",", what: "Settings" },
];

/**
 * What the website setting comes to for the model in use. A provider with a
 * key searches by itself, so the setting is handed to it; how far each one can
 * follow it is in the catalog (`webSearch`). A model on this computer has
 * nothing to follow it with until it gets a web fetch tool, and the row says
 * so instead of looking like a switch that works.
 */
function webAccessSummary(model: ModelChoice | null, { enabled, sites }: WebAccess): string {
  if (model?.kind === "local") return "Not used by local models yet.";
  if (model && PROVIDERS[model.provider].webSearch === "none") {
    return `Not used by ${PROVIDERS[model.provider].label} models yet.`;
  }
  if (!enabled) return "Off";
  if (sites.length === 0) return "Any website";
  if (model && PROVIDERS[model.provider].webSearch === "all-or-nothing") {
    return `${PROVIDERS[model.provider].label} cannot keep to a list, so it does not search.`;
  }
  return sites.length === 1 ? sites[0]! : `${sites.length} websites`;
}

export function SettingsView({
  page,
  banner,
  state,
  library,
  onLibraryChange,
  onModelChange,
  onAppearanceChange,
  onWebAccessChange,
  onAnswerEffortChange,
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
  onWebAccessChange: (webAccess: WebAccess) => void;
  onAnswerEffortChange: (effort: LocalState["answerEffort"]) => void;
  /** Opens the setup at the choice of Local, API key, or Server. */
  onChangeModel: () => void;
  onReplaySetup: () => void;
}) {
  const { model, webAccess, answerEffort } = state;
  // A local model gets no reasoning option at all (see `reasoningEffortOptions`),
  // so the control is only live for a model reached with a key.
  const reasons = model?.kind === "api" && modelReasons(model.provider, model.model);
  const [managingSites, setManagingSites] = useState(false);
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
            <PageHeading title={settingsTitle(page)} description={LEAD[page]} />
          )}
          {page === "general" ? (
            <>
              {/* Short on purpose. Local mode has few switches, and a page
                  padded with ones that do nothing would be worse than a short
                  page. Besides those it has keys worth knowing. */}
              <Section title="Web">
                <div className={TILE}>
                  <Row
                    title="External website access"
                    description={webAccessSummary(model, webAccess)}
                  >
                    <Button
                      variant="outline"
                      className="rounded-full px-4"
                      onClick={() => setManagingSites(true)}
                    >
                      Manage
                    </Button>
                    <Switch
                      aria-label="External website access"
                      checked={webAccess.enabled}
                      onCheckedChange={(enabled) => onWebAccessChange({ ...webAccess, enabled })}
                    />
                  </Row>
                </div>
              </Section>
              <WebAccessDialog
                open={managingSites}
                onOpenChange={setManagingSites}
                sites={webAccess.sites}
                onSitesChange={(sites) => onWebAccessChange({ ...webAccess, sites })}
              />
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
              <Section title="Setup">
                <div className={TILE}>
                  <Row title="Welcome tour">
                    <Button variant="outline" className="rounded-full px-4" onClick={onReplaySetup}>
                      Replay
                    </Button>
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
                      variant="destructive"
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

              {model ? (
                <div className={TILE}>
                  <Row
                    title="Thinking"
                    description={
                      model.kind === "local"
                        ? "Local models take no thinking setting."
                        : answerEffortSummary(answerEffort, reasons)
                    }
                  >
                    <AnswerEffortControl
                      value={answerEffort}
                      disabled={!reasons}
                      onValueChange={onAnswerEffortChange}
                    />
                  </Row>
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
              </div>
            </Section>
          ) : null}
        </div>
      </div>
      )}
    </div>
  );
}
