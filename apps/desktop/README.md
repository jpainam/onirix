# Onirix desktop

A thin desktop client for Onirix, built with Electron. The window shows the web
app served by an Onirix server, so there is one UI, and accounts, documents,
and permissions stay on the server. The shell adds two things a browser tab
cannot have: a native window, and a local model runtime.

## Run it

```bash
pnpm dev            # the Onirix server, on http://localhost:3001
pnpm dev:desktop    # the desktop shell
```

The first launch asks for a server address and checks it against
`/api/health`. The choice is kept in `settings.json` in the app's data
directory. "Change Server…" in the app menu goes back to that screen.

## How it fits together

| File | Role |
| --- | --- |
| `src/main.ts` | Windows, navigation rules, menu, IPC |
| `src/runtime.ts` | Finds, installs, starts Ollama; pulls and removes models |
| `src/preload.ts` | Publishes `window.onirixDesktop` to the attached server's origin only |
| `src/connect.html` | The local "which server?" screen |
| `../web/src/lib/desktop.ts` | The bridge contract, shared by both sides |

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

The hash travels in a URL anyone could read; the secret never leaves the
window, so a copied link cannot become a session elsewhere, and each approval
works once. Emailed links (magic link, email verification) open in the default
browser too, so they take the same route. Password sign-in needs none of this
and happens in the window.

The server half is `desktopSignIn` in `packages/auth/src/desktop.ts`; the
window half is `useDesktopHandoff` in the web app.

### The constraint worth knowing

The Onirix server makes the model calls, not the window. A model served on the
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

`ONIRIX_DEFAULT_SERVER` sets the address a fresh install suggests. Regenerate
the icon from the product mark with `pnpm --filter desktop icon`.

## Release

Tag `desktop-v1.2.3`. The `Desktop release` workflow builds macOS, Windows, and
Linux installers and attaches them to a GitHub release of this repository. The
`/download` page links to `releases/latest/download/<file>`
(`DESKTOP_DOWNLOAD_URL`), so the newest release must always be a desktop one:
if the server ever gets GitHub releases of its own, mark those as pre-release
or point `DESKTOP_DOWNLOAD_URL` somewhere else. Repository secrets:

- `MAC_CERTIFICATE_P12_BASE64`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`: Developer ID signing and
  notarization. Without them the macOS build is unsigned and Gatekeeper blocks
  it. [SIGNING.md](SIGNING.md) walks through getting each one.
- `WIN_CERTIFICATE_PFX_BASE64`, `WIN_CERTIFICATE_PASSWORD`: optional. Unsigned
  Windows installers run after a SmartScreen warning.
