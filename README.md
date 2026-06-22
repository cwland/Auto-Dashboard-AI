# Auto Dashboard AI

A Chrome extension that auto-generates beautiful new-tab dashboards from your bookmarks, enriched with AI-powered descriptions and icons via [OpenRouter](https://openrouter.ai).

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

- **AI-enriched bookmarks** — descriptions, clean names, and icons fetched or inferred for every bookmark
- **Folder-organized layout** — your existing bookmark folder structure becomes dashboard sections
- **Icon shapes** — choose Square, Rounded, Circle, or Squircle for icons, set as a dashboard default and overridable per-bookmark
- **Show/hide labels** — toggle the text shown below icons on or off for a cleaner, icon-only look
- **Multiple dashboards** — create and switch between different dashboard versions; set one as default
- **New Tab override** — your default dashboard appears every time you open a new tab
- **Smart icon resolution** — tries each site's real favicon first, falls back to the AI's best-guess brand icon, then a neutral generic icon if nothing matches (with an editable custom emoji option per bookmark)
- **Live search** — press `/` or type to filter bookmarks across all sections
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

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select this folder
5. The Settings page opens automatically on first launch

## Getting Started

AI is **optional**. You can build and use a full dashboard without an API key — turn AI on later if you want it to do the busywork for you.

### 1. Create your first dashboard

1. Click the extension icon → **Create / Update Dashboard**.
2. Choose how to start:
   - **From bookmarks** — select bookmarks and/or folders from the tree on the left. Your folder structure becomes the dashboard's sections.
   - **Blank dashboard** — start empty and add items yourself later (in Edit mode).
3. Give the dashboard a name, pick a default icon shape, and choose whether labels show below icons.
4. Create it:
   - With AI off, the dashboard is created right away using each site's favicon.
   - With AI on, click **✨ Generate Dashboard** and the AI adds clean names, descriptions, and best-guess icons (see step 2 below).
5. The new dashboard opens automatically. Open **Settings → Dashboards** to set one as **Default** so it appears on every new tab.

Once a dashboard exists you can refine it in **Edit mode** (the ✎ button, top-right): drag to rearrange, resize sections, add bookmarks or widgets, and open **Dashboard Options** (⚙) and the **Theme** picker (🎨).

### 2. (Optional) Turn on AI

AI enriches a dashboard with clean names, descriptions, and inferred icons, and can generate color themes for you. To enable it:

1. Get a free or paid API key from [openrouter.ai/keys](https://openrouter.ai/keys) (OpenRouter gives you one key for many providers; you can also use OpenAI, Anthropic, Google, and others directly).
2. Open **Settings → AI**, paste the key, and click **Validate**, then **Save Settings**.
3. Pick a model (the dropdown is pre-populated with good defaults):

| Model | Speed | Cost | Notes |
|---|---|---|---|
| Gemini Flash 1.5 | ⚡ Fast | $ | Recommended default |
| GPT-4o Mini | Fast | $ | Good balance |
| Claude 3 Haiku | Fast | $ | High quality |
| Llama 3.1 8B | Fast | Free | Free tier |
| Mistral 7B | Fast | Free | Free tier |

With AI configured you can use **✨ Generate Dashboard** when creating a dashboard, and **Generate with AI** / **Surprise me** in the Theme picker. Without a key those AI actions stay disabled, and everything else continues to work normally.

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
| `host_permissions` | Reach the OpenWeatherMap API (weather widget) and your self-hosted servers (Tautulli, Uptime Kuma, Sonarr, Radarr, Overseerr/Jellyseerr, Pi-hole, AdGuard Home, Plex, UniFi, SABnzbd, qBittorrent, Transmission, PeaNUT, Umami, Speedtest Tracker, ntfy, Audiobookshelf, Navidrome, Prowlarr, Tracearr, Glances, dash., Unraid, OpenMediaVault, TrueNAS, Proxmox, PBS, Beszel, Home Assistant, Nextcloud, OPNsense, and any iCal feed). These can run on any local IP/port, so broad `http(s)://*/*` access is requested; requests are only ever made to the OpenWeatherMap endpoint and the server URLs you configure |

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

## Acknowledgements

The Uptime Kuma, Sonarr, Radarr, Seerr, Pi-hole, AdGuard Home, Plex, Jellyfin, Emby, UniFi Controller, SABnzbd, qBittorrent, Transmission, PeaNUT, Umami, Speedtest Tracker, ntfy, Audiobookshelf, Navidrome, Prowlarr, Tracearr, Glances, Dashdot, Unraid, OpenMediaVault, TrueNAS, Proxmox VE, Beszel, iCal, Home Assistant, Nextcloud, and OPNsense widgets' data logic and visual layouts are adapted from the [Homarr](https://github.com/homarr-labs/homarr) project, which is licensed under the Apache License 2.0. The Proxmox Backup Server widget is original work (PBS is not a Homarr integration), written against the documented PBS REST API. See [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md) for the full attribution and license notice.

The integration brand icons (in `icons/integrations/`, shown in the Settings section titles and each widget's header) come from [homarr-labs/dashboard-icons](https://github.com/homarr-labs/dashboard-icons), mirroring the icon URLs Homarr uses. They are not committed — run `icons/integrations/fetch-icons.sh` once to download them locally (keeps the extension free of runtime external requests).

The Proxmox dashboards (System Health, System & Backup Logs, Storage, Virtual Machines & Containers, and System Overview) — their health checks, metrics, and layouts — are adapted from the [ProxMenux](https://github.com/MacRimi/ProxMenux) project by MacRimi.

## License

MIT

This project incorporates Apache-2.0 licensed code; see [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).
