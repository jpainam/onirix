/**
 * Bring your own key: a provider, the key, and one of that provider's models.
 *
 * The key is checked with one small request before it is saved (the shell
 * does that, this page has no network), so a wrong key fails here, on the form
 * it was pasted into, with a sentence about what is wrong. Once saved it never
 * comes back to this page: the field is for entering a key, not for reading
 * one.
 *
 * The form's state lives in `ApiKeyFormProvider`, not in the fields, so a
 * button drawn somewhere else (the setup dialog's footer) reads the same
 * `busy` and `ready` the fields do, and the state outlives the fields when a
 * saved key moves the dialog on.
 */
import { EyeIcon, EyeOffIcon } from "@onirix/ui/lib/icons";
import { createContext, type FormEvent, type ReactNode, useContext, useId, useState } from "react";

import { PROVIDERS } from "@onirix/llm/catalog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@onirix/ui/components/input-group";
import { cn } from "@onirix/ui/lib/utils";

import { API_PROVIDER_IDS, type ApiProviderId, LIMITS, type ModelChoice } from "../src/local-bridge";

import { errorMessage, getBridge } from "./bridge";
import { OPTION } from "./tokens";

type ApiKeyFormState = {
  /** What a submit button outside the form points its `form` attribute at. */
  formId: string;
  provider: ApiProviderId;
  model: string;
  apiKey: string;
  busy: boolean;
  ready: boolean;
  error: string | null;
  chooseProvider: (provider: ApiProviderId) => void;
  setModel: (model: string) => void;
  setApiKey: (apiKey: string) => void;
  submit: (event: FormEvent) => Promise<void>;
};

const ApiKeyFormContext = createContext<ApiKeyFormState | null>(null);

export function useApiKeyForm(): ApiKeyFormState {
  const form = useContext(ApiKeyFormContext);
  if (!form) throw new Error("useApiKeyForm must be used inside ApiKeyFormProvider");
  return form;
}

export function ApiKeyFormProvider({
  initialProvider = "openai",
  onSaved,
  children,
}: {
  initialProvider?: ApiProviderId;
  onSaved: (choice: ModelChoice) => void;
  children: ReactNode;
}) {
  const formId = useId();
  const [provider, setProvider] = useState<ApiProviderId>(initialProvider);
  const [model, setModel] = useState(PROVIDERS[initialProvider].chatModels[0]?.id ?? "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = apiKey.trim().length > 0 && model.length > 0;

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
    <ApiKeyFormContext.Provider
      value={{
        formId,
        provider,
        model,
        apiKey,
        busy,
        ready,
        error,
        chooseProvider,
        setModel,
        setApiKey,
        submit,
      }}
    >
      {children}
    </ApiKeyFormContext.Provider>
  );
}

export function ApiKeyFields() {
  const form = useApiKeyForm();
  const [reveal, setReveal] = useState(false);

  const spec = PROVIDERS[form.provider];
  const keyId = `${form.formId}-key`;

  return (
    <form
      id={form.formId}
      onSubmit={(event) => void form.submit(event)}
      className="flex flex-col gap-5"
    >
      <fieldset className="flex flex-col gap-2" disabled={form.busy}>
        <legend className="mb-2 text-sm font-medium">Provider</legend>
        <div role="radiogroup" aria-label="Provider" className="grid grid-cols-4 gap-2.5">
          {API_PROVIDER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={form.provider === id}
              onClick={() => form.chooseProvider(id)}
              className={cn(OPTION, "flex h-12 items-center justify-center px-3 font-medium")}
            >
              {PROVIDERS[id].label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={keyId} className="text-sm font-medium">
          {spec.label} API key
        </label>
        <InputGroup>
          <InputGroupInput
            id={keyId}
            type={reveal ? "text" : "password"}
            value={form.apiKey}
            onChange={(event) => form.setApiKey(event.target.value)}
            maxLength={LIMITS.apiKeyChars}
            autoComplete="off"
            spellCheck={false}
            disabled={form.busy}
            placeholder="Paste your key"
            aria-invalid={form.error ? true : undefined}
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

      <fieldset className="flex flex-col gap-2" disabled={form.busy}>
        <legend className="mb-2 text-sm font-medium">Model</legend>
        <div role="radiogroup" aria-label="Model" className="flex flex-wrap gap-2">
          {spec.chatModels.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={form.model === entry.id}
              onClick={() => form.setModel(entry.id)}
              className={cn(OPTION, "h-9 rounded-full px-4")}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </fieldset>

      {form.error ? (
        <p className="text-destructive text-sm select-text" role="alert">
          {form.error}
        </p>
      ) : null}
    </form>
  );
}
