# @adverts-ie/mcp

MCP server for [Adverts.ie](https://www.adverts.ie) — **search-first** tools via [`@adverts-ie/api`](../adverts-api).

Built with the official [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/) (`@modelcontextprotocol/server`).

## Tools

| Tool | Description |
|------|-------------|
| `search_ads` | Browse/search ads (`search.json`) — main tool |
| `get_refine_options` | Category refine catalog for filters |
| `get_price_facets` | Price buckets for a filter bag |
| `get_counties` / `get_areas` | Location ids for `countyIds` / `areaIds` |
| `get_ad` | Ad details by id |
| `get_discover` | Discover carousels |
| `get_app_config` | App feature flags |
| `auth_login` / `auth_status` / `auth_logout` | Optional session (search works without login) |

`search_ads` accepts `page`, enums (`sortby`, `type`, `seller_type`, `condition`, `nearby_range`), and `detail`:

| `detail` | Size | Contents |
|----------|------|----------|
| `minimal` | tiny | id, title, price, location, type/status |
| `standard` (default) | compact card | + dates, seller flags, category/county |
| `full` | large | API passthrough minus image/tracking junk |

## Run

### Stdio

```bash
bun install
bun packages/adverts-mcp/src/index.ts
# or: bun --filter @adverts-ie/mcp start
```

### Fastify host

```bash
bun packages/mcp-host/src/index.ts
# → http://127.0.0.1:3100/mcp/adverts
```

Env (root `.env` / `.env.example`):

- `ADVERTS_NEW_API_KEY` / `ADVERTS_OLD_API_KEY` — required
- `ADVERTS_ACCESS_TOKEN` — optional seed
- After `auth_login`, token saved to **`.adverts-tokens.json`** (override with `ADVERTS_TOKEN_FILE`)

Logs for stdio go to **stderr** only (stdout is JSON-RPC).

## Cursor

Project [`.cursor/mcp.json`](../../.cursor/mcp.json) — servers `adverts` (stdio) and `adverts-http`.

## Tests

```bash
cd packages/adverts-mcp && bun test
```

## License

MIT
