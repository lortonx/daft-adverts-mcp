# @daft-ie/mcp-host

Single Bun process: Fastify + Streamable HTTP mounts for monorepo MCP servers.

Prefer this host when several clients (Cursor, OpenCode, Hermes, …) should share one long-lived process. Each package still has its own stdio entry (`packages/daft-mcp`, `packages/adverts-mcp`) if you want one server per client subprocess.

## Endpoints

| Path | Package |
|------|---------|
| `GET /health` | liveness |
| `/mcp/daft` | [`@daft-ie/mcp`](../daft-mcp) |
| `/mcp/adverts` | [`@adverts-ie/mcp`](../adverts-mcp) |

Default listen: `http://127.0.0.1:3100`. Public: `https://example.com`.

One transport: Streamable HTTP (`createMcpHandler` + `toNodeHandler`). Cursor and OpenCode both speak it; they just use different config files (see below). `GET` without a session may return **405** — that is the protocol, not a dead host.

Add more with `app.all("/mcp/<name>", …)` in [`src/app.ts`](src/app.ts).

## Run

From the monorepo root:

```bash
bun install
bun packages/mcp-host/src/index.ts
# or: bun --filter @daft-ie/mcp-host start
```

Env (root `.env` / `.env.example`):

| Variable | Role |
|----------|------|
| `MCP_HOST` | bind address (default `127.0.0.1`) |
| `MCP_HOST_PORT` | port (default `3100`) |
| `DAFT_*` | Daft API / tokens — see [`../daft-mcp`](../daft-mcp) |
| `DAFT_AGENT_SESSIONS_FILE` | JSON DB of per-`agentId` refresh sessions |
| `ADVERTS_*` | Adverts API keys / tokens — see [`../adverts-mcp`](../adverts-mcp) |
| `HTTP_PROXY` | optional HTTP proxy for Bun API calls (search etc.) |
| `DAFT_ENQUIRY_MODE` | chrome only (ignored otherwise; phone TCP removed) |
| `DAFT_CHROME_*` / `CHROME_PATH` | Chrome pool: Xvfb, idle kill, cookies under `/data/daft-chrome` |

Keep the host running while clients are connected. Check:

```bash
curl http://127.0.0.1:3100/health
```

## Docker

Dockerfile: [`Dockerfile`](./Dockerfile) (build context = **monorepo root**).

```bash
# from repo root
docker build -f packages/mcp-host/Dockerfile -t daft-mcp-host .

docker run --rm -p 3100:3100 --env-file .env daft-mcp-host
```

Image sets `MCP_HOST=0.0.0.0` so the port is reachable from the host. Pass API keys / tokens via `--env-file .env` or `-e` (do not bake secrets into the image).

### Chrome web enquiry (default)

`DAFT_ENQUIRY_MODE=chrome` (image default): `send_enquiry` drives headed Chrome over CDP.

- **Xvfb** virtual display (no GPU) — pure `--headless=new` fails Cloudflare
- **On-demand** start; **idle kill** after `DAFT_CHROME_IDLE_MS` (default 90s)
- **Per-email BrowserContext** + cookie JSON under `DAFT_CHROME_DATA_DIR/cookies`
- Concurrent MCP users = concurrent tabs/contexts; same email serialized
- Password kept **in memory** after `auth_login` (for re-login after Chrome kill); cookies on disk
- **No Tailscale** — direct egress from the host/container
- **Disk policy:** wipe `profile/` after idle kill (`DAFT_CHROME_WIPE_PROFILE=1`); prune cookie JSON older than `DAFT_CHROME_COOKIE_MAX_AGE_MS` (default 30d); `auth_logout` deletes that email's cookie file

```bash
docker run --rm -p 3100:3100 --env-file .env \
  -v daft-chrome:/data/daft-chrome \
  daft-mcp-host
```

Enquiry is Chrome web form only (`sendEnquiryViaChrome`).

Optional: persist login tokens across restarts:

```bash
docker run --rm -p 3100:3100 --env-file .env \
  -v daft-mcp-tokens:/data \
  -e DAFT_TOKEN_FILE=/data/.daft-tokens.json \
  -e ADVERTS_TOKEN_FILE=/data/.adverts-tokens.json \
  daft-mcp-host
```

Health: `GET /health` — Docker `HEALTHCHECK` uses `curl` against `PORT` / `MCP_HOST_PORT` (default 3100).

Point Cursor / OpenCode / Hermes at `https://example.com/mcp/daft` (or local `http://127.0.0.1:3100/mcp/daft`) and the matching `/mcp/adverts` URL.

---

## Integration: Claude.ai / Claude Desktop (custom connector)

Claude’s hosted connectors speak **OAuth 2.1 + PKCE** and try **Dynamic Client Registration** (`POST /oauth/register`). Without that, Connect fails with:

> Couldn’t register with … sign-in service … add an OAuth Client ID … `ofid_…`

Enable OAuth on the **public** host (Coolify / `example.com`):

| Env | Value |
|-----|--------|
| `MCP_PUBLIC_URL` | `https://example.com` (exact HTTPS origin, no trailing slash) |
| `MCP_OAUTH` | `1` |
| `MCP_OAUTH_STORE` | `/data/oauth-store.json` (persist clients/tokens across deploys) |
| `MCP_OAUTH_CLIENT_ID` | `claude-mcp` (optional static id for Advanced settings) |
| `MCP_OAUTH_AUTO_APPROVE` | `1` (default) — skip consent HTML on personal hosts |
| `MCP_API_KEYS` | optional Bearer keys for Cursor/Hermes after OAuth is on |

Redeploy, then verify:

