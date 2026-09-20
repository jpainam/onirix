// Adapted from Synara (MIT), Copyright (c) 2026 T3 Tools Inc. and Emanuele Di Pietro.

/**
 * The first-run setup: welcome, how Onirix should answer, that one thing set
 * up, done.
 *
 * It sits over the app rather than in front of it. The app behind is already
 * usable, "Skip setup" is on every step but the last, and closing the dialog
 * counts as having seen it. Setup is an offer: someone who declines it meets
 * the question again only when they send a message with no model to answer.
 *
 * The popup is a fixed 800x540 frame for every step, so nothing resizes as
 * the person moves through it. Hero steps (welcome, done) centre their content
 * in that frame and carry no step counter. There is no animation between
 * steps: the only motion is the dialog arriving and leaving.
 */
import { CheckIcon } from "@onirix/ui/lib/icons";
import { type RefObject, useRef, useState } from "react";

import { OnirixMark } from "@onirix/ui/brand/onirix-mark";
import { cn } from "@onirix/ui/lib/utils";

import type { LocalState, ModelChoice } from "../../src/local-bridge";

import { ApiKeyForm } from "../api-key-form";
import { errorMessage, getBridge } from "../bridge";
import { Modal, ModalDescription, ModalTitle } from "../modal";
import { describeChoice } from "../model-label";
import { ModelStore } from "../model-store";
import { ServerForm } from "../server-form";
import { INSET } from "./layout";
import { StepFooter } from "./step-footer";
import { ChoiceStep, DoneStep, type SetupPath, WelcomeStep } from "./steps";

export type OnboardingStart = "welcome" | "choice";

type Step = "welcome" | "choice" | SetupPath | "done";

/** The dots count places in the flow, not steps: the three setups share one. */
const POSITIONS = 4;

function positionOf(step: Step): number {
  if (step === "welcome") return 0;
  if (step === "choice") return 1;
  return step === "done" ? 3 : 2;
}

const TITLES: Record<Step, string> = {
  welcome: "Welcome to Onirix",
  choice: "Choose how Onirix answers",
  local: "Download a model",
  api: "Use your own API key",
  server: "Connect to a server",
  done: "You're all set",
};

const DESCRIPTIONS: Record<Exclude<Step, "done">, string> = {
  welcome:
    "Private AI that answers from your own documents. Pick how it answers, or skip this and look around first.",
  choice: "You can change this at any time in Settings.",
  local:
    "Open source models that run on this computer. Larger ones answer better and need more memory.",
  api: "Onirix talks to the provider straight from this computer, with your key.",
  server: "An Onirix server adds shared company knowledge, connectors, teams and database sources.",
};

const API_FORM = "onboarding-api-key";
const SERVER_FORM = "onboarding-server";

