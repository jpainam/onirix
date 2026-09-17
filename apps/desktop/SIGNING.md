# Signing the macOS app

macOS opens a downloaded app without complaint only when two things are true:
it is **signed** with a Developer ID certificate, and Apple has **notarized**
it (scanned it and issued a ticket). An unsigned build works on the machine
that built it and nowhere else: everyone who downloads it sees "Onirix is
damaged and can't be opened" or "cannot be opened because the developer cannot
be verified".

electron-builder does both steps by itself when it finds the credentials in
the environment. This page is how to get those credentials and where to put
them. Budget an hour, most of it waiting for Apple.

## 1. Join the Apple Developer Program

<https://developer.apple.com/programs/enroll/>. USD 99 per year.

- Enrolling as an **individual** is approved within a day or two, and the
  certificate reads "Developer ID Application: Your Name".
- Enrolling as an **organization** makes it read "Logesta Labs". It needs a
  D-U-N-S number for the company (free, requested through the same flow) and
  can take a week or two.

You can start as an individual and move to an organization later; users see a
different name in the first-launch dialog and nothing else changes.

## 2. Create the Developer ID Application certificate

Only the **Account Holder** of the team can create this kind of certificate.

The short way, with Xcode installed:

1. Xcode, Settings, Accounts. Add your Apple ID if it is not there.
2. Select the team, **Manage Certificates…**
3. **+**, then **Developer ID Application**.

Xcode generates the private key, requests the certificate, and installs both
in your login keychain.

Without Xcode:

1. Keychain Access, menu **Keychain Access → Certificate Assistant → Request a
   Certificate From a Certificate Authority…**. Enter your email, choose
   **Saved to disk**. This writes a `.certSigningRequest` file and puts the
   private key in your keychain.
2. <https://developer.apple.com/account/resources/certificates/add>, choose
   **Developer ID Application** (profile type G2 Sub-CA), upload the request.
3. Download the `.cer` and double-click it. It joins the private key from step 1.

Check it is there:

```bash
security find-identity -v -p codesigning
# 1) ABCDEF0123... "Developer ID Application: Your Name (TEAMID1234)"
```

The ten characters in parentheses are your **Team ID**. It is also on
<https://developer.apple.com/account> under Membership details.

It must be "Developer ID Application". "Apple Development" and "Apple
Distribution" certificates are for Xcode and the App Store and will not pass
Gatekeeper.

## 3. Export it for CI

1. Keychain Access, **login** keychain, **My Certificates** tab.
2. Expand "Developer ID Application: …" so the private key shows beneath it.
   Select **both rows**, right-click, **Export 2 items…**
3. Save as `developer-id.p12` and give it a strong password.

If there is no private key under the certificate, the certificate was created
on a different Mac. Export from that Mac, or revoke it and create a new one.

Treat the `.p12` like a password: anyone holding it and its password can sign
software as you. Do not commit it.

## 4. Create notarization credentials

Notarization signs in to Apple as you. Two ways; pick one.

**App-specific password** (simplest):

1. <https://account.apple.com>, **Sign-In and Security → App-Specific
   Passwords**, create one named "Onirix notarization".
2. You now have three values: your Apple ID email, that password
   (`abcd-efgh-ijkl-mnop`), and the Team ID from step 2.

