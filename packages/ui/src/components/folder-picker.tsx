"use client"

/**
 * Adding a folder: the directory input, and the dialog that shows what was in
 * it before anything is uploaded.
 *
 * A folder is never sent as it comes. What Onirix can read is listed one level
 * deep: the folder's own files, then each of its subfolders as a row that
 * opens onto everything beneath it. Every file starts out picked, and either a
 * file or a whole subfolder can be taken out before the rest goes in.
 */
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
} from "@onirix/ui/lib/icons";
import { type ReactNode, useMemo, useRef, useState } from "react";

import { Button } from "@onirix/ui/components/button";
import { Checkbox } from "@onirix/ui/components/checkbox";
import { Modal, ModalDescription, ModalTitle } from "@onirix/ui/components/modal";
import {
  type FolderFile,
  type PickedFolder,
  folderFromInput,
} from "@onirix/ui/lib/folder-files";

type Group = { name: string; files: FolderFile[] };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Several folders dropped at once read as one, each of them a subfolder. */
function merge(folders: PickedFolder[]): PickedFolder | null {
  const first = folders[0];
  if (!first) return null;
  if (folders.length === 1) return first;
  return {
    name: plural(folders.length, "folder"),
    files: folders.flatMap((folder) =>
      folder.files.map((entry) => ({ ...entry, path: `${folder.name}/${entry.path}` })),
    ),
    skipped: folders.reduce((total, folder) => total + folder.skipped, 0),
  };
}

function FileRow({
  entry,
  label,
  checked,
  onToggle,
}: {
  entry: FolderFile;
  /** The name at the top level; the path below the subfolder inside one. */
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="hover:bg-tint-01 flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <FileTextIcon className="text-ink-02 size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate" title={entry.path}>
        {label}
      </span>
      <span className="text-ink-02 shrink-0 text-xs tabular-nums">
        {formatSize(entry.file.size)}
      </span>
    </label>
  );
}

