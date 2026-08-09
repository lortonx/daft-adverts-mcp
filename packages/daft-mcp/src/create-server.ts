import {
  ApiError,
  DaftApi,
  type Listing,
  type PropertyDetailsResponse,
  type SearchOptions,
  type SearchResponse,
} from "@daft-ie/api";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { createDaftClient } from "./client";

/** CDN/UI/ads junk — always dropped, including on detail=full. */
const DENY = new Set([
  "media",
  "pageBranding",
  "dfpTargetingValues",
  "breadcrumbs",
  "srpLinking",
  "relevantAds",
  "buyingBudgetDetail",
  "developerSponsor",
  "profileImage",
  "profileRoundedImage",
  "standardLogo",
  "squareLogo",
  "backgroundColour",
]);

/** Details-only keys merged by enrichTop. */
const ENRICH_KEYS = [
  "description",
  "features",
  "addressDetails",
  "areaName",
  "firstPublishDate",
  "lastUpdateDate",
  "listingViews",
  "nonFormatted",
] as const;

const detailSchema = z
  .enum(["minimal", "standard", "full"])
  .default("standard")
  .describe(
    "Response size: minimal (id/title/price/path/seller/area), standard (default card + enrich fields, no facilities/ber), full (API passthrough minus CDN/ads junk)"
  );

const MINIMAL_LISTING = [
  "id",
  "title",
  "price",
  "seoFriendlyPath",
  "areaName",
] as const;
const MINIMAL_SELLER = ["name", "sellerType"] as const;

const STANDARD_LISTING = [
  "id",
  "title",
  "seoTitle",
  "price",
  "abbreviatedPrice",
  "numBedrooms",
  "numBathrooms",
  "propertyType",
  "seoFriendlyPath",
  "publishDate",
  "areaName",
  "addressDetails",
  "description",
  "features",
  "listingViews",
  "firstPublishDate",
  "lastUpdateDate",
  "saleType",
  "category",
  "state",
  "daftShortcode",
  "nonFormatted",
] as const;
const STANDARD_SELLER = [
  "sellerId",
  "name",
  "phone",
  "branch",
  "sellerType",
  "licenceNumber",
] as const;

type DetailLevel = "minimal" | "standard" | "full";

function jsonForMcp(value: unknown): string {
  return JSON.stringify(value, (key, v) => (DENY.has(key) ? undefined : v), 2);
}

function pick(
  obj: Record<string, unknown> | undefined,
  keys: readonly string[]
): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

function projectListing(
  listing: Listing,
  detail: DetailLevel
): Record<string, unknown> {
  const raw = listing as unknown as Record<string, unknown>;
  if (detail === "full") return raw;

  const listingKeys = detail === "minimal" ? MINIMAL_LISTING : STANDARD_LISTING;
  const sellerKeys = detail === "minimal" ? MINIMAL_SELLER : STANDARD_SELLER;
  const projected = pick(raw, listingKeys) ?? {};
  const seller = pick(
    raw.seller as Record<string, unknown> | undefined,
    sellerKeys
  );
  if (seller) projected.seller = seller;
  return projected;
}

function projectSearch(
  response: SearchResponse,
  detail: DetailLevel
): unknown {
  if (detail === "full") return response;
  return {
    listings: response.listings.map((item) => {
      const out: Record<string, unknown> = {
        listing: projectListing(item.listing, detail),
      };
      const extra = item as { canonicalUrl?: string };
      if (extra.canonicalUrl) out.canonicalUrl = extra.canonicalUrl;
      return out;
    }),
    paging: response.paging,
  };
}

function projectProperty(
  response: PropertyDetailsResponse,
  detail: DetailLevel
): unknown {
  if (detail === "full") return response;
  const out: Record<string, unknown> = {
    listing: projectListing(response.listing, detail),
  };
  if (response.canonicalUrl) out.canonicalUrl = response.canonicalUrl;
  if (response.listingViews !== undefined) {
    out.listingViews = response.listingViews;
  }
  return out;
}

