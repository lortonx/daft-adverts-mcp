#!/bin/bash
# Keep host Chrome CDP up + proxy to Docker bridge + periodic CF warm.
export DISPLAY=:0
CF_WARM_EVERY_SEC="${CF_WARM_EVERY_SEC:-300}"
last_warm=0

cf_warm() {
  local cid
  cid=$(docker ps -q --filter 'label=coolify.managed=true' --filter 'name=g5cawh457ytasyrdywewbd9w' | head -1)
  [ -z "$cid" ] && cid=$(docker ps -q --filter 'publish=3100' | head -1)
  [ -z "$cid" ] && return 0
  docker exec -e CDP=http://10.0.1.1:9222 -e DAFT_CHROME_DATA_DIR=/data/daft-chrome \
    -w /app/packages/daft-api "$cid" \
    bun scripts/cf-warm-cli.ts >>/tmp/daft-cf-warm.log 2>&1 || true
}

while true; do
  XA=$(tr '\0' '\n' < /proc/$(pgrep -u "$USER" plasmashell | head -1)/environ 2>/dev/null | sed -n 's/^XAUTHORITY=//p' | head -1)
  [ -n "$XA" ] && export XAUTHORITY="$XA"
  mkdir -p /home/admin/.daft-chrome-host
  if ! curl -sf -m 2 http://127.0.0.1:9222/json/version >/dev/null; then
    pkill -f 'remote-debugging-port=9222' 2>/dev/null || true
    sleep 1
    nohup google-chrome \
      --remote-debugging-port=9222 \
      --remote-allow-origins=* \
      --user-data-dir=/home/admin/.daft-chrome-host \
      --no-first-run \
      --no-default-browser-check \
      --disable-background-networking \
      --window-size=1280,900 \
      about:blank >>/tmp/daft-chrome-host.log 2>&1 &
    for i in $(seq 1 30); do
      curl -sf -m 1 http://127.0.0.1:9222/json/version >/dev/null && break
      sleep 0.5
    done
  fi
  if ! ss -ltn | grep -q '10.0.1.1:9222'; then
    pkill -f 'socat TCP-LISTEN:9222,bind=10.0.1.1' 2>/dev/null || true
    nohup socat TCP-LISTEN:9222,bind=10.0.1.1,fork,reuseaddr TCP:127.0.0.1:9222 >>/tmp/socat-9222.log 2>&1 &
  fi
  now=$(date +%s)
  if [ $((now - last_warm)) -ge "$CF_WARM_EVERY_SEC" ]; then
    cf_warm
    last_warm=$now
  fi
  sleep 20
done
