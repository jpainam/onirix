/**
 * Attach to an Onirix server.
 *
 * The shell probes the address the same way the connect window does. When it
 * answers, this whole window is replaced by the server's workspace, so there
 * is no success state to draw: success is the page going away.
 *
 * The form's state lives in `ServerFormProvider`, so a submit button can sit
 * inside the form (`ServerForm`) or anywhere else under the provider (the
 * setup dialog's footer) and read the same `busy` and `ready`.
 */
import { createContext, type FormEvent, type ReactNode, useContext, useId, useState } from "react";

import { Button } from "@onirix/ui/components/button";
import { Input } from "@onirix/ui/components/input";
import { Spinner } from "@onirix/ui/components/spinner";

import { LIMITS } from "../src/local-bridge";

import { errorMessage, getBridge } from "./bridge";

type ServerFormState = {
  /** What a submit button outside the form points its `form` attribute at. */
  formId: string;
  address: string;
  busy: boolean;
  ready: boolean;
  error: string | null;
  setAddress: (address: string) => void;
  submit: (event: FormEvent) => Promise<void>;
};

const ServerFormContext = createContext<ServerFormState | null>(null);

export function useServerForm(): ServerFormState {
  const form = useContext(ServerFormContext);
  if (!form) throw new Error("useServerForm must be used inside ServerFormProvider");
  return form;
}

export function ServerFormProvider({
  defaultAddress,
  children,
}: {
  defaultAddress: string;
  children: ReactNode;
}) {
  const formId = useId();
  const [address, setAddress] = useState(defaultAddress);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = address.trim().length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Success leaves `busy` on: the window is about to be replaced.
      await getBridge().server.connect(address);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <ServerFormContext.Provider value={{ formId, address, busy, ready, error, setAddress, submit }}>
      {children}
    </ServerFormContext.Provider>
  );
}

export function ServerFields({ children }: { children?: ReactNode }) {
  const form = useServerForm();
  const addressId = `${form.formId}-address`;

  return (
    <form
      id={form.formId}
      onSubmit={(event) => void form.submit(event)}
      className="flex flex-col gap-2"
    >
      <label htmlFor={addressId} className="text-sm font-medium">
        Server address
      </label>
      <Input
        id={addressId}
        value={form.address}
        onChange={(event) => form.setAddress(event.target.value)}
        maxLength={LIMITS.addressChars}
        autoComplete="off"
        spellCheck={false}
        disabled={form.busy}
        placeholder="onirix.example.com"
        aria-invalid={form.error ? true : undefined}
      />
      {form.error ? (
        <p className="text-destructive text-sm select-text" role="alert">
          {form.error}
        </p>
      ) : null}
      {children}
    </form>
  );
}

export function ServerSubmit() {
  const form = useServerForm();

  return (
    <div className="pt-1">
      <Button
        type="submit"
        form={form.formId}
        className="rounded-full px-4"
        disabled={!form.ready || form.busy}
      >
        {form.busy ? <Spinner /> : null}
        {form.busy ? "Connecting" : "Connect"}
      </Button>
    </div>
  );
}

/** The whole form with its own button, for anywhere that is not the setup dialog. */
export function ServerForm({ defaultAddress }: { defaultAddress: string }) {
  return (
    <ServerFormProvider defaultAddress={defaultAddress}>
      <ServerFields>
        <ServerSubmit />
      </ServerFields>
    </ServerFormProvider>
  );
}
