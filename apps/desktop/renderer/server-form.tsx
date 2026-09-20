/**
 * Attach to an Onirix server.
 *
 * The shell probes the address the same way the connect window does. When it
 * answers, this whole window is replaced by the server's workspace, so there
 * is no success state to draw: success is the page going away.
 */
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@onirix/ui/components/button";
import { Input } from "@onirix/ui/components/input";
import { Spinner } from "@onirix/ui/components/spinner";

import { LIMITS } from "../src/local-bridge";

import { errorMessage, getBridge } from "./bridge";

export function ServerForm({
  formId,
  defaultAddress,
  onBusyChange,
  onReadyChange,
  showSubmit = false,
}: {
  formId: string;
  defaultAddress: string;
  onBusyChange?: (busy: boolean) => void;
  onReadyChange?: (ready: boolean) => void;
  showSubmit?: boolean;
}) {
  const [address, setAddress] = useState(defaultAddress);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = address.trim().length > 0;
  useEffect(() => onReadyChange?.(ready), [onReadyChange, ready]);
  useEffect(() => onBusyChange?.(busy), [onBusyChange, busy]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await getBridge().server.connect(address);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <form id={formId} onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
      <label htmlFor={`${formId}-address`} className="text-sm font-medium">
        Server address
      </label>
      <Input
        id={`${formId}-address`}
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        maxLength={LIMITS.addressChars}
        autoComplete="off"
        spellCheck={false}
        disabled={busy}
        placeholder="onirix.example.com"
        aria-invalid={error ? true : undefined}
      />
      <p className="text-ink-03 text-xs">
        Chats and documents here stay on this computer. The server has its own sign-in and history.
      </p>
      {error ? (
        <p className="text-destructive text-sm select-text" role="alert">
          {error}
        </p>
      ) : null}
      {showSubmit ? (
        <div className="pt-1">
          <Button type="submit" className="rounded-full px-4" disabled={!ready || busy}>
            {busy ? <Spinner /> : null}
            {busy ? "Connecting" : "Connect"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
