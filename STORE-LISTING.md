# Chrome Web Store — Listing & Privacy Disclosures (reference)

Paste-ready text for the Developer Dashboard submission. Keep this in sync with `manifest.json` and `PRIVACY.md`.

## Single purpose

> Auto Dashboard AI turns your browser bookmarks into customizable dashboard pages, with optional AI-generated names, descriptions, icons, and color themes, plus optional read-only status widgets for services you self-host.

## Privacy policy URL

Host `PRIVACY.md` at a public URL (e.g. GitHub Pages or the raw file link) and enter it in the listing's **Privacy** section.

## Permission justifications

Paste one per permission in the Developer Dashboard.

- **bookmarks** — Reads the user's bookmark tree so they can select which bookmarks and folders to include when building a dashboard.
- **storage** — Stores the user's dashboards, settings, themes, and any API keys locally on the device. No data is sent to the developer.
- **favicon** — Resolves each bookmarked site's favicon to display as its dashboard icon.
- **alarms** — Schedules the periodic background check for the optional GitHub Gist backup/sync feature.
- **Host permission `http://*/*` and `https://*/*`** — The extension connects to endpoints the user configures: their chosen AI provider, a weather provider, GitHub (for optional encrypted backup), and any self-hosted services they add widgets for (e.g. Plex, Pi-hole, Proxmox, Home Assistant). These servers can run on any IP address, hostname, or port, so broad host access is required. Requests are only ever made to endpoints the user explicitly configures; the extension never injects scripts into or reads arbitrary web pages.

## Remote code

> No. All JavaScript is bundled in the extension package. There is no remotely-hosted code, `eval`, or `new Function`.

## Data usage / privacy practices (what the extension handles)

Declare the following and the destinations they're sent to (only when the user enables the feature):

- **Personally identifiable / personal info:** bookmarks (URLs, titles, folder names). Sent to the user's chosen AI provider only when they run AI enrichment.
- **Authentication information:** API keys/tokens and credentials the user enters for AI, weather, GitHub, and their self-hosted services. Stored locally; transmitted only to the matching service the user configured.
- **Website content:** read-only status data fetched from the user's self-hosted services for widget display. Sent only between the user's browser and their own servers.
- **Location:** the city/coordinates the user enters for the weather widget, sent to the weather provider they pick (Open-Meteo or OpenWeatherMap).

### Required certifications (all true for this extension)

- Data is **not** sold to third parties.
- Data is **not** used or transferred for purposes unrelated to the extension's single purpose.
- Data is **not** used or transferred to determine creditworthiness or for lending.

### Notes for the reviewer (optional but helpful)

- There is no developer backend; nothing is collected by the developer.
- All settings and keys are stored in `chrome.storage.local`.
- The optional GitHub Gist backup encrypts data on-device (AES-256-GCM, PBKDF2) before upload.
- A periodic anonymous GET to the project's public GitHub repo checks for a newer version (no personal data).
