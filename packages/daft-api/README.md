# @daft-ie/api

Unofficial TypeScript API client for [Daft.ie](https://www.daft.ie) — Ireland's largest property marketplace.

Built by reverse-engineering the official Android app (v9.8.1). Many endpoints were checked against production (`gateway.daft.ie`). See the [monorepo disclaimer](../../README.md#disclaimer).

MCP wrapper: [`@daft-ie/mcp`](../daft-mcp). Shared HTTP host: [`@daft-ie/mcp-host`](../mcp-host).

## Installation

```bash
# from monorepo root
bun install
```

```typescript
import { DaftApi } from "@daft-ie/api";
```

## Quick Start

```typescript
import { DaftApi } from "@daft-ie/api";

const daft = new DaftApi({ platform: "android", appVersion: "9.8.1" });

const results = await daft.searchForSale({
  county: "dublin",
  minPrice: 200000,
  maxPrice: 400000,
  minBeds: 2,
});

for (const { listing } of results.listings) {
  console.log(`${listing.title}: ${listing.price}`);
}
```

## Features

- Search residential (sale, rent, sharing), commercial, and new-homes sections
- Filter by price, beds, property type, facilities, terms
- Geographic filtering (county/area auto-resolution, point+radius, map bounds)
- Property details, locations, autocomplete, report reasons, area mapping
- Keycloak auth: `login()`, `refreshToken()`, `logout()` (`daft-android-v2` client)
- Authenticated account endpoints: user info, consents, saved ads, saved searches,
  my ads, my properties, inbox/enquiries, offers, push tokens
- TypeScript-first with real API response shapes

## Configuration

```typescript
const daft = new DaftApi({
  baseUrl: "https://gateway.daft.ie", // default
  authUrl: "https://auth.daft.ie", // default
  platform: "android", // sets User-Agent to daft/9.8.1/AndroidVersion/15
  appVersion: "9.8.1",
  timeout: 10000,
  headers: { "x-custom": "value" },
  authToken: "eyJ...", // optional bearer token for authenticated calls
  clientId: "daft-android-v2", // Keycloak client used by login()/refreshToken()
});
```

Env (monorepo `.env`): `DAFT_CLIENT_ID`, `DAFT_REFRESH_TOKEN`, `DAFT_ACCESS_TOKEN`, optional username/password — see [`.env.example`](../../.env.example).

Optional outbound proxy: `HTTP_PROXY` (HTTP URL; Bun). See root README.

reCAPTCHA / enquiry: **Chrome web form only** (`sendEnquiryViaChrome` / `src/chrome/`). Phone LSPosed TCP mint was removed.

## Search

### Search helpers

```typescript
const forSale = await daft.searchForSale({
  county: "dublin",
  area: "dublin-city",
  propertyTypes: ["apartments", "houses"],
  minBeds: 2,
  maxBeds: 4,
  minPrice: 200000,
  maxPrice: 600000,
  facilities: ["parking", "alarm"],
  terms: "sea view",
  sort: "priceAsc",
  page: 1,
  pageSize: 20,
});

const forRent = await daft.searchForRent({ ... });
const sharing = await daft.searchForSharing({ ... });
const commercialSale = await daft.searchCommercialForSale({ ... });
const commercialRent = await daft.searchCommercialForRent({ ... });
const newHomes = await daft.searchNewDevelopments({ ... });
```

### Raw search payload

```typescript
const results = await daft.search({
  section: "residential-to-rent",
  filters: [{ name: "propertyType", values: ["apartments"] }],
  ranges: [{ name: "numBeds", from: 1, to: 2 }],
  paging: { from: "0", pageSize: "20" },
  geoFilter: { lat: 53.3498, lon: -6.2603, rad: 2000, geoSearchType: "POINT_AND_RADIUS" },
});
```

Results are nested: `response.listings[i].listing` (`Listing`), `response.paging` (`ResponsePaging`).

### Pagination

```typescript
const all = await daft.searchAllPages(
  (page) => daft.searchForSale({ county: "dublin", page }),
  5
);
```

## Property details & lookups

```typescript
const details = await daft.getPropertyDetails(1234567);
const areas = await daft.getClassifiedAreas();
const ids = await daft.resolveAreaIds("dublin");
const suggestions = await daft.autocomplete("dubl");
const reasons = await daft.getReportReasons();
const mapping = await daft.getAreaMapping(1);
```

## Authentication

Two flows against Keycloak (`auth.daft.ie`):

```typescript
const token = await daft.login("user@example.com", "password");
const token2 = await daft.refreshToken("refresh-token-from-app-or-website");
```

Password grant fails for Google/Apple SSO accounts — use a refresh token from the app/website.

### Automatic token rotation

```typescript
const daft = new DaftApi({
  platform: "android",
  appVersion: "9.8.1",
  refreshToken: "refresh-token-from-app-or-website",
});
```

On 401 the client refreshes once (single-flight) and retries.

## Authenticated endpoints

```typescript
const userId = 1234567; // from login / JWT user_id
const me = await daft.getUserInfo(userId);
const savedAds = await daft.getSavedAds(userId, { pageSize: 20, from: 0 });
const savedSearches = await daft.getSavedSearches(userId);
const myAds = await daft.getMyAds(userId);
const myProperties = await daft.getMyProperties();
const enquiries = await daft.getEnquiries(1234567);
const offers = await daft.getOffers(1234567);
```

## Error handling

```typescript
import { ApiError } from "@daft-ie/api";

try {
  await daft.searchForSale({ county: "dublin" });
} catch (err) {
  if (err instanceof ApiError) {
    console.error(err.status, err.url, err.body);
  }
}
```

## Tests

```bash
cd packages/daft-api && bun test
```

## License

MIT
