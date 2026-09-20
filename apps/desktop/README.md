# Onirix desktop

The Onirix desktop app, built with Electron. It works in two ways, in one
window.

**On its own.** With no server, the app opens straight into a usable product:
chats, a document library, and answers that cite the passage they came from,
all kept on this computer. Which model answers is the person's choice, made in
a first-run setup they are free to skip:

- **Local**: an open source model, downloaded and run here by Ollama.
- **API key**: their own key for OpenAI, Anthropic, Google or xAI.
- **Server**: an Onirix server, which replaces the local window (below).

**Attached to a server.** The window shows the web app that server serves, so
accounts, shared knowledge, connectors, teams and permissions stay on the
server. The shell adds what a browser tab cannot have: a native window, and a
local model runtime.

## Run it

```bash
pnpm dev:desktop    # the desktop app, in local mode
pnpm dev            # optional: an Onirix server, on http://localhost:3001
```

`pnpm dev:desktop` keeps building (`scripts/dev.mjs`). A change under
`renderer/`, or to a shared component it imports, reloads the local window. A
change under `src/` restarts Electron. `pnpm --filter desktop start` is the
old way: one build, no watching.

There is no "which server?" screen. A fresh install opens the local window
with the setup dialog over it. A saved server is probed at launch
(`/api/health`): if it answers, its workspace opens; if it does not, the local
window opens with a notice ("Could not reach ...", Try again, Change server)
and the address stays saved, so a server that was only down comes back on the
next launch. "Change Server…" in the app menu opens the server form inside the
local window, and "Use Without a Server" detaches for good.

Everything the shell remembers is in the app's data directory: `settings.json`
(server, window, appearance, whether setup was seen) and `local/` (chats, the
model choice, the document library).

## How it fits together

| File | Role |
| --- | --- |
| `src/main.ts` | Windows, the `onirix-app://` scheme, navigation rules, menu, IPC |
| `src/updates.ts` | Checks GitHub releases, downloads, installs on restart |
| `src/runtime.ts` | Finds, installs, starts Ollama; pulls and removes models |
| `src/preload.ts` | Publishes `window.onirixDesktop` to the attached server's origin only |
| `src/local-preload.ts` | Publishes `window.onirixLocal` to the local renderer only |
| `src/local-bridge.ts` | The local bridge contract, shared by preload, main and renderer |
| `src/local-store.ts` | Local chats: one JSON file each, plus an index |
| `src/local-model.ts` | The chosen model; API keys encrypted with `safeStorage` |
| `src/local-chat.ts` | Retrieves passages, builds the grounded prompt, streams the answer |
| `src/local-documents.ts` | The document library: copy, read, index, search |
| `src/local-retrieval.ts` | Chunking and BM25, in plain TypeScript |
| `src/extract-worker.ts` | Reads a file's text in a utility process |
| `renderer/` | The local UI (React), built into `dist/renderer` |
| `../dashboard/src/lib/desktop.ts` | The server bridge contract, shared by both sides |

### Local mode

The renderer is a React app served from `onirix-app://local/`, a scheme of the
shell's own that serves `dist/renderer` and nothing above it. The page has no
network access at all (`connect-src 'none'`): model calls, file reads and the
server probe all happen in the main process, behind `window.onirixLocal`. Every
IPC handler checks that the caller is the top frame of the right window, and
validates its arguments. It uses the product's own components, tokens and
icons (`@onirix/ui`), so both modes look like one app. The interface is set in
the system font; JetBrains Mono, for code, is the one font file shipped.

**Settings.** Opening Settings (the sidebar row, or Cmd/Ctrl+,) slides the
sidebar over to a settings menu, the way the dashboard's admin menu does:
"Back to app", a search field that filters the rows, and grouped pages
(General, Appearance, Language model, Local models, Documents, Server, About).
Each row is a page in the content area, and the back and forward arrows walk
them like any other view. The right panel (Documents and Source) starts open
and remembers whether it was last left open or closed.

**Documents.** A file dropped on the panel beside a conversation (or picked
with the paperclip) is copied into `local/documents/<id>/`, read, and cut into
passages of about 1000 characters. The extractors are the server's
(`@onirix/ingestion`): PDF, Word (.docx), Excel (.xlsx, .xls), CSV, Markdown,
HTML, JSON and plain text, up to 50 MB a file. Reading happens in a utility
process, so a large PDF does not freeze the window and a malformed one cannot
take the app down. A document added once can be attached to any session.

**Answers.** When a session has documents, each question is matched against
them with BM25, on this computer, with no embeddings: it works offline and
with every model choice, including providers that serve no embedding model.
The six best passages go into the prompt as numbered sources, the model cites
them as `[1]`, `[2]`, and each marker is a chip that opens the passage in the
Source tab. Only those passages reach the model, never whole files, and with a
local model nothing leaves the computer at all.

