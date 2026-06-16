# Privacy Policy — Auto Dashboard AI

*Last updated: June 16, 2026 | Version 1.0.0*

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

### Favicon service

Bookmark icons are fetched from **Google's favicon service** (`https://www.google.com/s2/favicons`). This means Google receives the domain name of each bookmark when its favicon is displayed. This is the same service used by many browsers and extensions.

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
