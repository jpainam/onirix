/**
 * `pnpm dev:desktop`: the app, rebuilt as its sources change.
 *
 * Two kinds of change, two answers. The renderer (`renderer/`, and the shared
 * components it imports) is a page, so a new build only needs the window to
 * load it again: the shell watches `dist/renderer` while it is not packaged
 * and reloads (see `watchRenderer` in main.ts). The shell itself (`src/`) is
 * the process, so a new build of it means quitting Electron and starting it
 * again, which this script does.
 *
 * `renderer/index.html` and the fonts are copied once at the start. A change
 * to those is the one thing that still takes a restart of this script.
 */
import { context } from "esbuild";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

import { SHELL_BUILDS, prepareRenderer, rendererOptions, tailwindCommand } from "./bundle.mjs";

const require = createRequire(import.meta.url);
/** Required from Node rather than from Electron, the package is the path to its binary. */
const electronBinary = require("electron");

let electron = null;
let restarting = false;
let stopping = false;

function startElectron() {
  electron = spawn(electronBinary, ["."], { stdio: "inherit" });
  electron.on("exit", () => {
    electron = null;
    if (restarting) {
      // Only now, not at the kill: the old process holds the single instance
      // lock until it is gone, and a new one started early would bow out to it.
      restarting = false;
      startElectron();
    } else if (!stopping) {
      // Quit from the app's own menu: that ends the session, as it would
      // have ended `electron .`.
      void stop(0);
    }
  });
}

function restartElectron() {
  if (!electron) return startElectron();
  if (restarting) return;
  restarting = true;
  electron.kill();
}

/**
 * Watches one build. `built` resolves with its first build, which is what the
 * app is started from; `onRebuild` is called for each one after that.
 */
function watched(options, onRebuild) {
  let first = true;
  let markBuilt;
  const built = new Promise((resolve) => {
    markBuilt = resolve;
  });
  const plugin = {
    name: "dev-rebuild",
    setup(build) {
      build.onEnd((result) => {
        if (first) {
          first = false;
          markBuilt();
          return;
        }
        // A build with errors leaves the running app alone. esbuild has
        // already printed them, and the next save gets another try.
        if (result.errors.length === 0) onRebuild?.();
      });
    },
  };
  return { built, context: context({ ...options, plugins: [plugin] }) };
}

// A save usually rebuilds main and a preload together. One restart for both.
let pending = null;
function scheduleRestart() {
  clearTimeout(pending);
  pending = setTimeout(() => {
    console.log("[dev] shell rebuilt, restarting Electron");
    restartElectron();
  }, 150);
}

await prepareRenderer();

// The renderer needs no callback: the shell sees `dist/renderer` change.
const builds = [
  watched(rendererOptions({ dev: true })),
  ...SHELL_BUILDS.map((options) => watched(options, scheduleRestart)),
];
const contexts = await Promise.all(builds.map((entry) => entry.context));

// Tailwind watches on its own: the classes it collects come from the same
// sources esbuild reads, but it is a separate program with a separate output.
// Its stdin is a pipe held open on purpose: the CLI leaves watch mode when
// stdin ends.
const tailwind = spawn(process.execPath, tailwindCommand({ watch: true }), {
  stdio: ["pipe", "inherit", "inherit"],
});

async function stop(code) {
  if (stopping) return;
  stopping = true;
  clearTimeout(pending);
  tailwind.kill();
  electron?.kill();
  await Promise.all(contexts.map((entry) => entry.dispose()));
  process.exit(code);
}
process.on("SIGINT", () => void stop(0));
process.on("SIGTERM", () => void stop(0));

/** Tailwind says nothing a script can wait on, so its output is what is waited for. */
async function stylesheetWritten() {
  while (!existsSync("dist/renderer/styles.css")) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// `watch` starts with a build of its own. Electron waits for every one of
// them, and for the stylesheet, so it never opens onto half a `dist`.
await Promise.all(contexts.map((entry) => entry.watch()));
await Promise.all([...builds.map((entry) => entry.built), stylesheetWritten()]);
startElectron();
console.log("[dev] watching renderer/ and src/");
