/**
 * Keeping an installed copy current.
 *
 * The shell is small but it still ships: a new sign-in flow, a new runtime
 * installer. Asking people to return to the download page and drag the app
 * over itself is how a desktop client falls a year behind, so it checks GitHub
 * releases itself, downloads in the background, and installs on restart.
 *
 * Two ways in. The app checks on launch and every six hours, and says nothing
 * until there is something to say. The menu item checks on demand and always
 * answers, including "you are up to date", because a check that shows nothing
 * cannot be told apart from a broken one.
 */
import { BrowserWindow, app, dialog, shell } from "electron";
import { autoUpdater } from "electron-updater";

/** Where a copy that cannot update itself is sent instead. */
export const RELEASES_PAGE = "https://github.com/jpainam/onirix/releases";

/** Six hours: a session left open for days should still notice a release. */
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

type State = "idle" | "checking" | "downloading" | "staged";

let state: State = "idle";

/** Version of the staged install, and what a second menu click re-offers. */
let ready: string | null = null;

/** True while the user is waiting on an answer; automatic checks stay quiet. */
let manual = false;

function front(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

/** Dialogs attach to a window when there is one; on macOS there may not be. */
function show(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  const window = front();
  return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
}

async function offerRestart(version: string): Promise<void> {
  const { response } = await show({
    type: "info",
    buttons: ["Restart Now", "Later"],
    defaultId: 0,
    cancelId: 1,
    message: `Onirix ${version} is ready to install.`,
    detail: "Onirix will restart to finish the update.",
  });
  // Later leaves the install staged: it is applied the next time the app is
  // quit and reopened, and the menu still offers the restart until then.
  if (response !== 0) return;
  // `quitAndInstall` quits through `app.quit()`, so `before-quit` still runs
  // and a runtime the shell started is stopped the same way as on any quit.
  autoUpdater.quitAndInstall();
}

function register(): void {
  // The user decides when to restart; downloading is the part worth doing
  // without asking, so the update is already in hand when they say yes.
  autoUpdater.autoDownload = true;

  autoUpdater.on("update-available", (info) => {
    state = "downloading";
    if (!manual) return;
    void show({
      type: "info",
      buttons: ["OK"],
      message: `Onirix ${info.version} is downloading.`,
      detail: "Keep working. Onirix will offer to restart once the update is ready.",
    });
  });

  autoUpdater.on("update-not-available", () => {
    state = "idle";
    if (!manual) return;
    void show({
      type: "info",
      buttons: ["OK"],
      message: `Onirix ${app.getVersion()} is the latest version.`,
    });
  });

  autoUpdater.on("download-progress", ({ percent }) => {
    front()?.setProgressBar(percent / 100);
  });

  autoUpdater.on("update-downloaded", (info) => {
    front()?.setProgressBar(-1);
    state = "staged";
    ready = info.version;
    void offerRestart(info.version);
  });

  autoUpdater.on("error", (error) => {
    front()?.setProgressBar(-1);
    state = "idle";
    if (!manual) return;
    void show({
      type: "error",
      buttons: ["Open Downloads", "OK"],
      defaultId: 1,
      cancelId: 1,
      message: "Could not check for updates.",
      // A copy that is unsigned, or installed somewhere the app cannot write,
      // cannot replace itself. The download page is the way out of all of it.
      detail: `${error.message}\n\nThe latest version can always be installed by hand.`,
    }).then(({ response }) => {
      if (response === 0) void shell.openExternal(RELEASES_PAGE);
    });
  });
}

/**
 * @param userAsked A menu click, which is owed an answer either way. An
 * automatic check reports only an update it actually found.
 */
export async function checkForUpdates(userAsked = false): Promise<void> {
  // An unpackaged build has no installer to replace and no version to compare
  // against; electron-updater would only throw about the missing feed file.
  if (!app.isPackaged) {
    if (userAsked) {
      await show({
        type: "info",
        buttons: ["OK"],
        message: "This is a development build.",
        detail: "Updates apply to installed copies of Onirix.",
      });
    }
    return;
  }

  if (state === "staged" && ready) {
    if (userAsked) await offerRestart(ready);
    return;
  }

  if (state !== "idle") {
    if (userAsked) {
      await show({
        type: "info",
        buttons: ["OK"],
        message:
          state === "downloading" ? "An update is downloading." : "Already checking for updates.",
        detail: "Onirix will offer to restart once it is ready.",
      });
    }
    return;
  }

  manual = userAsked;
  state = "checking";
  try {
    const result = await autoUpdater.checkForUpdates();
    // No result means the updater declined to run at all (no feed configured).
    // `update-available` has already moved the state on when there is one.
    if (!result && state === "checking") state = "idle";
  } catch {
    // The `error` event reported this already; the rejection is the same news.
  } finally {
    manual = false;
  }
}

/** Wires the events and starts the schedule; called once the app is ready. */
export function watchForUpdates(): void {
  register();
  void checkForUpdates();
  setInterval(() => void checkForUpdates(), CHECK_INTERVAL).unref();
}