**App Store Connect API key** (better for a team, since it is not tied to one
person's Apple ID): <https://appstoreconnect.apple.com/access/integrations/api>,
create a key with the Developer role, download the `.p8` once. electron-builder
reads `APPLE_API_KEY` (path to the `.p8`), `APPLE_API_KEY_ID`, and
`APPLE_API_ISSUER` in place of the three values above. The workflow in this
repository is wired for the app-specific password; switching means replacing
those three variables and writing the `.p8` to a file in a step before the build.

## 5. Add the secrets to GitHub

From the repository root, with the GitHub CLI. Run them one at a time; each of
the last four prompts for its value, so nothing lands in your shell history:

```bash
base64 -i developer-id.p12 | gh secret set MAC_CERTIFICATE_P12_BASE64
gh secret set MAC_CERTIFICATE_PASSWORD
gh secret set APPLE_ID
gh secret set APPLE_APP_SPECIFIC_PASSWORD
gh secret set APPLE_TEAM_ID
```

| Secret | Value |
| --- | --- |
| `MAC_CERTIFICATE_PASSWORD` | The password you gave the `.p12` |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | `abcd-efgh-ijkl-mnop`, dashes included |
| `APPLE_TEAM_ID` | The ten-character Team ID |

Type nothing after the secret's name. zsh does not treat `#` as a comment at
the prompt, so a trailing note becomes extra arguments and `gh` answers
`accepts at most 1 arg(s)`.

Or paste them under **Settings → Secrets and variables → Actions**.
`.github/workflows/desktop.yml` imports the certificate into a temporary
keychain on the runner and points electron-builder at it with `CSC_KEYCHAIN`;
the three Apple values go to it as they are. (It does not use electron-builder's
own `CSC_LINK` import: version 26.15 unlocks its keychain with the wrong
password and fails with "SecKeychainUnlock: the passphrase you entered is not
correct".) Nothing else in the repository changes: `hardenedRuntime` is
already on in `electron-builder.yml`, and the default entitlements
electron-builder applies are the ones Electron needs.

Then release:

```bash
git tag desktop-v0.1.0 && git push origin desktop-v0.1.0
```

In the macOS job's log, look for `signing` with your identity, then
`notarization successful`. If the log says `skipped macOS notarization`, one
of the three Apple variables is empty.

## 6. Try it locally first

With the certificate in your keychain, electron-builder finds it without
`CSC_LINK`:

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="TEAMID1234"
pnpm desktop:dist
```

Notarization uploads the app and waits for Apple, usually two to ten minutes.

## 7. Verify the result

```bash
APP=apps/desktop/release/mac-arm64/Onirix.app

codesign --verify --deep --strict --verbose=2 "$APP"
# valid on disk / satisfies its Designated Requirement

spctl -a -vv -t exec "$APP"
# accepted
# source=Notarized Developer ID

xcrun stapler validate "$APP"
# The validate action worked!
```

`source=Notarized Developer ID` is the line that matters. The real test is the
one your users run: download the `.dmg` from the release page in a browser (so
it carries the quarantine flag a local copy does not), open it, drag the app
to Applications, and double-click. It should open after a single "downloaded
from the Internet" confirmation.

## When it goes wrong

| Symptom | Cause |
| --- | --- |
| `skipped macOS application code signing` | No identity found. `MAC_CERTIFICATE_P12_BASE64` is empty, or the `.p12` holds no Developer ID Application certificate. The import step prints the identities it found. |
| `MAC verification failed` in the import step | `MAC_CERTIFICATE_PASSWORD` does not match the `.p12`. |
| `base64: invalid input` in the import step | The secret was pasted rather than piped; set it again with `base64 -i … \| gh secret set …`. |
| Notarization `Invalid` | Run the `xcrun notarytool log <id> …` command the error prints. Usually a binary inside the app that is unsigned or lacks the hardened runtime. |
| `HTTP 401` / `403` from notarytool | Wrong app-specific password, wrong Team ID, or a new Apple agreement waiting to be accepted at developer.apple.com. |
| Signed and notarized, still "damaged" | The `.dmg` was modified after stapling, or the file was re-zipped by something that drops extended attributes. Ship the file electron-builder produced. |

## What about Ollama?

The app downloads Ollama at runtime into its data directory; it is not inside
`Onirix.app`, so it is not covered by your signature and does not need to be.
Ollama's macOS binaries carry Ollama's own Developer ID signature. The app
verifies the download against the release's published SHA-256 before unpacking.

## Renewal

Developer ID certificates last five years. Apps signed while it was valid keep
working after it expires; only new builds need the new certificate. The
membership itself renews yearly, and notarization stops working the day it
lapses.
