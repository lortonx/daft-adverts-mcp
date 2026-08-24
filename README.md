# Irish classifieds toolkit (Daft + Adverts)

Bun monorepo: unofficial **HTTP clients** and **MCP servers** for two Irish sites —

| Site | Domain | Focus |
|------|--------|--------|
| [Daft.ie](https://www.daft.ie) | property | sale / rent / sharing search, listing details, Keycloak auth |
| [Adverts.ie](https://www.adverts.ie) | marketplace | ad search, refine/facets, ad details, optional account |

Not affiliated with Distilled Media, Daft, or Adverts. Protocols and shapes come from the Android apps.

## Disclaimer

This repository was written **entirely by AI coding agents under human direction**. Experiment / personal tooling — not a supported product.

- **No warranty** — correctness and API compatibility are **not** guaranteed; upstream apps change.
- **Tests are minimal** — do not treat a green test run as production-ready.
- Use at your own risk. Respect ToS and rate limits; do not scrape, spam, or abuse accounts.

## Packages

```text
packages/
  daft-api/       @daft-ie/api          HTTP client → gateway.daft.ie / auth.daft.ie
  daft-mcp/       @daft-ie/mcp          MCP tools (stdio) over daft-api
  adverts-api/    @adverts-ie/api       HTTP client → new.api + api.adverts.ie
  adverts-mcp/    @adverts-ie/mcp       MCP tools (stdio) over adverts-api
  mcp-host/       @daft-ie/mcp-host     one Fastify process: both MCPs over HTTP (+ Docker)
```

| Package | README | What you get |
|---------|--------|----------------|
| **`@daft-ie/api`** | [`packages/daft-api`](packages/daft-api) | `DaftApi`: residential/commercial/new-homes search, geo helpers, property details, saved ads/searches, inbox, Keycloak login + refresh rotation |
| **`@daft-ie/mcp`** | [`packages/daft-mcp`](packages/daft-mcp) | Agent tools: `search_for_sale` / `for_rent` / `sharing`, `get_property`, `autocomplete`, `resolve_area`, optional `auth_*` |
| **`@adverts-ie/api`** | [`packages/adverts-api`](packages/adverts-api) | `AdvertsApi`: legacy `search.json` browse + facets/locations; fresh `advert/{id}`, account, media, place-ad surface; app enums |
| **`@adverts-ie/mcp`** | [`packages/adverts-mcp`](packages/adverts-mcp) | Agent tools: `search_ads`, refine/price facets, counties/areas, `get_ad`, discover/config, optional `auth_*` |
| **`@daft-ie/mcp-host`** | [`packages/mcp-host`](packages/mcp-host) | Streamable HTTP: `/mcp/daft`, `/mcp/adverts`, `/health`; Cursor / OpenCode / Hermes / Docker |

Layering:

```text
  Cursor / OpenCode / Hermes / your code
            │
            ├─ stdio ──► daft-mcp ──► daft-api ──► Daft
            ├─ stdio ──► adverts-mcp ──► adverts-api ──► Adverts
            └─ HTTP  ──► mcp-host ──► both MCP servers (shared process)
```

## Quick start

```bash
bun install
cp .env.example .env   # fill DAFT_* and/or ADVERTS_* as needed
```

**Library use**

```typescript
import { DaftApi } from "@daft-ie/api";
import { AdvertsApi } from "@adverts-ie/api";

const daft = new DaftApi({ platform: "android", appVersion: "9.8.1" });
const adverts = new AdvertsApi();
```

**MCP over HTTP (both tools, one process)** — preferred for multi-client setups:

```bash
bun packages/mcp-host/src/index.ts
# http://127.0.0.1:3100/mcp/daft
# http://127.0.0.1:3100/mcp/adverts
```

Docker: see [`packages/mcp-host`](packages/mcp-host#docker).

**MCP stdio (single server per process)**

```bash
bun packages/daft-mcp/src/index.ts
bun packages/adverts-mcp/src/index.ts
```

Wire-up: [`.cursor/mcp.json`](.cursor/mcp.json), [`opencode.json`](opencode.json), and [`packages/mcp-host/README.md`](packages/mcp-host/README.md#integration-cursor--cursor-cli).

## Environment

Shared root [`.env`](.env.example) (gitignored). Rough split:

| Vars | Used by |
|------|---------|
| `DAFT_CLIENT_ID`, `DAFT_REFRESH_TOKEN`, `DAFT_ACCESS_TOKEN`, … | `@daft-ie/api` / `@daft-ie/mcp` |
| `ADVERTS_NEW_API_KEY`, `ADVERTS_OLD_API_KEY`, `ADVERTS_ACCESS_TOKEN`, … | `@adverts-ie/api` / `@adverts-ie/mcp` |
| `HTTP_PROXY` | optional outbound proxy for Bun API calls |
| `DAFT_ENQUIRY_MODE` | `chrome` (default) or legacy `tcp` phone mint |
| `DAFT_CHROME_*` | Docker Chrome+Xvfb enquiry pool |
| `MCP_HOST`, `MCP_HOST_PORT` | `@daft-ie/mcp-host` |

Token files after login: `.daft-tokens.json`, `.adverts-tokens.json` (override with `*_TOKEN_FILE`).

You can run **only Daft**, **only Adverts**, or both — unused keys are simply unused.

## Tests

Per package (`bun test` in that folder). Coverage is intentionally thin; see disclaimer.

## License

MIT (unless a package says otherwise).