/** Keep schemas small — large enum lists bloat tools/list for the host. */
const searchOptionsSchema = z.object({
  county: z.string().optional().describe('County name, e.g. "dublin"'),
  area: z.string().optional().describe('Area or city name, e.g. "dublin-city"'),
  minPrice: z.number().optional().describe("Minimum price in EUR"),
  maxPrice: z.number().optional().describe("Maximum price in EUR"),
  minBeds: z.number().int().min(0).max(15).optional().describe("Min bedrooms"),
  maxBeds: z.number().int().min(0).max(15).optional().describe("Max bedrooms"),
  propertyTypes: z
    .array(z.string())
    .optional()
    .describe('Property types, e.g. ["apartments","houses"]'),
  facilities: z
    .array(z.string())
    .optional()
    .describe('Facilities AND filter, e.g. ["parking"]'),
  roomTypes: z
    .array(z.string())
    .optional()
    .describe('Sharing only: ["single","double","twin","shared"]'),
  terms: z.string().optional().describe("Free-text search terms"),
  sort: z
    .string()
    .optional()
    .describe(
      "bestMatch | publishDateDesc | publishDateAsc | priceDesc | priceAsc | distance"
    ),
  page: z.number().int().min(1).optional().describe("Page number (1-based)"),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Results per page (max 50). Prefer small pages; use page to batch."),
  publishedWithinDays: z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe(
      "Keep listings published or updated within the last N days (client-side; Daft has no date range). Defaults sort to publishDateDesc and may fetch up to 10 pages from `page` until older results."
    ),
  enrichTop: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe(
      "Merge details-only fields into the first N hits (max 3). Pairs well with detail=standard."
    ),
  detail: detailSchema,
});

const readOnly = { readOnlyHint: true as const };

/** Cap extra paging when filtering by publishedWithinDays. */
const PUBLISHED_WITHIN_MAX_PAGES = 10;

type SearchArgs = z.infer<typeof searchOptionsSchema>;

function toSearchOptions(args: SearchArgs): SearchOptions {
  return {
    county: args.county,
    area: args.area,
    minPrice: args.minPrice,
    maxPrice: args.maxPrice,
    minBeds: args.minBeds as SearchOptions["minBeds"],
    maxBeds: args.maxBeds as SearchOptions["maxBeds"],
    propertyTypes: args.propertyTypes as SearchOptions["propertyTypes"],
    facilities: args.facilities as SearchOptions["facilities"],
    roomTypes: args.roomTypes as SearchOptions["roomTypes"],
    terms: args.terms,
    sort: args.sort as SearchOptions["sort"],
    page: args.page,
    pageSize: args.pageSize,
  };
}

