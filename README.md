# Auto Dashboard AI

A Chrome extension that auto-generates beautiful new-tab dashboards from your bookmarks, enriched with AI-powered descriptions and icons via [OpenRouter](https://openrouter.ai).

## Features

- **AI-enriched bookmarks** — descriptions, clean names, and icons fetched or inferred for every bookmark
- **Folder-organized layout** — your existing bookmark folder structure becomes dashboard sections
- **Icon shapes** — choose Square, Rounded, Circle, or Squircle for icons, set as a dashboard default and overridable per-bookmark
- **Show/hide labels** — toggle the text shown below icons on or off for a cleaner, icon-only look
- **Multiple dashboards** — create and switch between different dashboard versions; set one as default
- **New Tab override** — your default dashboard appears every time you open a new tab
- **Favicon + emoji icons** — Google favicon service with AI emoji fallback for local/unknown links
- **Live search** — press `/` or type to filter bookmarks across all sections

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

## License

MIT
