# Third-Party Licenses

This project incorporates code adapted from other open-source projects. Their
copyright notices and license terms are reproduced below as required.

---

## Homarr

Several widgets in this project are JavaScript adaptations of integrations and
widgets from the Homarr project:

**Uptime Kuma** (`widgets/uptime-kuma-widget.js`) — the status-page/heartbeat
fetching logic, the heartbeat-status → category mapping, and the dashboard data
aggregation (monitor counts and 24-hour average uptime) are derived from
Homarr's source. The widget's visual layout (uptime hero, progress ring, and
stat tiles) follows Homarr's Uptime Kuma widget as a reference template.

**Sonarr & Radarr** (`widgets/arr-calendar-widget.js`) — the `/api/v3/calendar`
fetching, the event mapping (Sonarr episode → SxxExx event; Radarr movie → one
event per release type), the image-quality priority selection, and the IMDb/app
links are derived from Homarr's Sonarr and Radarr integrations. The month-grid
view follows Homarr's calendar widget as a reference template.

**Seerr / Overseerr / Jellyseerr** (`widgets/seerr-widget.js`) — the request,
stats, and user fetching, the request-status and media-availability mapping
(including the in-progress download rule), the per-item TMDB info lookup, and
the poster/avatar URL building are derived from Homarr's Overseerr/Seerr
integration. The request-list and stats views follow Homarr's media-requests
widgets as a reference template.

**Pi-hole & AdGuard Home** (`widgets/dns-hole-widget.js`) — the Pi-hole v5
(query-auth) and v6 (session-auth) fetching with version auto-detection, the
AdGuard Home Basic-auth `/control` fetching, and the DNS-hole summary
computation (ads blocked, block rate, queries, blocklist size, enabled/disabled
status) are derived from Homarr's Pi-hole and AdGuard Home integrations. The
four-stat layout follows Homarr's DNS-hole summary widget as a reference
template.

**Plex** (`widgets/plex-widget.js`) — the `/status/sessions` fetching, the
session XML parsing, and the currently-playing type mapping are derived from
Homarr's Plex integration (media-server interface). The now-playing list
follows Homarr's media-server widget as a reference template.

**UniFi Controller** (`widgets/unifi-widget.js`) — the site-health →
NetworkControllerSummary mapping (per-subsystem status via "every site ok", and
numeric aggregation by sum/max across sites) is derived from Homarr's UniFi
Controller integration. The network-summary layout follows Homarr's
network-controller widget as a reference template. (Homarr uses the node-unifi
library server-side; here login is performed directly with fetch.)

