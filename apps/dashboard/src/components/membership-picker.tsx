"use client";

import { PlusIcon, XIcon } from "@onirix/ui/lib/icons";

import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@onirix/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@onirix/ui/components/popover";

export type PickerOption = { id: string; label: string; hint?: string };

/**
 * A membership set edited in place: what is joined reads as chips, and one
 * quiet "+" opens the searchable list of everything else.
 *
 * The control it replaces was a form select parked at the end of the chips: it
 * claimed the width and weight of a field on a surface that is really a
 * summary, and it could only add, so adding and removing lived in two different
 * places. Here both are the same list. An entry already joined shows a check,
 * and selecting it takes the person back out. The popover stays open because
 * these edits come in runs, not one at a time.
 */
export function MembershipPicker({
  selected,
  options,
  editable,
  addLabel,
  emptyLabel,
  searchPlaceholder,
  notFoundLabel,
  removeLabel,
  onAdd,
  onRemove,
}: {
  selected: PickerOption[];
  options: PickerOption[];
  editable: boolean;
  /** Names the "+" trigger, and labels it when nothing is joined yet. */
  addLabel: string;
  /** Stands in for the chips when nothing is joined and nothing can be. */
  emptyLabel: string;
  searchPlaceholder: string;
  notFoundLabel: string;
  removeLabel: (option: PickerOption) => string;
  onAdd: (option: PickerOption) => void;
  onRemove: (option: PickerOption) => void;
}) {
  const joined = new Set(selected.map((option) => option.id));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((option) => (
        <Badge key={option.id} variant="outline" title={option.hint}>
          {option.label}
          {editable ? (
            // A plain button, not the <Button> primitive: the smallest one the
            // system offers stands taller than the chip it would sit in.
            <button
              type="button"
              data-icon="inline-end"
              aria-label={removeLabel(option)}
              className="text-ink-03 hover:bg-muted hover:text-foreground flex size-4 items-center justify-center rounded-full transition-colors"
              onClick={() => onRemove(option)}
            >
              <XIcon className="size-3" />
            </button>
          ) : null}
        </Badge>
      ))}

      {selected.length === 0 && (!editable || options.length === 0) ? (
        <span className="text-ink-03 text-xs">{emptyLabel}</span>
      ) : null}

      {editable && options.length > 0 ? (
        <Popover>
          <PopoverTrigger
            render={
              selected.length === 0 ? (
                <Button variant="muted" size="xs">
                  <PlusIcon />
                  {addLabel}
                </Button>
              ) : (
                <Button variant="muted" size="icon-xs" aria-label={addLabel}>
                  <PlusIcon />
                </Button>
              )
            }
          />
          <PopoverContent variant="plain" align="start">
            <Command>
              <CommandInput placeholder={searchPlaceholder} />
              <CommandList>
                <CommandEmpty>{notFoundLabel}</CommandEmpty>
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    // cmdk keys an entry by its value, so the id rides along:
                    // two people can share a name, and deduplicated entries
                    // would highlight and select as one.
                    value={`${option.label} ${option.id}`}
                    keywords={option.hint ? [option.hint] : undefined}
                    data-checked={joined.has(option.id)}
                    onSelect={() =>
                      joined.has(option.id) ? onRemove(option) : onAdd(option)
                    }
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{option.label}</span>
                      {option.hint ? (
                        <span className="text-ink-03 truncate text-xs">
                          {option.hint}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
