# @adverts-ie/api

Unofficial TypeScript API client for [Adverts.ie](https://www.adverts.ie).

Reverse-engineered from the Android app: **fresh** host `new.api.adverts.ie` plus legacy `api.adverts.ie` (still required for browse `search.json`). See the [monorepo disclaimer](../../README.md#disclaimer).

MCP wrapper: [`@adverts-ie/mcp`](../adverts-mcp). Shared HTTP host: [`@daft-ie/mcp-host`](../mcp-host).

## Installation

```bash
# from monorepo root
bun install
```

```typescript
import { AdvertsApi } from "@adverts-ie/api";
```

## Quick start

```typescript
import { AdvertsApi } from "@adverts-ie/api";

const api = new AdvertsApi();

// Public browse (legacy search.json) — needs ADVERTS_OLD_API_KEY in env
const page = await api.search({
  sortby: "start_date-desc",
  type: "0",
  pg: "1",
  q: "iphone",
});

for (const ad of page.response?.data ?? []) {
  console.log(ad.ad_id, ad.title, ad.price_string);
}

// Fresh API card (needs ADVERTS_NEW_API_KEY)
const ad = await api.getAdvert(40766726);
console.log(ad.title, ad.category?.name);
```

## What it covers

| Area | Host | Examples |
|------|------|----------|
| Browse / facets | old `api.adverts.ie` | `search`, `getPriceFacets`, `getAreas`, `getAdDetails` |
| Account / place ad / media | new `new.api.adverts.ie` | login, `getAdvert`, bump, watchlist, upload |
| Enums | local | `SearchSortBy`, ad statuses, refine `type` / `seller_type` / `condition` |

Counties/categories are fetched from the API; sort/refine enums are app-local strings in `src/types/enums.ts`.

## Env

Required for real calls (see [`.env.example`](../../.env.example)):

- `ADVERTS_NEW_API_KEY` — `X-Adverts-Api-Key` on the fresh API
- `ADVERTS_OLD_API_KEY` — query `api_key` on legacy JSON endpoints
- Optional: `ADVERTS_ACCESS_TOKEN`, `ADVERTS_USERNAME` / `ADVERTS_PASSWORD` (login may need recaptcha)
- Optional: `HTTP_PROXY` — HTTP proxy for API calls (Bun); see root README

## Tests / research

```bash
cd packages/adverts-api && bun test
```

Inventory and endpoint notes live under [`research/`](research/).

## License

MIT
