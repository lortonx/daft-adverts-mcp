# @daft-ie/mcp-host

Single Bun process: Fastify + Streamable HTTP mounts for monorepo MCP servers.

Prefer this host when several clients (Cursor, OpenCode, Hermes, …) should share one long-lived process. Each package still has its own stdio entry (`packages/daft-mcp`, `packages/adverts-mcp`) if you want one server per client subprocess.

## Endpoints

| Path | Package |
|------|---------|
| `GET /health` | liveness |
| `/mcp/daft` | [`@daft-ie/mcp`](../daft-mcp) |
| `/mcp/adverts` | [`@adverts-ie/mcp`](../adverts-mcp) |

Default listen: `http://127.0.0.1:3100`.

Add more with `app.all("/mcp/<name>", …)` in [`src/index.ts`](src/index.ts).

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
| `ADVERTS_*` | Adverts API keys / tokens — see [`../adverts-mcp`](../adverts-mcp) |

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

Optional: persist login tokens across restarts:

```bash
docker run --rm -p 3100:3100 --env-file .env \
  -v daft-mcp-tokens:/data \
  -e DAFT_TOKEN_FILE=/data/.daft-tokens.json \
  -e ADVERTS_TOKEN_FILE=/data/.adverts-tokens.json \
  daft-mcp-host
```

Health: `GET http://127.0.0.1:3100/health` (also used by Docker `HEALTHCHECK`).

Point Cursor / OpenCode / Hermes at `http://127.0.0.1:3100/mcp/daft` and `…/mcp/adverts` as usual.

---

## Integration: Cursor / Cursor CLI

Cursor Desktop and Cursor CLI both read MCP config from:

- Project: `<repo>/.cursor/mcp.json`
- Global: `~/.cursor/mcp.json` (Windows: `%USERPROFILE%\.cursor\mcp.json`)

### A) HTTP via mcp-host (shared process)

Start the host first, then:

```json
{
  "mcpServers": {
    "daft": {
      "url": "http://127.0.0.1:3100/mcp/daft"
    },
    "adverts": {
      "url": "http://127.0.0.1:3100/mcp/adverts"
    }
  }
}
```

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

Host must be running.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "daft": {
      "type": "remote",
      "url": "http://127.0.0.1:3100/mcp/daft",
      "enabled": true,
      "oauth": false
    },
    "adverts": {
      "type": "remote",
      "url": "http://127.0.0.1:3100/mcp/adverts",
      "enabled": true,
      "oauth": false
    }
  }
}
```

`oauth: false` avoids OpenCode trying an OAuth flow on a local unauthenticated mount.

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
