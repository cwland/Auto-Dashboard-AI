# Auto Dashboard AI

A Chrome extension that auto-generates beautiful new-tab dashboards from your bookmarks, enriched with AI-powered descriptions and icons via [OpenRouter](https://openrouter.ai).

## Features

- **AI-enriched bookmarks** — descriptions, clean names, and icons fetched or inferred for every bookmark
- **Folder-organized layout** — your existing bookmark folder structure becomes dashboard sections
- **Icon shapes** — choose Square, Rounded, Circle, or Squircle for icons, set as a dashboard default and overridable per-bookmark
- **Show/hide labels** — toggle the text shown below icons on or off for a cleaner, icon-only look
- **Multiple dashboards** — create and switch between different dashboard versions; set one as default
- **New Tab override** — your default dashboard appears every time you open a new tab
- **Smart icon resolution** — tries each site's real favicon first, falls back to the AI's best-guess brand icon, then a neutral generic icon if nothing matches (with an editable custom emoji option per bookmark)
- **Live search** — press `/` or type to filter bookmarks across all sections
- **Tautulli widget** — connect a [Tautulli](https://tautulli.com/) server to preview live Plex stream activity (poster art, stream/transcode details, progress and ETA), with a seamless infinite carousel when active streams exceed your configured visible count

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select this folder
5. The Settings page opens automatically on first launch

## Setup

### 1. API Key

1. Get a free or paid API key from [openrouter.ai/keys](https://openrouter.ai/keys)
2. Paste it into the **Settings → API Key** field
3. Click **Validate** to confirm it works
4. Click **Save Settings**

### 2. Choose a Model

Recommended models (pre-populated in the dropdown):

| Model | Speed | Cost | Notes |
|---|---|---|---|
| Gemini Flash 1.5 | ⚡ Fast | $ | Recommended default |
| GPT-4o Mini | Fast | $ | Good balance |
| Claude 3 Haiku | Fast | $ | High quality |
| Llama 3.1 8B | Fast | Free | Free tier |
| Mistral 7B | Fast | Free | Free tier |

### 3. Create Your First Dashboard

1. Click the extension icon → **Create / Update Dashboard**
2. Select bookmarks and/or folders from the tree view on the left
3. Give your dashboard a name, pick an icon shape, and choose whether labels show below icons
4. Click **✨ Generate Dashboard** — the AI will analyze each bookmark in batches
5. Once complete, your dashboard appears in the list; set it as **Default** to show on new tabs

## Usage

### New Tab Dashboard

- **Clock & date** — displayed in the top center
- **Search** — press `/` or click the search bar; press `Escape` to clear
- **Switch dashboards** — use the dropdown in the top-right (appears when you have 2+ dashboards)
- **Click any bookmark** — opens in a new tab
- **Edit a bookmark** — hover a card and click the ℹ button to update its name, description, icon, emoji, or shape; use **Delete Item** to remove it from the dashboard
- **Edit the dashboard** — click the ✎ icon next to the dashboard name to rename it, toggle labels on/off, or change the default icon shape

### Managing Dashboards

- Open **Settings → Dashboards** to create, delete, rename, or change the default dashboard
- Click **Edit** on any saved dashboard to rename it, toggle text labels, or change its default icon shape
- You can create multiple themed dashboards (e.g., Work, Personal, Research) and switch between them

## Versioning

Versions follow the format `major.minor.patch` and increment by `0.0.1` each release.

| Version | Date | Notes |
|---|---|---|
| 1.0.14 | 2026-06-16 | Card polish: moved the platform icon below the fields (no longer overlaps text on narrow 3-up cards), restacked the footer so the username always shows with a smaller avatar initial above it, and slowed the carousel slide into a gentle ease-in-out glide |
| 1.0.13 | 2026-06-16 | Added a configurable Carousel Rotation Speed setting (Very slow → Very fast), defaulting to a relaxed 4s per card. Speed updates the live preview instantly |
| 1.0.12 | 2026-06-16 | Redesigned the Tautulli session card to match Tautulli's native activity card: blurred backdrop art, left poster, right-aligned grouped labels with white values, platform icon, secure-stream lock, amber progress bar, and a footer with play-state, title, season/episode index, username and a colored user avatar. More compact overall; auto-tightens type on narrow cards |
| 1.0.11 | 2026-06-16 | Tautulli integration: enable toggle, server URL + API key with validation, Maximum Visible Sessions setting, and a live Preview Widget modal showing Plex stream activity (poster, user/session/stream details, progress + ETA). Reusable widget component polls every 5 s with a seamless infinite carousel when streams exceed the visible count; built for future dashboard deployment |
| 1.0.10 | 2026-06-16 | Icon resolution reordered to real favicon \u2192 AI brand-icon guess \u2192 generic icon (was masking AI guess behind Google's silent placeholder); added a neutral generic fallback icon used dashboard-wide instead of per-bookmark AI emoji; user-customized emojis (set via edit modal) are now tracked separately and still honored |
| 1.0.9 | 2026-06-16 | Icon shapes (Square/Rounded/Circle/Squircle) selectable at creation, editable per-bookmark and as a dashboard default; show/hide text-under-icons toggle; Edit Dashboard (rename, text toggle, default shape) from Settings list and new-tab topbar |
| 1.0.8 | 2026-06-16 | Rebrand to Auto Dashboard AI; significant dark-mode contrast boost (text-secondary #c0d0e0, text-muted #a8bac8); weather-details bumped to 11px |
| 1.0.7 | 2026-06-16 | Dashboard name shown in topbar; clock+date correctly hidden when "Show Date & Time" is off; Widgets tab moved after Dashboards |
| 1.0.6 | 2026-06-16 | Widgets tab in nav (weather card moved there); ADA/WCAG AA contrast fix for `--text-muted` in dark and light modes |
| 1.0.5 | 2026-06-16 | Eyeball show/hide on API key fields; date on/off toggle; 8 date formats incl. EU/UK/ISO; weather refresh interval setting (default 60 min, min 10); cross-tab fetch lock |
| 1.0.4 | 2026-06-16 | Clock & date format settings (12/24h, 5 date styles), OpenWeatherMap weather widget (temp, high/low, wind, sunrise/sunset), weather toggle in Settings |
| 1.0.3 | 2026-06-16 | Rewrote drag system: placeholder-based approach, document-level pointer listeners, fixed FLIP animation freeze |
| 1.0.2 | 2026-06-16 | Smooth FLIP drag-and-drop, pointer-events rearrange, Delete Item in edit modal, removed hover tooltip |
| 1.0.1 | 2026-06-16 | Direct favicon resolution, Simple Icons fallback, light/dark theme |
| 1.0.0 | 2026-06-16 | Initial release |

## Project Structure

```
auto-dashboard-ai/
├── manifest.json          # Extension manifest (MV3)
├── background/
│   └── service-worker.js  # Background service worker
├── config/
│   ├── config.html        # Settings & dashboard management UI
│   └── config.js          # Settings logic, bookmark tree, AI processing
├── newtab/
│   ├── newtab.html        # New tab dashboard page
│   └── newtab.js          # Dashboard rendering and search
├── popup/
│   ├── popup.html         # Extension toolbar popup
│   └── popup.js           # Popup logic
├── styles/
│   └── common.css         # Shared design system
├── widgets/
│   ├── tautulli-widget.js  # Reusable Tautulli activity widget (preview + future dashboards)
│   └── tautulli-widget.css # Widget styles (bubble cards, carousel, progress)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Permissions

| Permission | Reason |
|---|---|
| `bookmarks` | Read your bookmark tree to populate the dashboard |
| `storage` | Save settings, API key, and dashboard data locally |
| `tabs` | Open config/dashboard pages when needed |
| `host_permissions` | Reach the OpenWeatherMap API (weather widget) and your self-hosted Tautulli server. Tautulli can run on any local IP/port, so broad `http(s)://*/*` access is requested; requests are only ever made to the OpenWeatherMap endpoint and the Tautulli URL you configure |

## Tautulli widget

Open **Settings → Widgets → Tautulli Integration**, enable it, then enter your Tautulli **Server URL** (e.g. `http://192.168.1.10:8181`) and **API key** (found in Tautulli under *Settings → Web Interface → API Key*). Click **Validate API Key**, then **Preview Widget** to see live activity. Set **Maximum Visible Sessions** to control how many stream cards show before the widget switches to a rotating carousel, and **Carousel Rotation Speed** to control how quickly it advances. Dashboard tiles reusing this widget are planned for a future release.

## License

MIT
