/**
 * The list of websites answers may read, opened from General.
 *
 * Every add and remove is saved as it happens, so there is nothing to confirm
 * and "Done" only closes. An address is reduced to its host as it is added
 * (`parseSite`), which is also what the shell stores.
 */
import { type FormEvent, useRef, useState } from "react";

import { Button } from "@onirix/ui/components/button";
import { Input } from "@onirix/ui/components/input";
import { Modal, ModalDescription, ModalTitle } from "@onirix/ui/components/modal";
import { XIcon } from "@onirix/ui/lib/icons";
import { cn } from "@onirix/ui/lib/utils";

import { LIMITS } from "../src/local-bridge";
import { parseSite } from "../src/web-access";

import { TILE } from "./tokens";

export function WebAccessDialog({
  open,
  onOpenChange,
  sites,
  onSitesChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: string[];
  onSitesChange: (sites: string[]) => void;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const full = sites.length >= LIMITS.webSites;

  function add(event: FormEvent) {
    event.preventDefault();
    const site = parseSite(typed);
    if (!site) {
      setError("That is not a website address.");
      return;
    }
    if (!sites.includes(site)) onSitesChange([...sites, site]);
    setTyped("");
    setError(null);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} className="w-[440px] gap-4 p-5" initialFocus={field}>
      <div className="flex flex-col gap-1.5">
        <ModalTitle className="text-base font-semibold">Allowed websites</ModalTitle>
        <ModalDescription className="text-ink-03">
          Empty means any website. Subdomains are included.
        </ModalDescription>
      </div>

      <form onSubmit={add} className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <Input
            ref={field}
            value={typed}
            placeholder="example.com"
            aria-label="Website"
            aria-invalid={error !== null}
            maxLength={LIMITS.addressChars}
            disabled={full}
            onChange={(event) => {
              setTyped(event.target.value);
              setError(null);
            }}
          />
          <Button type="submit" variant="outline" disabled={full || !typed.trim()}>
            Add
          </Button>
        </div>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </form>

      {sites.length > 0 ? (
        <ul className={cn("min-h-0 divide-y overflow-y-auto", TILE)}>
          {sites.map((site) => (
            <li key={site} className="flex items-center gap-2 py-1.5 pr-1.5 pl-4">
              <span className="min-w-0 flex-1 truncate text-sm select-text">{site}</span>
              <Button
                variant="destructive"
                size="icon-sm"
                onClick={() => onSitesChange(sites.filter((other) => other !== site))}
              >
                <XIcon />
                <span className="sr-only">Remove {site}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex justify-end">
        <Button className="rounded-full px-4" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
