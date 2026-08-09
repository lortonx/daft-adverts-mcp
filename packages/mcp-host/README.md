# @daft-ie/mcp-host

Single Bun process: Fastify + Streamable HTTP mounts for monorepo MCP servers.

## Endpoints

| Path | Server |
|------|--------|
| `GET /health` | liveness |
| `/mcp/daft` | [`@daft-ie/mcp`](../daft-mcp) |

Add more with `app.all("/mcp/<name>", …)` in [`src/index.ts`](src/index.ts).

## Run

```bash
bun install
bun packages/mcp-host/src/index.ts
```

Env:

- `MCP_HOST` — bind address (default `127.0.0.1`)
- `MCP_HOST_PORT` — port (default `3100`)
- plus Daft tokens from root `.env` (`DAFT_*`) as for `@daft-ie/mcp`

## Cursor

```json
{
  "mcpServers": {
    "daft": {
      "url": "http://127.0.0.1:3100/mcp/daft"
    }
  }
}
```

Keep the host process running (Terminal / service). Stdio entry for Daft alone remains: `bun packages/daft-mcp/src/index.ts`.
