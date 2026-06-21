# GitHub Gist Backup — Setup (no OAuth)

Backing up to a private GitHub Gist needs just one thing: a **personal access
token** scoped to gists. No Google Cloud project, no OAuth client, no consent
screen. Works in any browser.

The backup is stored as a single file (`auto-dashboard-config.json`) in a
**private** gist that the extension creates and updates automatically.

---

## 1. Create a token

You can use either token type. A **fine-grained** token is recommended because
you can scope it to gists only.

### Fine-grained token (recommended)

1. Go to <https://github.com/settings/personal-access-tokens/new>.
2. **Token name**: e.g. "Auto Dashboard AI backup".
3. **Expiration**: your choice (e.g. 1 year). You'll need to re-paste a new token
   when it expires.
4. **Account permissions → Gists**: set to **Read and write**.
   (Leave all repository permissions as "No access".)
5. **Generate token** and copy it (starts with `github_pat_…`). You won't see it
   again.

### Classic token (alternative)

1. Go to <https://github.com/settings/tokens/new>.
2. Give it a note and expiration.
3. Check the **`gist`** scope only.
4. **Generate token** and copy it (starts with `ghp_…`).

## 2. Paste it into the extension

1. Open the extension's **Settings → 💾 Backup & Sync**.
2. Turn on **Back up to GitHub Gist**.
3. Paste the token into **GitHub token (gists scope)**. Use the eye icon to show
   it, and click **Test** to confirm it authenticates and has gist access.
4. Enter an **Encryption passphrase** — this is **required**. Your backup is
   encrypted with it before upload, so the gist never contains readable secrets.
   Use the same passphrase on every device. ⚠️ If you lose it, the backup can't be
   recovered.
5. Click **Save**.
6. Click **Back up to Gist** to create/update the backup. Backups are **manual** —
   click the button whenever you want to save your latest config. Your dashboard
   icons are embedded into the backup automatically each time you back up.

On another computer (any browser), enter the **same** token and passphrase, Save,
then click **Restore from Gist** to pull your config (icons included) down.

## Keep in sync automatically (optional)

Turn on **Keep in sync automatically** for hands-off two-way sync across your
computers. When it's on:

- Your changes are **backed up automatically**, about 30 seconds after you stop
  editing.
- Newer changes from your other computers are **loaded automatically** — on
  startup, every ~30 seconds, and when you open a dashboard (the page refreshes
  to show the synced data).

The most recently edited copy wins if two computers change at once. It's
loop-safe: a change that was just loaded by sync won't trigger another backup.
You can still use **Back up to Gist** / **Restore from Gist** by hand anytime.

**Same browser brand only.** Each browser brand keeps its own separate backup
file (e.g. `auto-dashboard-config-brave.json`, `auto-dashboard-config-chrome.json`)
in your gists, and only syncs with the same brand — Brave ↔ Brave, Chrome ↔
Chrome. Different brands render the grid slightly differently, so they're kept
apart on purpose. To copy your setup from one brand to another, use **Export
configuration** / **Import configuration** instead.

---

## Why encryption is required

A private gist is still viewable by anyone who gets its URL, and your config holds
API keys. So the extension **requires** an encryption passphrase for Gist backup:
the data is AES-256 encrypted in your browser before upload and the gist only ever
holds ciphertext. (Your GitHub token itself is never written into the backup at
all — that would make GitHub auto-revoke it.)

## Notes

- **Privacy.** The gist is private (unlisted), but treat the token and the gist URL
  as secrets anyway. Revoke the token anytime at
  <https://github.com/settings/tokens>.
- **Find your backup.** It appears at <https://gist.github.com/> under your
  account as "Auto Dashboard AI — config backup". Don't rename the file; the
  extension looks it up by name.
- **Schema safety.** If a backup was written by a newer version of the extension,
  restore/sync pauses and asks you to update — it won't overwrite newer data with
  an older format.
- **Token errors.** If the status line says GitHub rejected the token, confirm it
  hasn't expired and has the **gists** (read & write) permission.