function FolderReview({
  folder,
  maxFiles,
  onCancel,
  onConfirm,
}: {
  folder: PickedFolder;
  maxFiles?: number;
  onCancel: () => void;
  onConfirm: (files: File[]) => void;
}) {
  const [selected, setSelected] = useState(
    () => new Set(folder.files.slice(0, maxFiles).map((entry) => entry.path)),
  );
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const { rootFiles, groups } = useMemo(() => {
    const rootFiles: FolderFile[] = [];
    const byName = new Map<string, FolderFile[]>();
    for (const entry of folder.files) {
      const slash = entry.path.indexOf("/");
      if (slash === -1) {
        rootFiles.push(entry);
        continue;
      }
      const name = entry.path.slice(0, slash);
      byName.set(name, [...(byName.get(name) ?? []), entry]);
    }
    const groups: Group[] = [...byName].map(([name, files]) => ({ name, files }));
    return { rootFiles, groups };
  }, [folder]);

  function toggle(paths: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const path of paths) {
        if (on) next.add(path);
        else next.delete(path);
      }
      return next;
    });
  }

  const total = folder.files.length;
  const over = maxFiles !== undefined && selected.size > maxFiles;

  return (
    <>
      <div className="flex flex-col gap-1.5 p-5 pb-3">
        <ModalTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
          <FolderOpenIcon className="text-ink-03 size-4 shrink-0" />
          <span className="truncate">{folder.name}</span>
        </ModalTitle>
        <ModalDescription className="text-ink-03">
          {total === 0
            ? "Nothing in this folder that Onirix can read."
            : `${plural(total, "file")} Onirix can read.`}
          {folder.skipped > 0 ? ` ${folder.skipped} other${folder.skipped === 1 ? "" : "s"} left out.` : ""}
        </ModalDescription>
      </div>

      {total > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-y px-2.5 py-2">
          {groups.map((group) => {
            const paths = group.files.map((entry) => entry.path);
            const picked = paths.filter((path) => selected.has(path)).length;
            const expanded = open.has(group.name);
            return (
              <div key={group.name} className="flex flex-col">
                <div className="hover:bg-tint-01 flex h-9 items-center gap-2.5 rounded-lg px-2.5">
                  <Checkbox
                    aria-label={`Everything in ${group.name}`}
                    checked={picked === paths.length}
                    indeterminate={picked > 0 && picked < paths.length}
                    onCheckedChange={() => toggle(paths, picked < paths.length)}
                  />
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() =>
                      setOpen((current) => {
                        const next = new Set(current);
                        if (!next.delete(group.name)) next.add(group.name);
                        return next;
                      })
                    }
                    className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left outline-none"
                  >
                    <FolderIcon className="text-ink-02 size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
                    <span className="text-ink-02 shrink-0 text-xs tabular-nums">
                      {picked === paths.length ? paths.length : `${picked} of ${paths.length}`}
                    </span>
                    {expanded ? (
                      <ChevronDownIcon className="text-ink-02 size-4 shrink-0" />
                    ) : (
                      <ChevronRightIcon className="text-ink-02 size-4 shrink-0" />
                    )}
                  </button>
                </div>
                {expanded ? (
                  <div className="ml-4.5 flex flex-col border-l pl-2">
                    {group.files.map((entry) => (
                      <FileRow
                        key={entry.path}
                        entry={entry}
                        label={entry.path.slice(group.name.length + 1)}
                        checked={selected.has(entry.path)}
                        onToggle={() => toggle([entry.path], !selected.has(entry.path))}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
          {rootFiles.map((entry) => (
            <FileRow
              key={entry.path}
              entry={entry}
              label={entry.path}
              checked={selected.has(entry.path)}
              onToggle={() => toggle([entry.path], !selected.has(entry.path))}
            />
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2 p-4">
        {total > 0 ? (
          <Button
            variant="muted"
            size="sm"
            onClick={() =>
              toggle(
                folder.files.map((entry) => entry.path),
                selected.size < total,
              )
            }
          >
            {selected.size < total ? "Select all" : "Select none"}
          </Button>
        ) : null}
        <span
          className={over ? "text-destructive text-xs" : "text-ink-02 text-xs"}
          role={over ? "alert" : undefined}
        >
          {over ? `Up to ${maxFiles} at a time.` : null}
        </span>
        <Button variant="ghost" className="ml-auto rounded-full px-4" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="rounded-full px-4"
          disabled={selected.size === 0 || over}
          onClick={() =>
            onConfirm(
              folder.files.filter((entry) => selected.has(entry.path)).map((entry) => entry.file),
            )
          }
        >
          {selected.size === 0 ? "Add files" : `Add ${plural(selected.size, "file")}`}
        </Button>
      </div>
    </>
  );
}

/**
 * The folder picker, for any screen that already takes files.
 *
 * `pick` opens the system's folder dialog and `review` takes folders that were
 * dropped instead; both lead to the same dialog, and `onConfirm` receives only
 * the files that were left picked. Render `element` once, anywhere.
 */
export function useFolderPicker({
  onConfirm,
  maxFiles,
}: {
  onConfirm: (files: File[]) => void;
  /** The most files one confirmation may hold, where the receiving end has a limit. */
  maxFiles?: number;
}): {
  pick: () => void;
  review: (folders: PickedFolder[]) => void;
  element: ReactNode;
} {
  const input = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState<PickedFolder | null>(null);
  // Kept while the dialog animates out, so it does not empty as it closes.
  const [open, setOpen] = useState(false);
  // A new folder is a new dialog: nothing of the last one's selection carries.
  const [round, setRound] = useState(0);

  function review(folders: PickedFolder[]) {
    const next = merge(folders);
    if (!next) return;
    setFolder(next);
    setRound((current) => current + 1);
    setOpen(true);
  }

  return {
    pick: () => input.current?.click(),
    review,
    element: (
      <>
        <input
          ref={input}
          type="file"
          hidden
          // Not in React's types, and the only way to ask for a folder.
          {...{ webkitdirectory: "" }}
          onChange={(event) => {
            const picked = event.target.files ? folderFromInput(event.target.files) : null;
            event.target.value = "";
            if (picked) review([picked]);
          }}
        />
        <Modal open={open} onOpenChange={setOpen} className="w-[480px]">
          {folder ? (
            <FolderReview
              key={round}
              folder={folder}
              maxFiles={maxFiles}
              onCancel={() => setOpen(false)}
              onConfirm={(files) => {
                setOpen(false);
                onConfirm(files);
              }}
            />
          ) : null}
        </Modal>
      </>
    ),
  };
}