function Flow({
  start,
  state,
  onModelChange,
  onFinish,
  onBusyChange,
  busy,
  primaryRef,
}: {
  primaryRef: RefObject<HTMLButtonElement | null>;
  start: OnboardingStart;
  state: LocalState;
  onModelChange: (choice: ModelChoice) => void;
  onFinish: () => void;
  onBusyChange: (busy: boolean) => void;
  busy: boolean;
}) {
  const [step, setStep] = useState<Step>(start);
  const [path, setPath] = useState<SetupPath>("local");
  const [formReady, setFormReady] = useState(false);

  const hero = step === "welcome" || step === "done";
  const description =
    step === "done"
      ? state.model
        ? `Answers come from ${describeChoice(state.model)}`
        : "You can set up a model later in Settings."
      : DESCRIPTIONS[step];

  async function useLocalModel(model: string) {
    try {
      onModelChange(await getBridge().model.useLocal(model));
    } catch (failure) {
      throw new Error(errorMessage(failure));
    }
  }

  const footer = (() => {
    switch (step) {
      case "welcome":
        return { primaryLabel: "Get started", onPrimary: () => setStep("choice") };
      case "choice":
        return { primaryLabel: "Continue", onPrimary: () => setStep(path) };
      case "local":
        return {
          primaryLabel: "Continue",
          onPrimary: () => setStep("done"),
          // Continue means "this is the model I will use", so it waits for one.
          primaryDisabled: state.model?.kind !== "local",
        };
      case "api":
        return {
          primaryLabel: "Check and save",
          primaryBusyLabel: "Checking the key",
          primaryForm: API_FORM,
          primaryDisabled: !formReady,
        };
      case "server":
        return {
          primaryLabel: "Connect",
          primaryBusyLabel: "Connecting",
          primaryForm: SERVER_FORM,
          primaryDisabled: !formReady,
        };
      case "done":
        return { primaryLabel: "Start using Onirix", onPrimary: onFinish };
    }
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("flex flex-col gap-1.5 pt-8", INSET, hero && "items-center text-center")}>
        {step === "welcome" ? <OnirixMark className="mb-3.5 size-11" /> : null}
        {step === "done" ? (
          <span
            aria-hidden
            className="bg-success-subtle text-success mb-3.5 flex size-11 items-center justify-center rounded-full"
          >
            <CheckIcon className="size-5" />
          </span>
        ) : null}
        {hero ? null : (
          <span className="text-ink-02 text-xs font-medium tracking-[0.04em] uppercase">
            Step {step === "choice" ? 1 : 2} of 2
          </span>
        )}
        <ModalTitle className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">
          {TITLES[step]}
        </ModalTitle>
        <ModalDescription className="text-ink-03 max-w-[560px] text-[15px] leading-normal">
          {description}
        </ModalDescription>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto pt-6 pb-1",
          INSET,
          hero && "justify-center pb-6",
        )}
      >
        {step === "welcome" ? <WelcomeStep /> : null}
        {step === "choice" ? (
          <ChoiceStep value={path} onChange={setPath} onConfirm={() => setStep(path)} />
        ) : null}
        {step === "local" ? <ModelStore choice={state.model} onUse={useLocalModel} /> : null}
        {step === "api" ? (
          <ApiKeyForm
            formId={API_FORM}
            onBusyChange={onBusyChange}
            onReadyChange={setFormReady}
            onSaved={(choice) => {
              onModelChange(choice);
              setStep("done");
            }}
          />
        ) : null}
        {step === "server" ? (
          <ServerForm
            formId={SERVER_FORM}
            defaultAddress={state.suggestedServer}
            onBusyChange={onBusyChange}
            onReadyChange={setFormReady}
          />
        ) : null}
        {step === "done" ? <DoneStep /> : null}
      </div>

      <StepFooter
        position={positionOf(step)}
        positions={POSITIONS}
        showBack={step !== "welcome" && step !== "done"}
        showSkip={step !== "done"}
        onBack={() => setStep(step === "choice" ? "welcome" : "choice")}
        onSkip={onFinish}
        primaryBusy={busy}
        navigationLocked={busy}
        primaryRef={primaryRef}
        {...footer}
      />
    </div>
  );
}

export function OnboardingDialog({
  open,
  start,
  state,
  onModelChange,
  onClose,
}: {
  open: boolean;
  start: OnboardingStart;
  state: LocalState;
  onModelChange: (choice: ModelChoice) => void;
  /** Finished, skipped, or dismissed: the caller records all three alike. */
  onClose: () => void;
}) {
  // A key being checked or a server being probed cannot be called back. If the
  // dialog closed under one, it would report a skip and then save a model
  // anyway, so dismissal waits the few seconds it takes to settle.
  const [busy, setBusy] = useState(false);
  // Focus opens on the way forward, not on "Skip setup", which is merely the
  // first control in the markup. Enter then does what the eye expects.
  const primaryRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      initialFocus={primaryRef}
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      className="h-[540px] w-[800px]"
    >
      {/* Mounted per open, so a replay from Settings starts at its first step. */}
      {open ? (
        <Flow
          primaryRef={primaryRef}
          start={start}
          state={state}
          onModelChange={onModelChange}
          onFinish={onClose}
          onBusyChange={setBusy}
          busy={busy}
        />
      ) : null}
    </Modal>
  );
}