```bash
curl -s https://example.com/.well-known/oauth-authorization-server | jq .registration_endpoint
curl -s https://example.com/.well-known/oauth-protected-resource/mcp/daft | jq .resource
```

In Claude: **Settings → Connectors → Add custom connector**

- URL: `https://example.com/mcp/daft` (or `/mcp/adverts`)
- If DCR still fails: Advanced → OAuth Client ID = `claude-mcp` (and secret if you set `MCP_OAUTH_CLIENT_SECRET`)

Allowlist Anthropic egress `160.79.104.0/21` on Cloudflare/WAF if Connect never hits your logs.

After OAuth is enabled, unauthenticated `/mcp/*` returns **401** + `WWW-Authenticate`. Cursor / OpenCode / Hermes should send `Authorization: Bearer <MCP_API_KEYS value>` (or complete the same OAuth flow).

---

## Integration: Cursor / Cursor CLI

Cursor Desktop and Cursor CLI both read MCP config from:

- Project: `<repo>/.cursor/mcp.json`
- Global: `~/.cursor/mcp.json` (Windows: `%USERPROFILE%\.cursor\mcp.json`)

### A) HTTP via mcp-host (shared process)

Use the committed [`.cursor/mcp.json`](../../.cursor/mcp.json). Reload MCP after edits. Local host: same shape with `http://127.0.0.1:3100/mcp/daft`. If OAuth is on, send `Authorization: Bearer` from `MCP_API_KEYS`.

### B) Stdio (one Bun process per server)

Launch **`bun.exe` + `index.ts` directly**. Do **not** wrap with `cmd.exe` / `.cmd` — that can hang Cursor CLI after MCP approve.

```json
{
  "mcpServers": {
    "daft": {
      "type": "stdio",
      "command": "C:\\Users\\<you>\\.bun\\bin\\bun.exe",
      "args": ["F:/path/to/daft.ie/packages/daft-mcp/src/index.ts"]
    },
    "adverts": {
      "type": "stdio",
      "command": "C:\\Users\\<you>\\.bun\\bin\\bun.exe",
      "args": ["F:/path/to/daft.ie/packages/adverts-mcp/src/index.ts"]
    }
  }
}
```

Each package `boot.ts` loads the monorepo `.env` and clears `ELECTRON_RUN_AS_NODE`, so a wrong cwd is usually fine.

**Cursor CLI:** after editing config, reload MCP / restart the CLI. Approve servers if prompted (`agent mcp enable <name>` when a project shows “not connected”). Tools appear under MCP settings and in Agent chat — they are not slash-commands.

If the CLI hangs after approve: kill stuck `bun` MCP processes, ensure config uses `bun.exe` + `index.ts` (no `.cmd`), restart.

---

## Integration: OpenCode

Config file (global or project):

- `~/.config/opencode/opencode.json` or `opencode.jsonc`
- Project: `opencode.json` / `.opencode/opencode.json`

Docs: [opencode.ai/docs/mcp-servers](https://opencode.ai/docs/mcp-servers/).

### A) Remote (mcp-host)

Use committed [`opencode.json`](../../opencode.json) (`type: "remote"`, `oauth: false`, `timeout: 60000`). Not Cursor’s `mcpServers` shape.

Local: same keys with `http://127.0.0.1:3100/mcp/daft`. If the host has OAuth on, add `"headers": { "Authorization": "Bearer YOUR_MCP_API_KEY" }`.

### B) Local stdio

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "daft": {
      "type": "local",
      "command": [
        "C:\\Users\\<you>\\.bun\\bin\\bun.exe",
        "F:/path/to/daft.ie/packages/daft-mcp/src/index.ts"
      ],
      "enabled": true
    },
    "adverts": {
      "type": "local",
      "command": [
        "C:\\Users\\<you>\\.bun\\bin\\bun.exe",
        "F:/path/to/daft.ie/packages/adverts-mcp/src/index.ts"
      ],
      "enabled": true
    }
  }
}
```

OpenCode uses `command` as a **single array** (executable + args). Reload the OpenCode session after edits.

---

## Integration: Hermes Agent

Hermes reads MCP from `~/.hermes/config.yaml` under `mcp_servers` (stdio **or** HTTP — not both on one entry).

Docs: [Hermes MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp).

### A) HTTP via mcp-host

```yaml
mcp_servers:
  daft:
    url: "http://127.0.0.1:3100/mcp/daft"
    enabled: true
  adverts:
    url: "http://127.0.0.1:3100/mcp/adverts"
    enabled: true
```

### B) Stdio

```yaml
mcp_servers:
  daft:
    command: "C:\\Users\\<you>\\.bun\\bin\\bun.exe"
    args:
      - "F:/path/to/daft.ie/packages/daft-mcp/src/index.ts"
    enabled: true
  adverts:
    command: "C:\\Users\\<you>\\.bun\\bin\\bun.exe"
    args:
      - "F:/path/to/daft.ie/packages/adverts-mcp/src/index.ts"
    enabled: true
```

After changing config, run `/reload-mcp` in the session (or restart Hermes). Optional: `hermes mcp test daft` / `hermes mcp test adverts` to verify connectivity.

Put secrets in `~/.hermes/.env` or the monorepo `.env` (stdio inherits process env; HTTP host loads monorepo `.env` itself).

---

## Which mode to pick

| Mode | Pros |
|------|------|
| **mcp-host HTTP** | One process, both mounts, shared by Cursor + OpenCode + Hermes |
| **Stdio per client** | No host to keep alive; each client owns its subprocess |

For day-to-day multi-client use, run the host and point everyone at `/mcp/daft` and `/mcp/adverts`.

## License

MIT