**Keys.** An API key is checked with one small request, then encrypted with
Electron's `safeStorage` and never sent back to the page. Where the OS has no
real secret storage, saving is refused rather than faked.

### Server mode

The web app detects the shell through `getDesktopBridge()`. In the shell, the
Ollama setup dialog gains a "This computer" mode that installs Ollama (checksum
verified, into the app's data directory), downloads models with progress, and
asks the server which address it can reach the runtime by.

### Signing in

Google will not run OAuth inside an embedded browser, and this window is one.
Announcing a plain Chromium user agent does not change that. So the app never
signs in with Google itself: it hands the job to the real browser and waits.

1. The window makes a one-time secret, keeps it, and sends its SHA-256 hash to
   the browser through `server:openInBrowser`, which only ever opens paths on
   the attached server.
2. The browser signs in as usual and lands on `/desktop/handoff`, where the
   user confirms. That records an approval against the hash.
3. The window, polling `/api/auth/desktop/exchange` with the secret, trades it
   for a session cookie and reloads.
4. The browser page opens `onirix://signed-in`, which brings the app back in
   front of the browser. The link carries nothing: the window already has its
   session by then, so this only saves the user from hunting for the window.

The hash travels in a URL anyone could read; the secret never leaves the
window, so a copied link cannot become a session elsewhere, and each approval
works once. Emailed links (magic link, email verification) open in the default
browser too, so they take the same route. Password sign-in needs none of this
and happens in the window.

The server half is `desktopSignIn` in `packages/auth/src/desktop.ts`; the
window half is `useDesktopHandoff` in the web app. The `onirix://` scheme is
declared under `protocols` in electron-builder.yml, which puts it in the macOS
bundle and the Windows installer; on Linux it depends on the AppImage being
integrated into the desktop environment, and the sign-in completes without it.

### Updating

The app updates itself from the GitHub releases this repository publishes. It
checks at launch and every six hours, downloads in the background, and asks to
restart once the update is staged; declining leaves it staged for the next
quit. "Check for Updates…" in the app menu (macOS) or the Help menu (Windows,
Linux) does the same on demand and always answers, "you are up to date"
included. Development builds have no installer to replace and say so.

Two things it depends on. macOS cannot update from a dmg, so every release also
ships a zip, which is what the updater downloads; and the copy has to be signed,
or macOS refuses to swap it. When any of that fails the dialog offers the
releases page, which always works.

### The constraint worth knowing

Attached to a server, the Onirix server makes the model calls, not the window. A model served on the
user's computer is therefore only usable when the server runs on that same
computer (Docker or `pnpm dev`). Attached to a remote server, the dialog says
so and points at "Remote server" instead.

### Serving models to other computers

By default Ollama answers on loopback and stops when the app quits. Two
switches in the same dialog turn one machine into the team's model host:

- **Share on the network** rebinds Ollama to every interface and prints the
  address to use (`http://192.168.x.x:11434/v1`). On any other install, that
  address goes into the "Remote server" tab, with Test to confirm it answers.
  Ollama has no sign-in: anyone who can reach the port can use it, so this is
  for a trusted network, not the internet.
- **Keep serving in the background** leaves Ollama up after the window closes
  and reopens the app at login (macOS and Windows), which starts it again.

The shell only rebinds an Ollama it started. One started by Ollama's own app
or a system service is left alone, and the dialog says how to share that one.

## Build installers

```bash
pnpm desktop:dist   # apps/desktop/release/
```

`ONIRIX_DEFAULT_SERVER` sets the address the server form suggests. Regenerate
the icon from the product mark with `pnpm --filter desktop icon`.

## Release

Tag `desktop-v1.2.3`. The `Desktop release` workflow builds macOS, Windows, and
Linux installers and attaches them to a GitHub release of this repository,
along with the `latest*.yml` files installed copies read to notice a release.
The `/download` page links to `releases/latest/download/<file>`
(`DESKTOP_DOWNLOAD_URL`), so the newest release must always be a desktop one:
if the server ever gets GitHub releases of its own, mark those as pre-release
or point `DESKTOP_DOWNLOAD_URL` somewhere else. Repository secrets:

- `MAC_CERTIFICATE_P12_BASE64`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`: Developer ID signing and
  notarization. Without them the macOS build is unsigned and Gatekeeper blocks
  it. [SIGNING.md](SIGNING.md) walks through getting each one.
- `WIN_CERTIFICATE_PFX_BASE64`, `WIN_CERTIFICATE_PASSWORD`: optional. Unsigned
  Windows installers run after a SmartScreen warning.

```
git tag desktop-v0.1.1
git push origin desktop-v0.1.1
```