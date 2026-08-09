# @daft-ie/mcp

MCP server for [Daft.ie](https://www.daft.ie) — exposes search and property tools via [`@daft-ie/api`](../daft-api).

Built with the official [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/) (`@modelcontextprotocol/server`).

## Tools

| Tool | Description |
|------|-------------|
| `auth_login` | Optional Keycloak password login (session tokens) |
| `auth_status` | Logged-in? (no raw tokens) |
| `auth_logout` | Clear / revoke session |
| `search_for_sale` | Residential for sale |
| `search_for_rent` | Residential to rent |
| `search_sharing` | Rooms / sharing |
| `get_property` | Listing details by id |
| `autocomplete` | Area autocomplete |
| `resolve_area` | County/area → shape ids |

Search / details work **without** login. Use `auth_login` only for authenticated actions (enquiries, etc.). Google/Apple SSO accounts need a Keycloak password.

Search tools accept `page` / `pageSize`, optional `enrichTop` (1–3), and `detail`:

| `detail` | Size | Contents |
|----------|------|----------|
| `minimal` | tiny | id, title, price, path, seller name/type, area |
| `standard` (default) | compact card | beds/type/dates/seller contact + enrich fields; **no** facilities/ber/platform/featured* |
| `full` | large | API passthrough minus CDN/ads junk |

All tools are read-only (`readOnlyHint: true`).

## Run

### Stdio (single Daft MCP)

```bash
bun install
bun packages/daft-mcp/src/index.ts
# or: bun --filter @daft-ie/mcp start
```

### Fastify host (monorepo HTTP — preferred when adding more MCPs)

```bash
bun packages/mcp-host/src/index.ts
# → http://127.0.0.1:3100/mcp/daft
```

See [`../mcp-host`](../mcp-host).

Optional env (see root `.env.example`):

- `DAFT_REFRESH_TOKEN` / `DAFT_ACCESS_TOKEN` — seed tokens
- After `auth_login` or Keycloak refresh rotation, tokens are saved to **`.daft-tokens.json`** (preferred on next start)
- `DAFT_TOKEN_FILE` — override path for that file
- `MCP_HOST` / `MCP_HOST_PORT` — Fastify bind (host package)

Logs for stdio go to **stderr** only (stdout is JSON-RPC).

## Cursor / Cursor CLI

Launch **bun directly** (not `cmd` / `run-mcp.cmd` — wrapping stdio through `cmd.exe` can hang Cursor CLI after MCP approve):

- Project: [`.cursor/mcp.json`](../../.cursor/mcp.json)
- Global: `C:\Users\lorto\.cursor\mcp.json`

`src/boot.ts` loads the monorepo `.env` and clears `ELECTRON_RUN_AS_NODE`, so wrong cwd is fine.

MCP tools are **not** slash-commands. After reload they show under **Settings → MCP → daft** and in Agent chat **Available Tools**.

If the CLI hangs after approving servers: kill stuck `bun` MCP processes, ensure mcp.json uses `bun.exe` + `index.ts` (no `.cmd`), restart the CLI.

## Inspector

```bash
npx @modelcontextprotocol/inspector bun packages/daft-mcp/src/index.ts
```

## Tests

```bash
bun test --filter @daft-ie/mcp
# or
cd packages/daft-mcp && bun test
```

In-process MCP client tests follow the [official testing guide](https://ts.sdk.modelcontextprotocol.io/v2/testing.md) (`createMcpHandler` + `Client`).

## License

MIT
