# Privacy Policy — Auto Dashboard AI

*Last updated: June 16, 2026 | Version 1.0.11*

## Summary

Auto Dashboard AI is designed with privacy first. Your data stays on your device except for the bookmark metadata sent to the AI model you configure.

---

## What Data Is Collected

**Nothing is collected by this extension's developer.** The extension does not have servers, does not phone home, and does not track usage.

### Data processed locally (on your device)

| Data | Purpose | Stored |
|---|---|---|
| Your OpenRouter API key | Authenticate AI requests | `chrome.storage.local` on your device only |
| Your selected model | Configure AI calls | `chrome.storage.local` on your device only |
| Your bookmark URLs, titles, and folder structure | Display and AI enrichment | `chrome.storage.local` on your device only |
| AI-generated descriptions and metadata | Dashboard display | `chrome.storage.local` on your device only |
| Your Tautulli server URL and API key (if you enable the widget) | Connect to your Tautulli server | `chrome.storage.local` on your device only |

### Data sent to third parties

When you click **Generate Dashboard**, your selected bookmark URLs, titles, and folder names are sent to **OpenRouter** (and from there to whichever model you selected) for metadata enrichment. No other information is transmitted.

**OpenRouter privacy policy:** [openrouter.ai/privacy](https://openrouter.ai/privacy)

The AI request includes:
- Bookmark URLs
- Bookmark titles
- Folder names

The AI request does **not** include:
- Your name, email, or any personal identifiers
- Your browsing history
- Any data beyond the selected bookmarks

### Favicon and icon services

Bookmark icons are resolved in this order: first directly from the bookmarked site itself, then from **Google's favicon service** (`https://www.google.com/s2/favicons`) if the site's own favicon can't be reached, and finally from the **Simple Icons CDN** (`https://cdn.simpleicons.org`) using the AI's best-guess brand icon if no real favicon was found. Each of these means the relevant service receives the domain name (or brand guess) of the bookmark being displayed. If none of these succeed, a generic icon bundled with the extension is shown instead — no further request is made. These are the same kinds of services used by many browsers and extensions.

### Tautulli server (optional, if you enable the widget)

If you enable the Tautulli integration, the extension communicates **directly with the Tautulli server you configure** — a server you host and control. Nothing is sent to any third-party Tautulli service, because none exists; your Tautulli URL is the only destination.

- Activity data is fetched from your server's API every 5 seconds while a preview is open.
- Poster/thumbnail images are loaded through Tautulli's image proxy. **Because Tautulli's image proxy authenticates via query string, your API key appears in those image URLs.** This is how Tautulli's API works, and the requests only ever go to the server address you entered. Treat your API key like a password and only connect to a server you trust.
- Your Tautulli URL and key are stored locally (see the table above) and are never transmitted anywhere other than to your own server.

---

## Data Storage

All settings and dashboard data are stored using `chrome.storage.local`, which:

- Stores data **only on your local device**
- Is **not synced** to Chrome's cloud sync by default
- Is **not accessible** to websites or other extensions
- Is **deleted** when you uninstall the extension

---

## Permissions Explained

| Permission | Why It's Needed |
|---|---|
| `bookmarks` | Read your bookmark tree so you can select which bookmarks to include in your dashboard |
| `storage` | Save your API key, model choice, and dashboard data on your device |
| `tabs` | Open the settings and dashboard pages when you click the extension icon |
| `host_permissions` (`http(s)://*/*`, OpenWeatherMap) | Allow the weather widget to reach OpenWeatherMap and, if enabled, the Tautulli server you configure. Tautulli can run on any local IP/port, so broad access is requested, but requests are only ever made to OpenWeatherMap and your configured Tautulli URL |

The extension does **not** request:
- `history` — your browsing history is never accessed
- `cookies` — no cookie access
- `webRequest` — no interception of web traffic
- `identity` — no account or sign-in required

---

## Your Rights

You can delete all stored data at any time by:
1. Opening `chrome://extensions`
2. Clicking **Details** on Auto Dashboard AI
3. Clicking **Clear site data**

Or by uninstalling the extension, which removes all locally stored data.

---

## Changes to This Policy

If this policy changes in a future version, the updated date and version number at the top of this document will be updated. Significant changes will be noted in the version history in `README.md`.

---

## Contact

This is an open-source project. To report concerns or ask questions, please open an issue in the project's GitHub repository.
