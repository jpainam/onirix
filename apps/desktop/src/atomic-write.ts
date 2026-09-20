/**
 * Writes a JSON file so that it is always either the old version or the new
 * one, never half of either.
 *
 * `writeFileSync` truncates the file before it writes. An app killed between
 * those two moments (a forced quit, a power cut, a SIGTERM as the window is
 * closing, which is exactly when the shell saves its bounds) leaves a
 * zero-byte file, and with it goes the attached server, the finished setup,
 * or a chat. Writing beside the file and renaming over it closes that gap: a
 * rename within one directory is atomic.
 */
import { renameSync, writeFileSync } from "node:fs";

export function writeJsonAtomic(file: string, value: unknown): void {
  const temporary = `${file}.${process.pid}.tmp`;
  // 0600: these files hold chats and an encrypted key. Nobody else on the
  // computer has a reason to read them.
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temporary, file);
}
