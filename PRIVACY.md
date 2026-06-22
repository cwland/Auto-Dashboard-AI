# Privacy Policy — Auto Dashboard AI

*Last updated: June 22, 2026 | Version 1.0.26*

## Summary

Auto Dashboard AI is built privacy-first. There is no developer-operated backend: the extension does not collect, track, or transmit your data to the developer. Everything is stored locally in your browser. Data only leaves your device when *you* enable a feature that needs an external service — and then it goes only to the service you chose (an AI provider, a weather provider, GitHub for optional backup, or your own self-hosted servers).

---

## What Data Is Collected

**The developer collects nothing.** There are no analytics, no tracking, and no developer servers. Data is processed locally and only sent to the third parties listed below when you turn on the corresponding feature.

### Data stored locally on your device (`chrome.storage.local`)

| Data | Purpose |
|---|---|
| Your bookmark URLs, titles, and folder structure | Build and display dashboards |
| AI-generated names, descriptions, icons, and themes | Dashboard display |
| AI provider API key(s) and selected model | Authenticate AI requests (only the provider you configure) |
| Integration server URLs, API keys, tokens, and credentials | Connect to the self-hosted services whose widgets you enable |
| Weather location / coordinates (and OpenWeatherMap key, if used) | Weather widget |
| GitHub token and backup passphrase (if you enable Gist backup) | Encrypted cloud backup; never synced or backed up themselves |
| Display settings, custom themes, and layout | Your preferences |

This data is stored only on your device, is not accessible to websites or other extensions, and is removed when you uninstall the extension.

### Data sent to third parties (only when you enable the feature)

- **AI provider (optional).** If you add an AI key and use *Generate Dashboard* or AI theme generation, the relevant request is sent to the provider you chose — by default [OpenRouter](https://openrouter.ai/privacy), or directly to OpenAI, Anthropic, Google, Mistral, Meta, Groq, Cohere, Together AI, Fireworks AI, DeepSeek, or xAI. Dashboard requests include your selected bookmark URLs, titles, and folder names. Theme requests include only the text description you type. No personal identifiers or browsing history are sent.
- **Favicon services.** Bookmark icons are resolved from the site itself first, then from **Google's favicon service** (`google.com/s2/favicons`), then from the **Simple Icons CDN** (`cdn.simpleicons.org`) for an AI brand-icon guess, and finally a bundled generic icon (no request). These receive only the domain (or brand name) of the bookmark being shown.
- **Weather provider (optional).** The weather widget uses **Open-Meteo** (no key required) or **OpenWeatherMap** (with your key). Whichever you use receives the location or coordinates you set.
- **GitHub (optional backup/sync).** If you enable Gist backup, the extension talks to `api.github.com` using a token you provide to read/write a single **private** Gist. Your dashboards and settings are **encrypted on your device** (AES-256-GCM with a key derived from your passphrase via PBKDF2) *before* upload — GitHub never sees your unencrypted data, keys, or passphrase. Your GitHub token and passphrase are stored locally only and are excluded from backups.
- **Your self-hosted servers.** Each integration widget you enable (Tautulli, Plex, Sonarr/Radarr, Pi-hole, Proxmox, Home Assistant, and the others listed in the README) communicates **directly with the server address you enter** and nowhere else. Some services (e.g. Tautulli image proxies) authenticate via query string, so your API key can appear in those URLs — treat keys like passwords and only connect to servers you trust.

### Update check

To let you know when a newer version is available, the extension periodically requests a small `version.json` file from the project's public GitHub repository (`raw.githubusercontent.com`). This is an anonymous GET request that contains no personal data and is used only to compare version numbers.

---

## Permissions Explained

| Permission | Why It's Needed |
|---|---|
| `bookmarks` | Read your bookmark tree so you can choose which bookmarks to include |
| `storage` | Save your settings, dashboards, themes, and keys locally on your device |
| `favicon` | Resolve each site's favicon for bookmark icons |
| `alarms` | Schedule the periodic check for the optional GitHub Gist sync |
| `host_permissions` (`http(s)://*/*`) | Reach the AI/weather providers and the self-hosted servers you configure. Because those servers can run on any local IP, hostname, or port, broad access is requested — but requests are only ever made to the endpoints you set up. |

The extension does **not** request `history`, `cookies`, `webRequest`, or `identity`, and contains **no remotely-hosted or eval'd code** — all scripts ship inside the extension.

---

## Data Storage & Your Rights

All data lives in `chrome.storage.local` on your device and is deleted when you uninstall the extension. You can clear it any time via `chrome://extensions` → **Details** → **Clear data**, or by removing your keys/settings in the extension's Settings page. The optional GitHub Gist backup can be deleted from your GitHub account at any time.

---

## Changes to This Policy

If this policy changes, the date and version at the top will be updated, and significant changes will be noted in the version history in `README.md`.

## Contact

This is an open-source project. To report concerns or ask questions, please open an issue in the project's GitHub repository.
