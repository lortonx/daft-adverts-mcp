#!/usr/bin/env bash
# Tailscale userspace:
#   HTTP  → 127.0.0.1:1055 (HTTP_PROXY) → exit-node Pi
#   raw TCP (captcha mint to phone) → 127.0.0.1:1056 SOCKS5 (DAFT_RECAPTCHA_SOCKS)
# Only env required: TS_AUTHKEY
# Pi once: sudo tailscale set --advertise-exit-node (+ approve in admin)
set -euo pipefail

if [[ -z "${TS_AUTHKEY:-}" ]]; then
  echo "tailscale: TS_AUTHKEY unset — starting without Tailscale" >&2
  exec bun packages/mcp-host/src/index.ts
fi

mkdir -p /var/run/tailscale /var/lib/tailscale

TS_HTTP="127.0.0.1:1055"
TS_SOCKS="127.0.0.1:1056"
EXIT_NODE="100.86.200.43"

tailscaled \
  --state=/var/lib/tailscale/tailscaled.state \
  --socket=/var/run/tailscale/tailscaled.sock \
  --tun=userspace-networking \
  --outbound-http-proxy-listen="${TS_HTTP}" \
  --socks5-server="${TS_SOCKS}" \
  &

for _ in $(seq 1 50); do
  [[ -S /var/run/tailscale/tailscaled.sock ]] && break
  sleep 0.1
done

tailscale --socket=/var/run/tailscale/tailscaled.sock up \
  --auth-key="${TS_AUTHKEY}" \
  --exit-node="${EXIT_NODE}" \
  --exit-node-allow-lan-access=true \
  --accept-dns=true

for _ in $(seq 1 60); do
  if tailscale --socket=/var/run/tailscale/tailscaled.sock status >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if [[ -n "${HTTP_PROXY:-}" && "${HTTP_PROXY}" != "http://${TS_HTTP}" ]]; then
  echo "tailscale: HTTP_PROXY was '${HTTP_PROXY}' — overwritten to http://${TS_HTTP} because TS_AUTHKEY is set" >&2
fi
export HTTP_PROXY="http://${TS_HTTP}"
# Captcha mint is raw TCP to the phone — must use SOCKS, not HTTP_PROXY.
export DAFT_RECAPTCHA_SOCKS="socks5://${TS_SOCKS}"
echo "tailscale: up; exit-node=${EXIT_NODE}; HTTP_PROXY=${HTTP_PROXY}; DAFT_RECAPTCHA_SOCKS=${DAFT_RECAPTCHA_SOCKS}" >&2

exec bun packages/mcp-host/src/index.ts
