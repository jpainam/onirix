/**
 * Bring your own key: a provider, the key, and one of that provider's models.
 *
 * The key is checked with one small request before it is saved (the shell
 * does that, this page has no network), so a wrong key fails here, on the form
 * it was pasted into, with a sentence about what is wrong. Once saved it never
 * comes back to this page: the field is for entering a key, not for reading
 * one.
 */
import { EyeIcon, EyeOffIcon } from "@onirix/ui/lib/icons";
import { type FormEvent, useEffect, useState } from "react";

import { PROVIDERS } from "@onirix/llm/catalog";
import { Button } from "@onirix/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@onirix/ui/components/input-group";
import { Spinner } from "@onirix/ui/components/spinner";
import { cn } from "@onirix/ui/lib/utils";

import { API_PROVIDER_IDS, type ApiProviderId, LIMITS, type ModelChoice } from "../src/local-bridge";

import { errorMessage, getBridge } from "./bridge";
import { OPTION } from "./tokens";

export function ApiKeyForm({
  formId,
  initialProvider,
  onSaved,
  onBusyChange,
  onReadyChange,
  showSubmit = false,
}: {
  /** Lets a button outside the form (the setup dialog's footer) submit it. */
  formId: string;
  initialProvider?: ApiProviderId;
  onSaved: (choice: ModelChoice) => void;
  onBusyChange?: (busy: boolean) => void;
  onReadyChange?: (ready: boolean) => void;
  showSubmit?: boolean;
}) {
  const [provider, setProvider] = useState<ApiProviderId>(initialProvider ?? "openai");
  const [model, setModel] = useState(PROVIDERS[initialProvider ?? "openai"].chatModels[0]?.id ?? "");
  const [apiKey, setApiKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spec = PROVIDERS[provider];
  const ready = apiKey.trim().length > 0 && model.length > 0;

  useEffect(() => onReadyChange?.(ready), [onReadyChange, ready]);
  // A saved key moves the dialog on and unmounts this form before `busy` can
  // settle, so leaving reports it too: the footer must not keep spinning.
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [onBusyChange, busy]);

  function chooseProvider(next: ApiProviderId) {
    setProvider(next);
    setModel(PROVIDERS[next].chatModels[0]?.id ?? "");
    // A key belongs to one provider; carrying it across would only fail later.
    setApiKey("");
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const choice = await getBridge().model.useApiKey({ provider, model, apiKey: apiKey.trim() });
      setApiKey("");
      onSaved(choice);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id={formId} onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="mb-2 text-sm font-medium">Provider</legend>
        <div role="radiogroup" aria-label="Provider" className="grid grid-cols-4 gap-2.5">
          {API_PROVIDER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={provider === id}
              onClick={() => chooseProvider(id)}
              className={cn(OPTION, "flex h-12 items-center justify-center px-3 font-medium")}
            >
              {PROVIDERS[id].label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${formId}-key`} className="text-sm font-medium">
          {spec.label} API key
        </label>
        <InputGroup>
          <InputGroupInput
            id={`${formId}-key`}
            type={reveal ? "text" : "password"}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            maxLength={LIMITS.apiKeyChars}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            placeholder="Paste your key"
            aria-invalid={error ? true : undefined}
            className="font-mono placeholder:font-sans"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label={reveal ? "Hide key" : "Show key"}
              onClick={() => setReveal((shown) => !shown)}
            >
              {reveal ? <EyeOffIcon /> : <EyeIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <p className="text-ink-03 text-xs">
          Kept encrypted on this computer and sent only to {spec.label}.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="mb-2 text-sm font-medium">Model</legend>
        <div role="radiogroup" aria-label="Model" className="flex flex-wrap gap-2">
          {spec.chatModels.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={model === entry.id}
              onClick={() => setModel(entry.id)}
              className={cn(OPTION, "h-9 rounded-full px-4")}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </fieldset>

      {error ? (
        <p className="text-destructive text-sm select-text" role="alert">
          {error}
        </p>
      ) : null}

      {showSubmit ? (
        <div>
          <Button type="submit" className="rounded-full px-4" disabled={!ready || busy}>
            {busy ? <Spinner /> : null}
            {busy ? "Checking the key" : "Check and save"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