**SABnzbd, qBittorrent & Transmission** (`widgets/download-client-widget.js`) —
the normalized download item/status shape and the per-client mapping (SABnzbd
queue/history states and timeleft parsing; qBittorrent and Transmission torrent
state mapping; rates/paused aggregation and ETA handling) are derived from
Homarr's download-client integrations and downloads interface. The download-list
layout follows Homarr's downloads widget as a reference template. (Homarr drives
qBittorrent/Transmission via the @ctrl/* libraries server-side; here the
requests are made directly with fetch.)

**PeaNUT** (`widgets/peanut-widget.js`) — the `/api/v1/devices` fetching, NUT
`ups.status` flag parsing, and the device → UPS summary mapping are derived from
Homarr's PeaNUT integration (ups-summary interface).

**Umami** (`widgets/umami-widget.js`) — the API-key / JWT auth, the time-range
presets, and the stats → bounce-rate / average-duration computation are derived
from Homarr's Umami integration.

**Speedtest Tracker** (`widgets/speedtest-widget.js`) — the
`/api/v1/results/latest` + `/api/v1/stats` fetching and the result/stats mapping
(bits → Mbps) are derived from Homarr's Speedtest Tracker integration.

**ntfy** (`widgets/ntfy-widget.js`) — the `/{topic}/json?poll=1` fetching, the
newline-delimited JSON parsing, and the message → notification mapping are
derived from Homarr's ntfy integration.

**Audiobookshelf** (`widgets/audiobookshelf-widget.js`) — the libraries /
library-stats / listening-stats / online-users fetching and the dashboard
aggregation are derived from Homarr's Audiobookshelf integration.

**Navidrome** (`widgets/navidrome-widget.js`) — the Subsonic auth params, the
artist / album / song counting (paged getAlbumList2), and the now-playing
mapping are derived from Homarr's Navidrome integration.

**Prowlarr** (`widgets/prowlarr-widget.js`) — the `/api/v1/indexer` +
`/api/v1/indexerstatus` fetching and the indexer health mapping (enabled vs.
errored) are derived from Homarr's Prowlarr integration (indexer-manager
interface).

**Tracearr** (`widgets/tracearr-widget.js`) — the `/api/v1/public/*` fetching
(stats / streams / violations / history) and the dashboard mapping are derived
from Homarr's Tracearr integration.

**Glances, Dashdot, Unraid, OpenMediaVault & TrueNAS**
(`widgets/system-health-widget.js`) — the per-service fetching and the mapping
into the normalized system-health shape (CPU / memory / uptime / filesystems /
SMART / GPU / load / reboot / updates) are derived from Homarr's Glances,
Dashdot, Unraid, OpenMediaVault, and TrueNAS integrations (health-monitoring
interface). Homarr drives TrueNAS via a server-side WebSocket and Dashdot's
load-average via a Redis history channel; here the requests are made directly
from the browser.

**Proxmox VE** (`widgets/proxmox-widget.js`) — the cluster/resources mapping
(nodes / qemu / lxc / storage) is derived from Homarr's Proxmox integration.
Homarr uses the proxmox-api library server-side; here the
`/api2/json/cluster/resources` endpoint is called directly with an API token.

**Beszel** (`widgets/beszel-widget.js`) — the PocketBase auth, the
systems-records fetching, and the system-info field mapping are derived from
Homarr's Beszel integration.

**iCal** (`widgets/ical-widget.js`) — the idea of mapping iCal VEVENTs to
calendar events is adapted from Homarr's iCal integration (which uses the
ical.js library). The dependency-free ICS parser and RRULE expansion here are
original work (Homarr relies on ical.js).

**Home Assistant** (`widgets/homeassistant-widget.js`) — the `/api/states`
fetching, the `homeassistant.toggle` service call, and the Bearer-token auth are
derived from Homarr's Home Assistant integration.

**Nextcloud** (`widgets/nextcloud-widget.js`) — the OCS notifications fetching
(Basic auth + the `OCS-APIRequest` header) and the notification mapping are
derived from Homarr's Nextcloud integration. (Nextcloud's CalDAV calendar is not
ported; Nextcloud calendars are read via the iCal widget using a calendar's
exported `.ics` link.)

**OPNsense** (`widgets/opnsense-widget.js`) — the diagnostics endpoints
(system_information / system_resources / traffic/interface / cpu_usage stream),
the Basic key:secret auth, and the firewall-summary mapping (version, CPU,
memory, interface traffic) are derived from Homarr's OPNsense integration.

**Proxmox Backup Server** (`widgets/pbs-widget.js`) is NOT derived from Homarr —
PBS is not a Homarr integration. It is original work written against the
documented PBS REST API (https://pbs.proxmox.com/docs/api-viewer/), following
the same conventions as the Proxmox VE widget for consistency. PBS uses
API-token auth with a ":" separator between the token id and secret.

- Project: Homarr (homarr-labs/homarr)
- Source: https://github.com/homarr-labs/homarr
- License: Apache License 2.0
- Files referenced:
  - `packages/integrations/src/uptime-kuma/uptime-kuma-integration.ts`
  - `packages/integrations/src/uptime-kuma/uptime-kuma-types.ts`
  - `packages/widgets/src/uptime-kuma/component.tsx`
  - `packages/widgets/src/uptime-kuma/component.module.css`
  - `packages/integrations/src/media-organizer/sonarr/sonarr-integration.ts`
  - `packages/integrations/src/media-organizer/radarr/radarr-integration.ts`
  - `packages/integrations/src/media-organizer/media-organizer.ts`
  - `packages/integrations/src/interfaces/calendar/calendar-types.ts`
  - `packages/widgets/src/calendar/component.tsx`
  - `packages/integrations/src/overseerr/overseerr-integration.ts`
  - `packages/integrations/src/seerr/seerr-integration.ts`
  - `packages/integrations/src/interfaces/media-requests/media-request-types.ts`
  - `packages/widgets/src/media-requests/list/component.tsx`
  - `packages/widgets/src/media-requests/stats/component.tsx`
  - `packages/integrations/src/adguard-home/adguard-home-integration.ts`
  - `packages/integrations/src/adguard-home/adguard-home-types.ts`
  - `packages/integrations/src/pi-hole/pi-hole-integration-factory.ts`
  - `packages/integrations/src/pi-hole/v5/pi-hole-integration-v5.ts`
  - `packages/integrations/src/pi-hole/v6/pi-hole-integration-v6.ts`
  - `packages/integrations/src/interfaces/dns-hole-summary/dns-hole-summary-types.ts`
  - `packages/widgets/src/dns-hole/summary/component.tsx`
  - `packages/integrations/src/plex/plex-integration.ts`
  - `packages/integrations/src/plex/interface.ts`
  - `packages/integrations/src/interfaces/media-server/media-server-types.ts`
  - `packages/integrations/src/unifi-controller/unifi-controller-integration.ts`
  - `packages/integrations/src/interfaces/network-controller-summary/network-controller-summary-types.ts`
  - `packages/integrations/src/download-client/sabnzbd/sabnzbd-integration.ts`
  - `packages/integrations/src/download-client/sabnzbd/sabnzbd-schema.ts`
  - `packages/integrations/src/download-client/qbittorrent/qbittorrent-integration.ts`
  - `packages/integrations/src/download-client/transmission/transmission-integration.ts`
  - `packages/integrations/src/interfaces/downloads/download-client-items.ts`
  - `packages/integrations/src/interfaces/downloads/download-client-status.ts`
  - `packages/integrations/src/peanut/peanut-integration.ts`
  - `packages/integrations/src/peanut/peanut-types.ts`
  - `packages/integrations/src/interfaces/ups-summary/ups-summary-types.ts`
  - `packages/integrations/src/umami/umami-integration.ts`
  - `packages/integrations/src/umami/umami-types.ts`
  - `packages/integrations/src/speedtest-tracker/speedtest-tracker-integration.ts`
  - `packages/integrations/src/speedtest-tracker/speedtest-tracker-types.ts`
  - `packages/integrations/src/ntfy/ntfy-integration.ts`
  - `packages/integrations/src/ntfy/ntfy-schema.ts`
  - `packages/integrations/src/audiobookshelf/audiobookshelf-integration.ts`
  - `packages/integrations/src/audiobookshelf/audiobookshelf-types.ts`
  - `packages/integrations/src/navidrome/navidrome-integration.ts`
  - `packages/integrations/src/navidrome/navidrome-types.ts`
  - `packages/integrations/src/prowlarr/prowlarr-integration.ts`
  - `packages/integrations/src/prowlarr/prowlarr-types.ts`
  - `packages/integrations/src/interfaces/indexer-manager/indexer-manager-types.ts`
  - `packages/integrations/src/tracearr/tracearr-integration.ts`
  - `packages/integrations/src/tracearr/tracearr-types.ts`
  - `packages/integrations/src/interfaces/health-monitoring/health-monitoring-types.ts`
  - `packages/integrations/src/glances/glances-integration.ts`
  - `packages/integrations/src/dashdot/dashdot-integration.ts`
  - `packages/integrations/src/unraid/unraid-integration.ts`
  - `packages/integrations/src/openmediavault/openmediavault-integration.ts`
  - `packages/integrations/src/truenas/truenas-integration.ts`
  - `packages/integrations/src/proxmox/proxmox-integration.ts`
  - `packages/integrations/src/beszel/beszel-integration.ts`
  - `packages/integrations/src/beszel/beszel-types.ts`
  - `packages/integrations/src/ical/ical-integration.ts`
  - `packages/integrations/src/homeassistant/homeassistant-integration.ts`
  - `packages/integrations/src/nextcloud/nextcloud.integration.ts`
  - `packages/integrations/src/interfaces/calendar/calendar-types.ts`
  - `packages/integrations/src/interfaces/notifications/notification-types.ts`
  - `packages/integrations/src/opnsense/opnsense-integration.ts`
  - `packages/integrations/src/opnsense/opnsense-types.ts`
  - `packages/integrations/src/interfaces/firewall-summary/firewall-summary-types.ts`

```
Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

The full text of the Apache License 2.0 is available at
https://www.apache.org/licenses/LICENSE-2.0. Portions of the files listed above
have been modified from their original form (rewritten from TypeScript/React to
framework-free JavaScript for use in a browser extension).
