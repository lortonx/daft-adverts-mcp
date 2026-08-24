#!/usr/bin/env bash
# mcp-host: Chrome+Xvfb enquiry (no Tailscale). Optional HTTP_PROXY still respected if set.
set -euo pipefail
exec bun packages/mcp-host/src/index.ts
