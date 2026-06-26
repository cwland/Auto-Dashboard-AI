# Auto Dashboard AI

A Chrome extension that turns your browser bookmarks into clean, customizable dashboards. Your bookmark folders become dashboard sections you can arrange, theme, and extend with live widgets. Optional AI can help fill in names, descriptions, icons, and color themes — but it's never required.

## Purpose

Auto Dashboard AI grew out of trying a number of self-hosted dashboards and finding that I liked different features in each one, but no single one did everything I wanted. More importantly, every one of them was a hosted service: if I was away from home and not on a VPN, or the service itself went down, I lost the dashboard entirely and had to look up addresses by hand. Browser bookmarks were my fallback, but they were constantly out of sync — I'd add a new service to the dashboard and forget to bookmark it, or vice versa.

This project is the answer to that problem: a dashboard that lives in the browser itself, so it keeps working no matter where I am or whether any server is up. It started from my own bookmarks (so the dashboard and the bookmarks can't drift apart) and grew from there.

It's also a deliberate learning project — a way to build a real application primarily through AI prompting, and to experiment with where AI genuinely helps inside an app (organizing bookmarks, generating descriptions and icons, designing color themes, and more).

**Goals**

- Build a complete application primarily through AI-assisted coding (prompting).
- Explore and test practical AI features inside an app — organization, themes, descriptions, icons, and so on.
- Provide a dashboard that does **not** depend on any service running to be usable.
- Sync settings and dashboards across computers.
- Improve on the features I liked best in other dashboard software.
- Add widgets and integrations that weren't available elsewhere.
- Make everything easy to back up and restore.

## Features

- **Folder-organized layout** — your existing bookmark folder structure becomes dashboard sections
- **Drag-and-drop editing** — rearrange icons and sections, resize sections, and add items in Edit mode
- **Icon shapes** — choose Square, Rounded, Circle, or Squircle for icons, set as a dashboard default and overridable per-bookmark
- **Show/hide labels** — toggle the text shown below icons on or off for a cleaner, icon-only look
- **Multiple dashboards** — create and switch between different dashboard versions; set one as default
- **Open from the toolbar** — click the extension icon to open your default dashboard in a tab
- **Smart icon resolution** — tries each site's real favicon first, then a brand-icon guess, then a neutral generic icon if nothing matches (with an editable custom emoji option per bookmark)
- **Live search** — press `/` or type to filter bookmarks across all sections
- **Themes** — many built-in light and dark themes, plus custom themes you can build by hand
- **Optional AI assist** — if you add an API key, AI can fill in clean names, descriptions, icons, and generate color themes
- **Tautulli widget** — connect a [Tautulli](https://tautulli.com/) server to preview live Plex stream activity (poster art, stream/transcode details, progress and ETA), with a seamless infinite carousel when active streams exceed your configured visible count
- **Uptime Kuma widget** — point at an [Uptime Kuma](https://github.com/louislam/uptime-kuma) status page (no API key needed) for an at-a-glance health summary: average 24-hour uptime with a color-coded ring, plus total / up / down / paused monitor counts and an optional per-monitor list. Try `widgets/uptime-kuma-demo.html` for a clickable offline preview
- **Sonarr & Radarr widgets** — connect [Sonarr](https://sonarr.tv/) and/or [Radarr](https://radarr.video/) to see upcoming releases from your library, each as either a compact upcoming-releases list or a month calendar grid (toggle inside the widget). Episodes show `SxxExx` badges; movies appear once per release type (in cinemas / digital / physical). Try `widgets/arr-calendar-demo.html` for a clickable offline preview
- **Seerr widget** — connect [Overseerr](https://overseerr.dev/), [Jellyseerr](https://docs.jellyseerr.dev/), or Seerr to see media requests two ways (toggle inside the widget): a recent-requests list with status/availability badges and who requested each item, or a stats grid (approved / pending / processing / declined / available / TV / movies / total) with top requesters. Try `widgets/seerr-demo.html` for a clickable offline preview
- **Pi-hole & AdGuard Home widgets** — connect a [Pi-hole](https://pi-hole.net/) (v5 or v6, auto-detected) and/or [AdGuard Home](https://adguard.com/adguard-home/overview.html) DNS server for an ad-blocking summary: ads blocked today, block rate, DNS queries today, and blocklist size, plus a blocking on/off status pill. Try `widgets/dns-hole-demo.html` for a clickable offline preview
- **Plex widget** — connect a [Plex Media Server](https://www.plex.tv/) to see what's currently playing: active streams with media type, title, episode/album, the user, and their device. Try `widgets/plex-demo.html` for a clickable offline preview
- **Jellyfin & Emby widgets** — connect a [Jellyfin](https://jellyfin.org/) and/or [Emby](https://emby.media/) server (URL + API key) to see what's currently playing: active sessions with media type, title, episode/album, user, device, play/pause state, and a progress bar. Both share one reusable widget
- **UniFi Controller widget** — connect a [UniFi](https://ui.com/) controller for a network health summary: internet status with latency and uptime, plus Wi-Fi, LAN, and VPN status with connected user/guest counts. Try `widgets/unifi-demo.html` for a clickable offline preview
- **SABnzbd, qBittorrent & Transmission widgets** — connect your download clients to see active transfers: each item with a progress bar, state badge, size, and speeds, plus aggregate down/up rates in the header. Works with [SABnzbd](https://sabnzbd.org/) (usenet), [qBittorrent](https://www.qbittorrent.org/), and [Transmission](https://transmissionbt.com/) (torrents). Try `widgets/download-client-demo.html` for a clickable offline preview
- **PeaNUT widget** — connect a [PeaNUT](https://github.com/Brandawg93/PeaNUT) (NUT) server for a UPS summary: status, battery charge, load, runtime, voltages, power, and temperature per device. Try `widgets/extras-demo.html`
- **Umami widget** — connect [Umami](https://umami.is/) web analytics to show active visitors plus visitors, pageviews, bounce rate, and average visit duration for a chosen time frame. Try `widgets/extras-demo.html`
- **Speedtest Tracker widget** — connect [Speedtest Tracker](https://docs.speedtest-tracker.dev/) to show the latest internet download/upload/ping plus averages. Try `widgets/extras-demo.html`
- **ntfy widget** — show recent notifications from an [ntfy](https://ntfy.sh/) topic. Try `widgets/extras-demo.html`
- **Audiobookshelf widget** — library summary from an [Audiobookshelf](https://www.audiobookshelf.org/) server: audiobooks, podcasts, libraries, listening time, and active sessions. Try `widgets/media-library-demo.html`
- **Navidrome widget** — music-library counts (artists, albums, songs) and now-playing from [Navidrome](https://www.navidrome.org/). Try `widgets/media-library-demo.html`
- **Prowlarr widget** — indexer health from [Prowlarr](https://prowlarr.com/): how many are healthy, plus a per-indexer status list. Try `widgets/media-library-demo.html`
- **Tracearr widget** — media-stream monitor: active streams, users, sessions, and recent violations, with a live stream list. Try `widgets/media-library-demo.html`
- **System health widgets** — host monitoring from [Glances](https://nicolargo.github.io/glances/), [dash.](https://getdashdot.com/), [Unraid](https://docs.unraid.net/API/), [OpenMediaVault](https://www.openmediavault.org/), or [TrueNAS](https://www.truenas.com/): CPU, memory, uptime, temperature, load, filesystems, SMART, and GPU. Try `widgets/system-monitoring-demo.html`
- **Proxmox VE widget** — cluster summary: nodes (CPU/memory), running vs. total VMs and containers, and storage usage. Try `widgets/system-monitoring-demo.html`
- **Proxmox Backup Server widget** — node CPU/memory/uptime and per-datastore usage. Try `widgets/system-monitoring-demo.html`
- **Beszel widget** — lightweight monitoring of multiple systems, each with status and CPU/memory/disk usage. Try `widgets/system-monitoring-demo.html`
- **iCal widget** — events from any iCalendar (`.ics`) feed (Google Calendar, Outlook, Nextcloud exports, …) as an upcoming list or a clickable month grid; recurring events expand via a built-in RRULE parser. Try `widgets/calendar-home-demo.html`
- **Home Assistant widget** — live states of the entities you pick (lights, switches, sensors) with on/off toggles. Try `widgets/calendar-home-demo.html`
- **Nextcloud widget** — recent Nextcloud notifications. (For Nextcloud calendars, point the iCal widget at a calendar's exported `.ics` link.) Try `widgets/calendar-home-demo.html`
- **OPNsense widget** — firewall summary: CPU and memory usage, version, and per-interface traffic shown as live rates. Try `widgets/opnsense-demo.html`
- **n8n widgets** — connect an [n8n](https://n8n.io/) instance (REST API key) for two widgets: a **Quick View** of running / failed-today / succeeded-today executions, and an **Upcoming Schedule** list that reads each active workflow's Schedule Trigger and computes the next run time (relative + clock), newest first. Read-only.
- **Quick View widgets** — a compact, at-a-glance metric card (icon + title + four-or-five key numbers) available for many integrations: Sonarr, Radarr, Seerr, Tautulli, Plex, SABnzbd, qBittorrent, Transmission, Uptime Kuma, Portainer, Prowlarr, Speedtest, Proxmox, and n8n. Each is optionally clickable to open the service, can hide its frame/background to blend into the dashboard, and can show an online/offline status badge.

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select this folder
5. The Settings page opens automatically on first launch

## Getting Started

You can build and use a complete dashboard **without AI** — the steps below are all you need. AI is entirely optional and only automates the busywork; if you want it, see [Using AI](#using-ai-optional) at the end.

### Create a dashboard

1. Click the extension icon and choose **Create / Update Dashboard**.
2. Pick a starting point:
   - **From bookmarks** — select bookmarks and/or folders from the tree on the left. Your folder structure becomes the dashboard's sections.
   - **Blank** — start empty and add items yourself afterward (in Edit mode).
3. Name the dashboard, pick a default icon shape (Square / Rounded / Circle / Squircle), and choose whether labels show beneath icons.
4. Create it. Without AI, the dashboard is built immediately using each site's favicon (with a neutral fallback icon when a site has none).
5. The new dashboard opens automatically. Click the extension icon any time to reopen it; in **Settings → Dashboards** you can set one dashboard as the **Default** that opens.

That's it — you have a working dashboard. See **[Using your dashboard](#using-your-dashboard)** below to arrange, theme, and tweak it. If you'd like AI to fill in names, descriptions, and icons for you, that's covered in [Using AI](#using-ai-optional).

## Using your dashboard

### Everyday use

- **Open a bookmark** — click any icon (opens in a new tab; configurable per item).
- **Search** — press `/` or click the search box to filter bookmarks across all sections; press `Escape` to clear.
- **Switch dashboards** — use the switcher at the top. Its style (tabs across the top, a left sidebar, or a dropdown) is set in **Dashboard Options → Dashboard Switcher**.
- **Hover details** — hovering a bookmark shows its description and URL in a popup at the bottom (this can be turned off in Dashboard Options).

### Edit mode

Click **✎ Edit Dashboard** (top-right) to enter Edit mode. A floating toolbar appears — drag it anywhere by the grip (⠿) on its left. From it you can:

- **➕ Add** a bookmark, a live widget, or a manual item to any section.
- **📐 Auto-resize** sections tightly around their icons, **🧲 Snap** sections together to close gaps, and **↩️ Undo** the last auto-layout change.
- **⚙️ Dashboard Options** and **🎨 Theme** (see below).
- **✕ Cancel** to discard changes or **✓ Save** to keep them.

While editing, drag icons to rearrange them (within or across sections), drag sections to move them, and drag a section's edge to resize it — a section only snaps back if you make it too small to show its icons. Each icon shows a small **ℹ** (top-left) to edit its name, description, icon, emoji, or shape, and an **✕** (top-right) to remove it.

### Dashboard Options (⚙)

A floating panel whose changes **save automatically** (no Save button) and apply live. It does not dim the dashboard, so you can see your changes immediately. Options include:

- **Header Layout** — **Full** (logo, name, clock/date) or **Compact** (branding hidden, dashboard name on the left, time and date on one centered line).
- **Show Time / Show Date** — toggle the clock and date independently.
- **Show Edit Dashboard Button** — when off, a small ⚙ in the top-right corner takes its place.
- **Show Settings Button**, **Search**, and **Link Hover Popup** — show/hide each.
- **Dashboard Switcher** — choose Tabs, Sidebar, or Dropdown.

### Themes (🎨)

The Theme picker previews and applies a color theme to the dashboard. While it's open the dashboard goes read-only so you can preview accurately. Themes are grouped into **Light**, **Dark**, and **Custom** tabs (plus **Auto**, which follows your system light/dark); click any theme to apply and save it. On the **Custom** tab you can:

- **+ Create custom theme** — pick your colors by hand, with a live preview.
- **✨ Generate with AI** / **🎲 Surprise me** — generate a palette from a description, or a random one (requires AI).
- **Delete** a custom theme via the **✕** on its card (with confirmation).

### Managing dashboards

- Open **Settings → Dashboards** to create, rename, reorder, delete, or change the default dashboard.
- Create as many dashboards as you like (e.g., Work, Personal, Home Lab) and switch between them from the dashboard.
- Everything — dashboards, settings, and custom themes — can be exported to a file or synced to a private GitHub Gist (see **Backup & Sync** in Settings) so you can restore it on another computer or browser.

## Using AI (optional)

AI is a convenience layer, not a requirement — everything above works without it. If you'd like it to do the busywork, it can fill in clean names, short descriptions, and inferred icons for your bookmarks, and generate color themes from a description. Without a key, these actions are simply disabled and nothing else changes.

To enable it:

1. Add an API key in **Settings → AI**. You can bring your own key from any supported provider — [OpenRouter](https://openrouter.ai/keys) (one key for many models), OpenAI, Anthropic, Google, Mistral, Meta, Groq, Cohere, Together AI, Fireworks AI, DeepSeek, or xAI.
2. Paste the key, click **Validate**, then **Save Settings**.
3. Pick a model (the dropdown is pre-populated with sensible defaults — fast/cheap options work well here).

Then you can:

- **✨ Generate Dashboard** when creating a dashboard — the AI processes your selected bookmarks in batches and adds names, descriptions, and best-guess icons. (Only the bookmark URLs, titles, and folder names are sent to your chosen provider.)
- **Generate with AI** or **🎲 Surprise me** in the Theme picker — describe a vibe (or let it invent one) and get a full, accessible color theme.

## Versioning

Versions follow the format `major.minor.patch` and increment by `0.0.1` each release.

| Version | Date | Notes |
|---|---|---|
| 1.3.0 | 2026-06-25 | Quick View widgets — compact at-a-glance metric cards for Sonarr, Radarr, Seerr, Tautulli, Plex, SABnzbd, qBittorrent, Transmission, Uptime Kuma, Portainer, Prowlarr, Speedtest, Proxmox, and n8n (clickable open-on-tap, optional frame/background, online/offline status badge). New n8n integration (workflow monitoring): a Quick View of running/failed/succeeded executions plus an Upcoming Schedule list that computes each active workflow's next run from its Schedule Trigger. Prowlarr and Speedtest gained scrolling list widgets (indexer health, speedtest history). Per-widget custom display names, the Widget Library renamed to Integration Library, and assorted UI polish. |
| 1.2.1 | 2026-06-23 | Per-widget config menus with scrolling for Seerr (Requests/Stats), Sonarr/Radarr (Upcoming/Calendar) and Tautulli (slider controls); a redesigned Light/Dark/Custom theme picker (12 light + 12 dark, Midnight default, AI “Surprise me”); a multi-select widgets-and-dashboards "add to dashboard" chooser; a rewritten tabbed How to Use guide with Privacy moved to the end; bookmark-sync folder placed last and reconciled on save; smoother two-way drag edge-scrolling; list widgets hold a stable minimum size; icons 25% smaller with 15% larger glyphs; solid config-popup backgrounds; and the widget remove ✕ moved onto the corner. |
| 1.2.0 | 2026-06-23 | Proxmox dashboards (Health, System Logs, Backup Logs, Storage, VMs & LXCs, Overview), redesigned themes with full-palette swatches and editable custom themes, the renamed Widget Library, a new Privacy page, encrypted Gist backup & sync, and dashboard-creation improvements (blank dashboards, optional bookmarks, auto-open). Consolidates releases 1.0.15–1.0.26. |
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
│   ├── newtab.html        # Dashboard page (also dashboard.html for explicit opens)
│   └── newtab.js          # Dashboard rendering and search
├── popup/
│   ├── popup.html         # Extension toolbar popup
│   └── popup.js           # Popup logic
├── styles/
│   └── common.css         # Shared design system
├── widgets/
│   ├── dashboard-mounts.js   # Maps each widget id → its widget class + config
│   ├── quickview-widget.js   # Generic Quick View card; per-integration metric specs
│   ├── list-carousel.js      # Shared auto-scrolling list framework (Prowlarr, n8n, …)
│   ├── n8n-widget.js         # n8n API + Upcoming Schedule list widget
│   ├── tautulli-widget.js    # Reusable Tautulli activity widget (one file per integration)
│   ├── *-widget.css          # Per-widget styles (bubble cards, carousel, progress)
│   ├── sample.html / sample.js  # Offline sample previews for the Integration Library
│   └── …                     # One *-widget.js (+ .css) per integration
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
| `favicon` | Resolve each site's favicon for bookmark icons |
| `alarms` | Schedule the periodic Gist auto-sync check |
| `host_permissions` | Reach the OpenWeatherMap API (weather widget) and your self-hosted servers (Tautulli, Uptime Kuma, Sonarr, Radarr, Overseerr/Jellyseerr, Pi-hole, AdGuard Home, Plex, UniFi, SABnzbd, qBittorrent, Transmission, PeaNUT, Umami, Speedtest Tracker, ntfy, Audiobookshelf, Navidrome, Prowlarr, Tracearr, Glances, dash., Unraid, OpenMediaVault, TrueNAS, Proxmox, PBS, Beszel, Home Assistant, Nextcloud, OPNsense, n8n, and any iCal feed). These can run on any local IP/port, so broad `http(s)://*/*` access is requested; requests are only ever made to the OpenWeatherMap endpoint and the server URLs you configure |

## Tautulli widget

Open **Settings → Widgets → Tautulli Integration**, enable it, then enter your Tautulli **Server URL** (e.g. `http://192.168.1.10:8181`) and **API key** (found in Tautulli under *Settings → Web Interface → API Key*). Click **Validate API Key**, then **Preview Widget** to see live activity. Set **Maximum Visible Sessions** to control how many stream cards show before the widget switches to a rotating carousel, and **Carousel Rotation Speed** to control how quickly it advances. Dashboard tiles reusing this widget are planned for a future release.

## Uptime Kuma widget

Open **Settings → Widgets → Uptime Kuma Integration**, enable it, then enter your Uptime Kuma **Server URL** (e.g. `http://192.168.1.10:3001`) and the **Status Page Slug** (the last part of a status-page URL, e.g. `…/status/default`). No API key is required — the widget reads a public status page. Click **Test Connection**, choose which stats to display, then **Preview Widget**. For a no-server, fully clickable demo, open `widgets/uptime-kuma-demo.html` in a browser.

## Sonarr & Radarr widgets

Open **Settings → Widgets → Sonarr Integration** or **Radarr Integration**, enable it, then enter the **Server URL** (Sonarr default port `8989`, Radarr `7878`) and the **API key** (found under *Settings → General → API Key* in each app). Click **Test Connection**, pick a **Default View** (upcoming list or month calendar) and how many upcoming items to show, then **Preview Widget**. Both views are always available via the toggle in the widget's header; in the calendar, click a highlighted day to see that day's releases. Radarr additionally lets you choose which **release types** (in cinemas / digital / physical) to include. For a no-server, fully clickable demo of both, open `widgets/arr-calendar-demo.html` in a browser.

## Seerr widget

Open **Settings → Widgets → Seerr Integration**, enable it, then enter the **Server URL** (Overseerr/Jellyseerr default port `5055`) and the **API key** (found under *Settings → General → API Key*). Click **Test Connection**, pick a **Default View** (recent requests or stats), how many requests to show, and whether to show top requesters, then **Preview Widget**. Both views are available via the toggle in the widget's header. The widget is read-only — it surfaces request status and availability but does not approve or decline requests. For a no-server, fully clickable demo, open `widgets/seerr-demo.html` in a browser.

## Pi-hole & AdGuard Home widgets

Open **Settings → Widgets → Pi-hole Integration** or **AdGuard Home Integration**, enable it, and enter the server URL. **Pi-hole** needs an app password (v6: *Settings → Web interface / API → App password*) or API token (v5: *Settings → API*); the version is detected automatically. **AdGuard Home** uses your dashboard **username and password** (HTTP Basic auth). Click **Test Connection**, then **Preview Widget**. Each widget shows ads blocked today, block rate, DNS queries today, and blocklist size, with a blocking on/off status pill. The widgets are read-only — they show status but do not enable/disable blocking. For a no-server, fully clickable demo of both, open `widgets/dns-hole-demo.html` in a browser.

## Plex widget

Open **Settings → Widgets → Plex Integration**, enable it, then enter your **Server URL** (default port `32400`) and **Plex token** (see [Finding your X-Plex-Token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)). Click **Test Connection**, then **Preview Widget** to see active streams. For a no-server, fully clickable demo, open `widgets/plex-demo.html` in a browser.

## UniFi Controller widget

Open **Settings → Widgets → UniFi Controller Integration**, enable it, then enter the **Controller URL** (UniFi OS / UDM typically on `443`, classic controllers on `8443`), a **local** admin username and password, and the **site** (usually `default`). Click **Test Connection**, then **Preview Widget**. The widget shows internet status with latency and uptime, plus Wi-Fi, LAN, and VPN status with user/guest counts. Note: UniFi controllers use cookie/CSRF login, so if yours uses a self-signed certificate, open its URL in the same browser once and accept the certificate first; some controllers may also require CORS allowances for browser access. For a no-server, fully clickable demo, open `widgets/unifi-demo.html` in a browser.

## SABnzbd, qBittorrent & Transmission widgets

Open **Settings → Widgets** and enable the client(s) you use. **SABnzbd** needs the server URL and **API key** (*Config → General → API Key*). **qBittorrent** needs the WebUI URL plus **username/password** (it logs in via cookie — you may need to relax host-header validation in *Options → Web UI* for cross-origin access). **Transmission** needs the URL and, if RPC auth is enabled, a **username/password** (optional otherwise). Click **Test Connection**, choose how many items to show, then **Preview Widget**. Each widget lists transfers with a progress bar, state badge, size, and speeds, with aggregate rates in the header. The widgets are read-only — they show transfers but do not pause/resume/delete. For a no-server, fully clickable demo of all three, open `widgets/download-client-demo.html` in a browser.

## Tests

Run the widget unit tests with Node (no dependencies required):

```
node test/widget.test.js                  # Tautulli widget
node test/uptime-kuma-widget.test.js      # Uptime Kuma widget
node test/arr-calendar-widget.test.js     # Sonarr / Radarr widget
node test/seerr-widget.test.js            # Seerr widget
node test/dns-hole-widget.test.js         # Pi-hole / AdGuard Home widget
node test/plex-widget.test.js             # Plex widget
node test/media-server-widget.test.js     # Jellyfin / Emby widget
node test/unifi-widget.test.js            # UniFi Controller widget
node test/download-client-widget.test.js  # SABnzbd / qBittorrent / Transmission
node test/extras-widgets.test.js          # PeaNUT / Umami / Speedtest / ntfy
node test/media-library-widgets.test.js   # Audiobookshelf / Navidrome / Prowlarr / Tracearr
node test/system-monitoring-widgets.test.js # Glances/Dashdot/Unraid/OMV/TrueNAS/Proxmox/PBS/Beszel
node test/calendar-home-widgets.test.js   # iCal / Home Assistant / Nextcloud
node test/opnsense-widget.test.js         # OPNsense
```

## OPNsense widget

Open **Settings → Widgets → OPNsense Integration**, enable it, then enter the URL and an **API key + secret** (System → Access → Users → your user → API keys → "+"). Click **Test Connection**, then **Preview Widget**. The widget shows CPU and memory usage, the OPNsense version, and each interface's live receive/transmit rate (computed by diffing the cumulative byte counters between polls). Read-only. For a no-server, clickable demo, open `widgets/opnsense-demo.html` in a browser.

## iCal, Home Assistant & Nextcloud widgets

Open **Settings → Widgets** and enable what you want. **iCal** takes any `.ics` URL (Google Calendar's secret iCal address, an Outlook share, or a Nextcloud calendar's private link) — it shows an upcoming list or a month grid, and expands recurring events. **Home Assistant** needs the URL and a long-lived access token (Profile → Security), plus a list of entity IDs (one per line, from Developer Tools → States); toggleable entities get an on/off switch. **Nextcloud** uses your username and an app password (Settings → Security) and shows recent notifications — for Nextcloud *calendars*, add the calendar's exported `.ics` link to the iCal widget instead (CalDAV isn't read directly). Click **Test Connection**, then **Preview Widget**. For a no-server, clickable demo of all three, open `widgets/calendar-home-demo.html` in a browser.

## System monitoring widgets (Glances, dash., Unraid, OpenMediaVault, TrueNAS, Proxmox, PBS, Beszel)

Open **Settings → Widgets** and enable what you run. **Glances** needs the URL (username/password only if you enabled web auth); **dash.** needs just the URL. **Unraid** needs the URL and an API key (Unraid API / GraphQL). **OpenMediaVault** uses your admin username/password (cookie-session RPC). **TrueNAS** SCALE uses an API key over its WebSocket API. **Proxmox VE** and **Proxmox Backup Server** use an API token (user, realm, token id, secret) — PVE joins the token id and secret with `=`, PBS with `:`. **Beszel** uses your hub email/password (PocketBase). Click **Test Connection**, then **Preview Widget**. All are read-only.

A few of these need care from a browser extension: **TrueNAS** (WebSocket — the host must be reachable over ws/wss and a self-signed cert accepted first), **OpenMediaVault** (cookie-session RPC may be blocked cross-origin), and the Proxmox/PBS endpoints over self-signed certs (open the URL once and accept the certificate). For a no-server, clickable demo of all eight, open `widgets/system-monitoring-demo.html` in a browser.

## Audiobookshelf, Navidrome, Prowlarr & Tracearr widgets

Open **Settings → Widgets** and enable the integration(s) you want. **Audiobookshelf** needs the server URL and an API token (*Settings → Users → your user → API Token*). **Navidrome** needs the URL and your username/password (Subsonic API). **Prowlarr** needs the URL and API key (*Settings → General → API Key*). **Tracearr** needs the URL and API key. Click **Test Connection**, then **Preview Widget**. All four are read-only. For a no-server, clickable demo of all four, open `widgets/media-library-demo.html` in a browser.

## PeaNUT, Umami, Speedtest Tracker & ntfy widgets

Open **Settings → Widgets** and enable the integration(s) you want. **PeaNUT** needs the server URL (username/password only if your PeaNUT requires auth). **Umami** needs the API URL, a website ID, and either an API key or a username/password, plus a time frame. **Speedtest Tracker** needs the URL and an API token (*Profile → API Tokens*). **ntfy** needs the server URL and a topic (token only for protected topics). Click **Test Connection**, then **Preview Widget**. All four are read-only. For a no-server, clickable demo of all four, open `widgets/extras-demo.html` in a browser.

## n8n widgets

Open **Settings → Integration Library** and enable **n8n**. It needs the instance URL (e.g. `http://192.168.1.10:5678`) and an API key (*Settings → n8n API → Create an API key*). Click **Test Connection**, then **Preview Widget** to see both widgets. Two are available: a **Quick View** (running / failed-today / succeeded-today execution counts) and an **Upcoming Schedule** list that reads each active workflow's Schedule Trigger and shows the next run time. Because n8n's API exposes no "next run" value, schedule times are computed locally from cron expressions and interval rules (interval-only triggers are anchored on the most recent execution). Read-only.

## Quick View widgets

Many integrations also offer a **Quick View** — a compact card showing an icon, a title, and four-or-five key numbers. Add one from **Settings → Integration Library** (the integration's widget list) or the dashboard's add-widget picker. Each Quick View has its own Configure panel: toggle whether clicking opens the service, show/hide the inner frame and background (off blends it into the dashboard), and enable an online/offline status badge. Available for Sonarr, Radarr, Seerr, Tautulli, Plex, SABnzbd, qBittorrent, Transmission, Uptime Kuma, Portainer, Prowlarr, Speedtest, Proxmox, and n8n.

## Acknowledgements

The Uptime Kuma, Sonarr, Radarr, Seerr, Pi-hole, AdGuard Home, Plex, Jellyfin, Emby, UniFi Controller, SABnzbd, qBittorrent, Transmission, PeaNUT, Umami, Speedtest Tracker, ntfy, Audiobookshelf, Navidrome, Prowlarr, Tracearr, Glances, Dashdot, Unraid, OpenMediaVault, TrueNAS, Proxmox VE, Beszel, iCal, Home Assistant, Nextcloud, and OPNsense widgets' data logic and visual layouts are adapted from the [Homarr](https://github.com/homarr-labs/homarr) project, which is licensed under the Apache License 2.0. The Proxmox Backup Server and n8n widgets are original work (neither is a Homarr integration), written against the documented PBS and n8n REST APIs. The Quick View widgets are original compact cards built on the same integration data helpers. See [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md) for the full attribution and license notice.

The integration brand icons (in `icons/integrations/`, shown in the Settings section titles and each widget's header) come from [homarr-labs/dashboard-icons](https://github.com/homarr-labs/dashboard-icons), mirroring the icon URLs Homarr uses. They are not committed — run `icons/integrations/fetch-icons.sh` once to download them locally (keeps the extension free of runtime external requests).

The Proxmox dashboards (System Health, System & Backup Logs, Storage, Virtual Machines & Containers, and System Overview) — their health checks, metrics, and layouts — are adapted from the [ProxMenux](https://github.com/MacRimi/ProxMenux) project by MacRimi.

## License

MIT

This project incorporates Apache-2.0 licensed code; see [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).
