#!/bin/bash
# Run on kubuntu HOST (real DISPLAY) — click Turnstile when Chrome is on CF challenge.
set -euo pipefail
export DISPLAY="${DISPLAY:-:0}"
XA=$(tr '\0' '\n' < /proc/$(pgrep -u "$USER" plasmashell 2>/dev/null | head -1)/environ 2>/dev/null | sed -n 's/^XAUTHORITY=//p' | head -1)
[ -n "$XA" ] && export XAUTHORITY="$XA"

if ! command -v xdotool >/dev/null 2>&1; then
  echo "[cf-warm-host] xdotool missing — install with: sudo apt install xdotool"
  exit 1
fi

# Titles are often "Search Ireland's No. 1 Property Website | Daft.ie" (or HTML-entity).
# Pass when a daft page exists and is NOT a CF interstitial.
cf_passed() {
  local list
  list=$(curl -sf -m 3 http://127.0.0.1:9222/json/list 2>/dev/null) || return 1
  echo "$list" | grep -qiE 'daft\.ie' || return 1
  echo "$list" | grep -qiE 'Just a moment|Security Check|checking the security' && return 1
  return 0
}

for attempt in $(seq 1 20); do
  if cf_passed; then
    echo "[cf-warm-host] CF cleared"
    exit 0
  fi
  WID=$(xdotool search --name "Security Check" 2>/dev/null | head -1 || true)
  [ -z "$WID" ] && WID=$(xdotool search --name "Just a moment" 2>/dev/null | head -1 || true)
  [ -z "$WID" ] && WID=$(xdotool search --class "google-chrome" 2>/dev/null | head -1 || true)
  if [ -n "$WID" ]; then
    xdotool windowactivate --sync "$WID" 2>/dev/null || true
    xdotool mousemove --window "$WID" 380 420 2>/dev/null || true
    xdotool click 1 2>/dev/null || true
    sleep 0.4
    xdotool mousemove --window "$WID" 400 440 2>/dev/null || true
    xdotool click 1 2>/dev/null || true
  fi
  sleep 3
done

echo "[cf-warm-host] CF still blocked after clicks"
exit 1