/** Coerce Daft epoch seconds/millis or ISO strings to millis. */
function coerceTimeMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value) {
    const asNum = Number(value);
    if (Number.isFinite(asNum)) {
      return asNum < 1e12 ? asNum * 1000 : asNum;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** Latest of publish / update / first-publish for recency filtering. */
function listingActivityMs(listing: Listing): number | null {
  let best: number | null = null;
  for (const value of [
    listing.lastUpdateDate,
    listing.publishDate,
    listing.firstPublishDate,
  ]) {
    const ms = coerceTimeMs(value);
    if (ms != null && (best == null || ms > best)) best = ms;
  }
  return best;
}

function filterListingsByPublishedWithin(
  listings: SearchResponse["listings"],
  days: number,
  nowMs = Date.now()
): { kept: SearchResponse["listings"]; sawOlder: boolean } {
  const cutoff = nowMs - days * 86_400_000;
  const kept: SearchResponse["listings"] = [];
  let sawOlder = false;
  for (const item of listings) {
    const t = listingActivityMs(item.listing);
    if (t == null || t >= cutoff) {
      kept.push(item);
    } else {
      sawOlder = true;
    }
  }
  return { kept, sawOlder };
}

/**
 * Fetch pages newest-first until the date window is exhausted (or page cap).
 * Daft listings API has no publishDate range filter.
 */
async function searchPublishedWithin(
  search: (opts: SearchOptions) => Promise<SearchResponse>,
  args: SearchArgs
): Promise<SearchResponse> {
  const days = args.publishedWithinDays!;
  const opts: SearchOptions = {
    ...toSearchOptions(args),
    sort: (args.sort as SearchOptions["sort"]) ?? "publishDateDesc",
  };
  const pageSize = opts.pageSize ?? 20;
  const startPage = opts.page ?? 1;
  const merged: SearchResponse["listings"] = [];
  let last: SearchResponse | undefined;

  for (let page = startPage; page < startPage + PUBLISHED_WITHIN_MAX_PAGES; page++) {
    const response = await search({ ...opts, page, pageSize });
    last = response;
    const batch = response.listings ?? [];
    if (batch.length === 0) break;

    const { kept, sawOlder } = filterListingsByPublishedWithin(batch, days);
    merged.push(...kept);

    // Newest-first: once a page has older hits, further pages are older.
    if (sawOlder || batch.length < pageSize) break;
  }

  if (!last) {
    return { listings: [], paging: undefined } as SearchResponse;
  }

  return {
    ...last,
    listings: merged,
    paging: last.paging
      ? {
          ...last.paging,
          displayingFrom: merged.length ? 1 : 0,
          displayingTo: merged.length,
        }
      : last.paging,
  };
}

type ToolResult =
  | { content: [{ type: "text"; text: string }] }
  | { content: [{ type: "text"; text: string }]; isError: true };

function ok(value: unknown): ToolResult {
  return { content: [{ type: "text", text: jsonForMcp(value) }] };
}

function toolError(err: unknown): ToolResult {
  if (err instanceof ApiError) {
    return {
      content: [
        {
          type: "text",
          text: `Daft API error ${err.status} ${err.method} ${err.url}: ${err.message}`,
        },
      ],
      isError: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

async function enrichSearchTop(
  daft: DaftApi,
  response: SearchResponse,
  enrichTop: number
): Promise<SearchResponse> {
  const n = Math.min(enrichTop, 3, response.listings.length);
  if (n <= 0) return response;

  const head = await Promise.all(
    response.listings.slice(0, n).map(async (item) => {
      const details = await daft.getPropertyDetails(item.listing.id);
      const patch: Partial<Listing> = {};
      for (const key of ENRICH_KEYS) {
        const value = details.listing?.[key];
        if (value !== undefined) {
          (patch as Record<string, unknown>)[key] = value;
        }
      }
      return {
        ...item,
        listing: { ...item.listing, ...patch },
        ...(details.canonicalUrl
          ? { canonicalUrl: details.canonicalUrl }
          : {}),
      };
    })
  );

  return {
    ...response,
    listings: [...head, ...response.listings.slice(n)],
  };
}

function decodeJwtClaims(
  accessToken: string
): Record<string, unknown> | undefined {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return undefined;
    const json = Buffer.from(
      payload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Mask identity strings for tool output (keep a short prefix recognisable). */
function maskIdentity(value: string): string {
  if (value.includes("@")) {
    const at = value.indexOf("@");
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);
    const maskedLocal =
      local.length <= 2 ? "*".repeat(Math.max(local.length, 1)) : `${local.slice(0, 2)}***`;
    const dot = domain.lastIndexOf(".");
    if (dot <= 0) {
      const maskedHost =
        domain.length <= 1 ? "*" : `${domain[0]}***`;
      return `${maskedLocal}@${maskedHost}`;
    }
    const host = domain.slice(0, dot);
    const tld = domain.slice(dot);
    const maskedHost = host.length <= 1 ? "*" : `${host[0]}***`;
    return `${maskedLocal}@${maskedHost}${tld}`;
  }
  if (value.length <= 2) return "*".repeat(value.length);
  if (value.length <= 4) return `${value[0]}***`;
  return `${value.slice(0, 2)}***${value.slice(-1)}`;
}

function authSnapshot(daft: DaftApi, username?: string) {
  const access = daft.getToken();
  const refresh = daft.getRefreshToken();
  const claims = access ? decodeJwtClaims(access) : undefined;
  const email = typeof claims?.email === "string" ? claims.email : null;
  const preferredUsername =
    typeof claims?.preferred_username === "string"
      ? claims.preferred_username
      : null;
  return {
    loggedIn: Boolean(access || refresh),
    hasAccessToken: Boolean(access),
    hasRefreshToken: Boolean(refresh),
    username: username ? maskIdentity(username) : null,
    email: email ? maskIdentity(email) : null,
    preferredUsername: preferredUsername
      ? maskIdentity(preferredUsername)
      : null,
    userId:
      typeof claims?.user_id === "string" || typeof claims?.user_id === "number"
        ? claims.user_id
        : null,
    accessExpiresAt:
      typeof claims?.exp === "number"
        ? new Date(claims.exp * 1000).toISOString()
        : null,
  };
}

/** Build the Daft MCP server with public read-only tools + optional auth. */
export function createServer(daft: DaftApi = createDaftClient()): McpServer {
  const server = new McpServer({ name: "daft", version: "1.0.0" });
  let sessionUsername: string | undefined;

  const runSearch = async (
    search: (opts: SearchOptions) => Promise<SearchResponse>,
    args: SearchArgs
  ): Promise<ToolResult> => {
    try {
      let response = args.publishedWithinDays
        ? await searchPublishedWithin(search, args)
        : await search(toSearchOptions(args));
      if (args.enrichTop) {
        response = await enrichSearchTop(daft, response, args.enrichTop);
      }
      return ok(projectSearch(response, args.detail));
    } catch (err) {
      return toolError(err);
    }
  };

  const searchBlurb =
    "detail defaults to standard (compact card). Use minimal for lists, full for raw API. enrichTop (1–3) merges description/address/features into top hits.";

  server.registerTool(
    "auth_login",
    {
      title: "Log in to Daft",
      description:
        "Optional Keycloak password login for authenticated actions (e.g. enquiries). Most search tools work without login. Google/Apple SSO accounts cannot use this — they need a Keycloak password. Does not return raw tokens.",
      inputSchema: z.object({
        username: z
          .string()
          .min(1)
          .describe("Daft email or username"),
        password: z.string().min(1).describe("Daft account password"),
      }),
    },
    async ({ username, password }) => {
      try {
        await daft.login(username, password);
        sessionUsername = username;
        return ok({
          ok: true,
          ...authSnapshot(daft, sessionUsername),
        });
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "auth_status",
    {
      title: "Daft auth status",
      description:
        "Whether this MCP session has Daft tokens (from auth_login or env). Never returns raw tokens.",
      annotations: readOnly,
      inputSchema: z.object({}),
    },
    async () => ok(authSnapshot(daft, sessionUsername))
  );

  server.registerTool(
    "auth_logout",
    {
      title: "Log out of Daft",
      description:
        "Revoke the Keycloak session when possible and clear tokens from this MCP process.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const refresh = daft.getRefreshToken();
        if (refresh) {
          try {
            await daft.logout(refresh, sessionUsername);
          } catch {
            daft.clearTokens();
          }
        } else {
          daft.clearTokens();
        }
        sessionUsername = undefined;
        return ok({ ok: true, ...authSnapshot(daft) });
      } catch (err) {
        daft.clearTokens();
        sessionUsername = undefined;
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "search_for_sale",
    {
      title: "Search Daft for sale",
      description: `Search residential properties for sale on Daft.ie. ${searchBlurb}`,
      annotations: readOnly,
      inputSchema: searchOptionsSchema,
    },
    (args) => runSearch((opts) => daft.searchForSale(opts), args)
  );

  server.registerTool(
    "search_for_rent",
    {
      title: "Search Daft rentals",
      description: `Search residential properties to rent on Daft.ie. ${searchBlurb}`,
      annotations: readOnly,
      inputSchema: searchOptionsSchema,
    },
    (args) => runSearch((opts) => daft.searchForRent(opts), args)
  );

  server.registerTool(
    "search_sharing",
    {
      title: "Search Daft sharing",
      description: `Search rooms / sharing listings on Daft.ie. ${searchBlurb}`,
      annotations: readOnly,
      inputSchema: searchOptionsSchema,
    },
    (args) => runSearch((opts) => daft.searchForSharing(opts), args)
  );

  server.registerTool(
    "get_property",
    {
      title: "Get Daft property details",
      description:
        "Full listing by id. detail defaults to standard. Prefer enrichTop on search for the first few hits.",
      annotations: readOnly,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Listing id"),
        detail: detailSchema,
      }),
    },
    async ({ id, detail }) => {
      try {
        return ok(projectProperty(await daft.getPropertyDetails(id), detail));
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "autocomplete",
    {
      title: "Daft area autocomplete",
      description: "Autocomplete Daft.ie area / location suggestions",
      annotations: readOnly,
      inputSchema: z.object({
        searchTerm: z
          .string()
          .min(1)
          .describe('Partial place name, e.g. "dubl"'),
      }),
    },
    async ({ searchTerm }) => {
      try {
        const areas = await daft.autocomplete(searchTerm);
        return ok({
          areas: areas.map((a) => ({
            id: a.id,
            displayName: a.displayName,
            displayValue: a.displayValue,
          })),
        });
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "resolve_area",
    {
      title: "Resolve Daft area ids",
      description:
        "Resolve a county/area name to Daft stored shape ids used in search filters",
      annotations: readOnly,
      inputSchema: z.object({
        location: z
          .string()
          .min(1)
          .describe('Location name, e.g. "dublin" or "dublin-city"'),
      }),
    },
    async ({ location }) => {
      try {
        const ids = (await daft.resolveAreaIds(location)) ?? null;
        return ok({ ids });
      } catch (err) {
        return toolError(err);
      }
    }
  );

  return server;
}
