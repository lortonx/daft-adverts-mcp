# @daft-ie/api

Unofficial TypeScript API client for [Daft.ie](https://www.daft.ie) — Ireland's largest property marketplace.

Built by reverse-engineering the official Android app (v9.8.1). All endpoints are **verified against the real production API** (`gateway.daft.ie`).

## Installation

```bash
bun add @daft-ie/api
```

## Quick Start

```typescript
import { DaftApi } from "@daft-ie/api";

const daft = new DaftApi({ platform: "android", appVersion: "9.8.1" });

// Search for properties for sale in Dublin
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
  platform: "android", // sets User-Agent to daft/9.8.1/AndroidVersion/11
  appVersion: "9.8.1",
  timeout: 10000,
  headers: { "x-custom": "value" },
  authToken: "eyJ...", // optional bearer token for authenticated calls
  clientId: "daft-android-v2", // Keycloak client used by login()/refreshToken()
});
```

## Search

### Search helpers

```typescript
const forSale = await daft.searchForSale({
  county: "dublin", // auto-resolved to storedShapeIds
  area: "dublin-city", // or use an area/city
  propertyTypes: ["apartments", "houses"],
  minBeds: 2,
  maxBeds: 4,
  minPrice: 200000,
  maxPrice: 600000,
  facilities: ["parking", "alarm"],
  terms: "sea view",
  sort: "priceAsc", // bestMatch | publishDateDesc | publishDateAsc | priceDesc | priceAsc | distance
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
  5 // max pages
);
```

## Property details & lookups

```typescript
const details = await daft.getPropertyDetails(1234567); // GET /api/v3/ads/listing/{id}
const areas = await daft.getClassifiedAreas(); // counties, cities, colleges, areas
const ids = await daft.resolveAreaIds("dublin"); // -> ["1"]
const suggestions = await daft.autocomplete("dubl");
const reasons = await daft.getReportReasons();
const mapping = await daft.getAreaMapping(1); // daft area id -> Allianz area id
```

## Authentication

Two flows against Keycloak (`auth.daft.ie`):

```typescript
// 1. Password grant (only works for accounts with a Keycloak password;
//    SSO-created accounts cannot use this)
const token = await daft.login("user@example.com", "password");

// 2. Refresh token (recommended) — mint short-lived access tokens (~5 min)
const token = await daft.refreshToken("refresh-token-from-app-or-website");
```

Once a token is stored (via `login`/`refreshToken`/`authToken`/`setToken`), the
client attaches `Authorization: Bearer <token>` automatically.

### Automatic token rotation

Pass a long-lived refresh token in the options and the client will **auto-refresh
on 401 and retry the request** (single-flight — concurrent callers share one refresh):

```typescript
const daft = new DaftApi({
  platform: "android",
  appVersion: "9.8.1",
  refreshToken: "refresh-token-from-app-or-website", // enables auto-rotation
  // autoRefresh: false, // optional: disable
});
```

```typescript
daft.setRefreshToken("..."); // or set/update later
daft.setAutoRefresh(false);  // or toggle
```

Rotation updates both the access token and the refresh token (Keycloak rotates
refresh tokens too). `logout()` clears the stored tokens.

## Authenticated endpoints

```typescript
const me = await daft.getUserInfo(5821124); // UserInfo
await daft.updateUserConsents(5821124, {
  receiveEmailAccepted: true,
  receiveNotificationAccepted: true,
  termsOfUseAccepted: true,
});

const savedAds = await daft.getSavedAds(5821124, { pageSize: 20, from: 0 }); // SavedAdsResponse
await daft.saveAd({ adId: 1234567, openViewingAlert: true, priceChangeAlert: true, statusAlert: false });
await daft.deleteSavedAd(5821124, "saved-ad-id");

const savedSearches = await daft.getSavedSearches(5821124); // SavedSearchResponse
await daft.saveSearch({ title: "Dublin 2 beds", searchRequest: { section: "residential-to-rent", ranges: [{ name: "numBeds", from: 2, to: 2 }] } });
await daft.deleteSavedSearch(5821124, "search-id");

const myAds = await daft.getMyAds(5821124); // MyAdsResponse
await daft.updateAdState("ad-id", { state: "PAUSE" });

const myProperties = await daft.getMyProperties(); // PropertyDto[]
await daft.createMyProperty({ location: { address: "1 Main St, Dublin", eircode: "D01 ABC" } });

const enquiries = await daft.getEnquiries(1234567); // InboxEnquiriesResponse
await daft.markReplies([{ replyId: "123", read: true }]);

const savedReply = await daft.getSavedReply(1234567); // SavedReply
const offers = await daft.getOffers(1234567); // AdOffers
await daft.createPushToken(5821124, { token: "fcm-token" });
```

## Error handling

Non-2xx responses throw `ApiError`:

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

## Types

All types are exported from `@daft-ie/api`. The public response shapes mirror the
real API (see `src/types.ts`): `Listing`, `SearchResponse`, `SearchListingItem`,
`ResponsePaging`, `PropertyDetailsResponse`, `Area`, `ClassifiedAreasResponse`,
`Location`, `UserInfo`, `SavedAdsResponse`, `SavedSearchResponse`, `MyAdsResponse`,
`InboxEnquiriesResponse`, `AdOffers`, `TokenResponse`, and more.

## Notes & limitations

- **Authentication**: password grants fail for accounts created via Google/Apple SSO
  (returns `invalid_grant`). Obtain a refresh token from the app/website and use
  `refreshToken()`.
- Access tokens last ~5 minutes; refresh tokens last ~30 minutes.
- The old legacy ad-details endpoint (`/old/v1/legacy/listing/{id}`) still serves
  some ids; new listings use `/api/v3/ads/listing/{id}`.
- `getLocationAutocomplete()` hits the public locations API and needs no auth.

## License

MIT
