/**
 * Reading a folder the person picked or dropped, in the browser.
 *
 * A folder arrives one of two ways: a directory input, whose files each carry
 * a `webkitRelativePath`, or a drop, whose items have to be walked entry by
 * entry. Both end up as the same flat list of files with a path relative to
 * the folder, which is all the review dialog needs to draw its tree.
 */

/** The extensions Onirix extracts text from, as the file inputs list them. */
export const DOCUMENT_EXTENSIONS = [
  "pdf",
  "docx",
  "xlsx",
  "xls",
  "csv",
  "md",
  "markdown",
  "html",
  "htm",
  "json",
  "txt",
  "text",
  "log",
  "rst",
] as const;

/** The same list, as an `accept` attribute. */
export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.map((extension) => `.${extension}`).join(",");

/** How many files a walk of a dropped folder reads before it stops looking. */
const WALK_LIMIT = 5000;

export type FolderFile = {
  file: File;
  /** Relative to the folder, without its name: `notes.md`, `2024/q1/report.pdf`. */
  path: string;
};

export type PickedFolder = {
  name: string;
  /** The files Onirix can read, sorted by path. */
  files: FolderFile[];
  /** How many were left out: hidden files and types nothing here extracts. */
  skipped: number;
};

export function isReadableDocument(fileName: string): boolean {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return (
    extension !== undefined && (DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)
  );
}

/** `.DS_Store`, `.git/config`, and Office's `~$lock` files: never documents. */
function isHidden(path: string): boolean {
  return path.split("/").some((part) => part.startsWith(".") || part.startsWith("~$"));
}

function toFolder(name: string, all: FolderFile[]): PickedFolder {
  const files = all
    .filter((entry) => !isHidden(entry.path) && isReadableDocument(entry.file.name))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  return { name, files, skipped: all.length - files.length };
}

/** The folder behind a `webkitdirectory` input's files. Null when it was empty. */
export function folderFromInput(list: FileList | File[]): PickedFolder | null {
  const files = [...list];
  const first = files[0];
  if (!first) return null;

  const name = first.webkitRelativePath.split("/")[0] || "Folder";
  return toFolder(
    name,
    files.map((file) => ({
      file,
      // The relative path starts with the folder's own name; the tree does not.
      path: file.webkitRelativePath.split("/").slice(1).join("/") || file.name,
    })),
  );
}

function readFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** A reader hands back its entries a batch at a time, until a batch is empty. */
async function readEntries(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const entries: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

async function walk(
  directory: FileSystemDirectoryEntry,
  prefix: string,
  into: FolderFile[],
): Promise<void> {
  for (const entry of await readEntries(directory)) {
    if (into.length >= WALK_LIMIT) return;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Nothing under a hidden directory is wanted, and `.git` alone can hold
    // thousands of files, so it is not walked at all.
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory) {
      await walk(entry as FileSystemDirectoryEntry, path, into);
    } else {
      try {
        into.push({ file: await readFile(entry as FileSystemFileEntry), path });
      } catch {
        // A file that cannot be opened is one fewer to offer, not a failed drop.
      }
    }
  }
}

/**
 * What a drop held: loose files, folders, or both.
 *
 * The entries have to be taken from the event synchronously, before the first
 * await, because the browser empties the transfer once the handler returns.
 */
export async function readDrop(
  transfer: DataTransfer,
): Promise<{ files: File[]; folders: PickedFolder[] }> {
  const files: File[] = [];
  const directories: FileSystemDirectoryEntry[] = [];
  // A dropped folder also shows up in `transfer.files`, as an entry that
  // cannot be read, so the items are sorted into the two kinds here instead.
  for (const item of transfer.items) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.() ?? null;
    if (entry?.isDirectory) {
      directories.push(entry as FileSystemDirectoryEntry);
      continue;
    }
    const file = item.getAsFile();
    if (file) files.push(file);
  }

  const folders: PickedFolder[] = [];
  for (const directory of directories) {
    const found: FolderFile[] = [];
    await walk(directory, "", found);
    folders.push(toFolder(directory.name, found));
  }
  return { files, folders };
}
