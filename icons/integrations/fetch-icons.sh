#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Auto Dashboard AI — integration icon fetcher
# ---------------------------------------------------------------------------
# Downloads the official brand icon for every integration into this folder.
# Each path below mirrors exactly what the Homarr project references in
# packages/definitions/src/integration.ts (homarr-labs/dashboard-icons),
# so the icons match Homarr's own integration list. Each file is saved under
# its own basename (e.g. svg/plex.svg -> plex.svg).
#
# Run once after cloning, or whenever you add a new integration:
#     cd icons/integrations
#     chmod +x fetch-icons.sh      # first time only
#     ./fetch-icons.sh             # or: bash fetch-icons.sh
#
# Re-running is safe (idempotent). Requires `curl`.
# ---------------------------------------------------------------------------
set -u
cd "$(dirname "$0")"

BASE="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master"

# Paths relative to BASE. The non-Homarr integrations (tautulli,
# proxmox-backup-server) use the matching dashboard-icons slug.
PATHS="
svg/tautulli.svg
svg/uptime-kuma.svg
svg/sonarr.svg
svg/radarr.svg
svg/seerr.svg
svg/pi-hole.svg
svg/adguard-home.svg
svg/plex.svg
svg/jellyfin.svg
svg/emby.svg
png/unifi.png
svg/sabnzbd.svg
svg/qbittorrent.svg
svg/transmission.svg
svg/peanut.svg
svg/umami.svg
png/speedtest-tracker.png
svg/ntfy.svg
svg/audiobookshelf.svg
svg/navidrome.svg
svg/prowlarr.svg
svg/tracearr.svg
svg/glances.svg
png/dashdot.png
svg/unraid.svg
svg/openmediavault.svg
svg/truenas.svg
svg/proxmox.svg
svg/proxmox-backup-server.svg
svg/beszel.svg
svg/ical.svg
svg/home-assistant.svg
svg/opnsense.svg
svg/nextcloud.svg
svg/portainer.svg
svg/docker.svg
svg/grafana.svg
svg/prometheus.svg
svg/immich.svg
"

ok=0; fail=0; failed=""
for path in $PATHS; do
  out="${path##*/}"            # basename, e.g. svg/plex.svg -> plex.svg
  if curl -fsSL "$BASE/$path" -o "$out" && [ -s "$out" ]; then
    printf '  ok    %s\n' "$out"
    ok=$((ok + 1))
  else
    rm -f "$out"
    printf '  FAIL  %s\n' "$path"
    fail=$((fail + 1))
    failed="$failed $out"
  fi
done

echo "----------------------------------------"
echo "downloaded: $ok   failed: $fail"
if [ "$fail" -ne 0 ]; then
  echo "Failed:$failed"
  echo "Check your network connection and re-run. (A missing file just means"
  echo "that icon stays hidden in the UI — nothing else breaks.)"
  exit 1
fi
echo "All icons downloaded. Reload the extension to see them."
