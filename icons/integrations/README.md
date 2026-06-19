# Integration icons

Official brand icons for each integration, used in the **Settings → Widgets**
section titles and in every widget's own header.

The image files are **not** committed — run the fetch script once to download
them locally (so the extension makes no external requests at runtime, in line
with `PRIVACY.md`):

```bash
cd icons/integrations
chmod +x fetch-icons.sh   # first time only
./fetch-icons.sh          # or: bash fetch-icons.sh
```

Every icon URL mirrors exactly what [Homarr](https://github.com/homarr-labs/homarr)
references in `packages/definitions/src/integration.ts`, pulled from
[homarr-labs/dashboard-icons](https://github.com/homarr-labs/dashboard-icons).
The two integrations that are not Homarr integrations (Tautulli, Proxmox Backup
Server) use the matching `dashboard-icons` slug.

The UI degrades gracefully: any icon that hasn't been downloaded yet simply
isn't shown (no broken-image placeholder), so the extension works before and
after running the script.

| File | Integration |
|---|---|
| `tautulli.svg` | Tautulli |
| `uptime-kuma.svg` | Uptime Kuma |
| `sonarr.svg` | Sonarr |
| `radarr.svg` | Radarr |
| `seerr.svg` | Seerr / Overseerr / Jellyseerr |
| `pi-hole.svg` | Pi-hole |
| `adguard-home.svg` | AdGuard Home |
| `plex.svg` | Plex |
| `jellyfin.svg` | Jellyfin |
| `emby.svg` | Emby |
| `unifi.png` | UniFi Controller |
| `sabnzbd.svg` | SABnzbd |
| `qbittorrent.svg` | qBittorrent |
| `transmission.svg` | Transmission |
| `peanut.svg` | PeaNUT |
| `umami.svg` | Umami |
| `speedtest-tracker.png` | Speedtest Tracker |
| `ntfy.svg` | ntfy |
| `audiobookshelf.svg` | Audiobookshelf |
| `navidrome.svg` | Navidrome |
| `prowlarr.svg` | Prowlarr |
| `tracearr.svg` | Tracearr |
| `glances.svg` | Glances |
| `dashdot.png` | Dash. (dashdot) |
| `unraid.svg` | Unraid |
| `openmediavault.svg` | OpenMediaVault |
| `truenas.svg` | TrueNAS |
| `proxmox.svg` | Proxmox VE |
| `proxmox-backup-server.svg` | Proxmox Backup Server |
| `beszel.svg` | Beszel |
| `ical.svg` | iCal |
| `home-assistant.svg` | Home Assistant |
| `opnsense.svg` | OPNsense |
| `nextcloud.svg` | Nextcloud |
