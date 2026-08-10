import {
  ApiError,
  AdvertsApi,
  NEARBY_RANGES_KM,
  SEARCH_AD_TYPES,
  SEARCH_CONDITIONS,
  SEARCH_SELLER_TYPES,
  SEARCH_SORT_BY,
  type AdResponse,
  type OldSearchParams,
  type OldSearchResponse,
  type SearchAdvert,
  type SearchResponse,
} from "@adverts-ie/api";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { createAdvertsClient } from "./client";

/** Image / tracking junk — always dropped, including on detail=full. */
const DENY = new Set([
  "priImageUrl",
  "cacheImageUrl",
  "tracking_pixel",
  "media",
  "analytics_link",
]);

const detailSchema = z
  .enum(["minimal", "standard", "full"])
  .default("standard")
  .describe(
    "Response size: minimal (id/title/price/location), standard (default card + dates/seller flags), full (API passthrough minus image/tracking junk)"
  );

const ADVERTS_SITE = "https://adverts.ie";

/** Turn site-relative paths into absolute https URLs; leave absolute URLs as-is (no www). */
function absoluteUrl(base: string, pathOrUrl: unknown): string | undefined {
  if (typeof pathOrUrl !== "string") return undefined;
  const s = pathOrUrl.trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) {
    return s.replace(/^(https?:\/\/)www\./i, "$1");
  }
  if (s.startsWith("//")) {
    return `https:${s}`.replace(/^(https?:\/\/)www\./i, "$1");
  }
  const path = s.startsWith("/") ? s : `/${s}`;
  return `${base.replace(/\/$/, "")}${path}`;
}

function withAbsoluteAdvertsLinks(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...obj };
  const href = absoluteUrl(ADVERTS_SITE, out.href);
  if (href) out.href = href;
  return out;
}

const MINIMAL_AD = [
  "ad_id",
  "title",
  "price",
  "price_string",
  "location",
  "ad_type",
  "ad_status",
  "href",
] as const;

const STANDARD_AD = [
  ...MINIMAL_AD,
  "ad_subtype",
  "ad_condition",
  "category_id",
  "county_id",
  "area_id",
  "region_id",
  "user",
  "user_id",
  "start_date",
  "refresh_date",
  "comment_count",
  "num_views",
  "has_premium_badge",
  "is_dealer",
  "is_merchant",
  "is_top_seller",
  "is_watched",
  "href",
  "sold_label",
  "pet_type",
  "employer_name",
] as const;

type DetailLevel = "minimal" | "standard" | "full";

type ToolResult =
  | { content: [{ type: "text"; text: string }] }
  | { content: [{ type: "text"; text: string }]; isError: true };

const readOnly = { readOnlyHint: true as const };

function jsonForMcp(value: unknown): string {
  return JSON.stringify(value, (key, v) => (DENY.has(key) ? undefined : v), 2);
}

function ok(value: unknown): ToolResult {
  return { content: [{ type: "text", text: jsonForMcp(value) }] };
}

function toolError(err: unknown): ToolResult {
  if (err instanceof ApiError) {
    return {
      content: [
        {
          type: "text",
          text: `Adverts API error ${err.status} ${err.method} ${err.url}: ${err.message}`,
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

function projectAdvert(
  ad: SearchAdvert | Record<string, unknown>,
  detail: DetailLevel
): Record<string, unknown> {
  const raw = ad as unknown as Record<string, unknown>;
  if (detail === "full") return withAbsoluteAdvertsLinks(raw);
  const keys = detail === "minimal" ? MINIMAL_AD : STANDARD_AD;
  return withAbsoluteAdvertsLinks(pick(raw, keys) ?? {});
}

function projectSearchBody(
  body: SearchResponse,
  detail: DetailLevel
): unknown {
  if (detail === "full") {
    return {
      ...body,
      data: (body.data ?? []).map((ad) =>
        withAbsoluteAdvertsLinks(ad as unknown as Record<string, unknown>)
      ),
    };
  }
  return {
    data: (body.data ?? []).map((ad) => projectAdvert(ad, detail)),
    pagination: body.pagination,
    sentence: body.sentence,
    cat_facet: body.cat_facet?.map((f) => ({
      categoryId: f.categoryId,
      categoryName: f.categoryName,
      count: f.count,
    })),
    price_facet: body.price_facet,
    message: body.message,
  };
}

function projectSearch(
  envelope: OldSearchResponse,
  detail: DetailLevel
): unknown {
  return {
    status: envelope.status,
    response: projectSearchBody(envelope.response, detail),
  };
}

function projectAdDetails(res: AdResponse, detail: DetailLevel): unknown {
  const inner = res.response;
  if (!inner) return { status: res.status };

  const advert = inner.advert ?? inner;
  if (detail === "full") {
    const abs = withAbsoluteAdvertsLinks(
      advert as unknown as Record<string, unknown>
    );
    if (inner.advert) {
      return { ...res, response: { ...inner, advert: abs } };
    }
    return {
      ...res,
      response: withAbsoluteAdvertsLinks({
        ...(inner as unknown as Record<string, unknown>),
      }),
    };
  }

  const projected = withAbsoluteAdvertsLinks(
    pick(advert as unknown as Record<string, unknown>, [
      "id",
      "ad_id",
      "title",
      "description",
      "price",
      "ad_status",
      "ad_type",
      "ad_subtype",
      "ad_condition",
      "location",
      "county_id",
      "area_id",
      "region_id",
      "category_id",
      "user_id",
      "user",
      "href",
      "start_date",
      "refresh_date",
      "comment_count",
      "num_views",
      "shipping_options",
      "payment_options",
    ]) ?? {}
  );

  return {
    status: res.status,
    response: {
      ...projected,
      message: inner.message,
      pagination: inner.pagination,
      comments: detail === "minimal" ? undefined : inner.data?.slice(0, 5),
    },
  };
}

/** Username for auth_status — survives createServer() per-request factories. */
const sessionUsernames = new WeakMap<AdvertsApi, string>();

function maskIdentity(value: string): string {
  if (value.includes("@")) {
    const at = value.indexOf("@");
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);
    const maskedLocal =
      local.length <= 2
        ? "*".repeat(Math.max(local.length, 1))
        : `${local.slice(0, 2)}***`;
    const dot = domain.lastIndexOf(".");
    if (dot <= 0) {
      const maskedHost = domain.length <= 1 ? "*" : `${domain[0]}***`;
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

function authSnapshot(api: AdvertsApi) {
  const access = api.getToken();
  const username = sessionUsernames.get(api);
  return {
    loggedIn: Boolean(access),
    hasAccessToken: Boolean(access),
    username: username ? maskIdentity(username) : null,
  };
}

/** Keep schemas small — large enum dumps bloat tools/list. */
const searchFiltersSchema = z.object({
  q: z.string().optional().describe("Free-text query"),
  search_cat: z
    .string()
    .optional()
    .describe("Category id (search_cat)"),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Page number (1-based → pg)"),
  sortby: z
    .enum(SEARCH_SORT_BY)
    .optional()
    .describe(
      "best_match-desc | refresh_date-desc | start_date-desc | price-asc | price-desc | comment_date-desc"
    ),
  type: z
    .enum(SEARCH_AD_TYPES)
    .optional()
    .describe("all | 0 (For sale) | wanted | swap"),
  seller_type: z
    .enum(SEARCH_SELLER_TYPES)
    .optional()
    .describe("0 All | 1 Private | 2 Shop"),
  condition: z
    .enum(SEARCH_CONDITIONS)
    .optional()
    .describe("0 All | excellent (Used) | brandnew"),
  only_photos: z
    .boolean()
    .optional()
    .describe("When true, sends only_photos=1"),
  rs_min_price: z.string().optional().describe("Min price (string)"),
  rs_max_price: z.string().optional().describe("Max price (string)"),
  rs_min_year: z.string().optional(),
  rs_max_year: z.string().optional(),
  nearby_lat: z.string().optional(),
  nearby_lon: z.string().optional(),
  nearby_range: z
    .enum(NEARBY_RANGES_KM)
    .optional()
    .describe("Nearby radius km: 2 | 5 | 10 | 30 | 75"),
  countyIds: z
    .array(z.number().int())
    .optional()
    .describe("County ids → searchWithMultipleCounties"),
  areaIds: z
    .array(z.number().int())
    .optional()
    .describe("Area ids → searchWithMultipleAreas"),
  userID: z.string().optional().describe("Filter by seller user id"),
  detail: detailSchema,
});

type SearchArgs = z.infer<typeof searchFiltersSchema>;

function toOldSearchParams(args: SearchArgs): OldSearchParams {
  const filters: OldSearchParams = {};
  if (args.q !== undefined) filters.q = args.q;
  if (args.search_cat !== undefined) filters.search_cat = args.search_cat;
  if (args.page !== undefined) filters.pg = String(args.page);
  if (args.sortby !== undefined) filters.sortby = args.sortby;
  if (args.type !== undefined) filters.type = args.type;
  if (args.seller_type !== undefined) filters.seller_type = args.seller_type;
  if (args.condition !== undefined) filters.condition = args.condition;
  if (args.only_photos) filters.only_photos = "1";
  if (args.rs_min_price !== undefined) filters.rs_min_price = args.rs_min_price;
  if (args.rs_max_price !== undefined) filters.rs_max_price = args.rs_max_price;
  if (args.rs_min_year !== undefined) filters.rs_min_year = args.rs_min_year;
  if (args.rs_max_year !== undefined) filters.rs_max_year = args.rs_max_year;
  if (args.nearby_lat !== undefined) filters.nearby_lat = args.nearby_lat;
  if (args.nearby_lon !== undefined) filters.nearby_lon = args.nearby_lon;
  if (args.nearby_range !== undefined) filters.nearby_range = args.nearby_range;
  if (args.userID !== undefined) filters.userID = args.userID;
  return filters;
}

async function runSearch(
  api: AdvertsApi,
  args: SearchArgs
): Promise<OldSearchResponse> {
  const filters = toOldSearchParams(args);
  if (args.areaIds?.length) {
    return api.searchWithMultipleAreas(filters, args.areaIds);
  }
  if (args.countyIds?.length) {
    return api.searchWithMultipleCounties(
      filters,
      args.countyIds.map(String)
    );
  }
  return api.search(filters);
}

/** Build the Adverts MCP server — search-first + optional auth. */
export function createServer(
  api: AdvertsApi = createAdvertsClient()
): McpServer {
  const server = new McpServer({ name: "adverts", version: "1.0.0" });

  const searchBlurb =
    "detail defaults to standard (compact card). Use get_counties/get_areas for ids, get_refine_options for category filters, get_price_facets for price buckets.";

  server.registerTool(
    "search_ads",
    {
      title: "Search Adverts.ie ads",
      description: `Browse/search ads on Adverts.ie (legacy search.json). ${searchBlurb}`,
      annotations: readOnly,
      inputSchema: searchFiltersSchema,
    },
    async (args) => {
      try {
        const envelope = await runSearch(api, args);
        return ok(projectSearch(envelope, args.detail));
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "get_refine_options",
    {
      title: "Adverts refine options",
      description:
        "Category refine catalog (type / seller_type / condition / …) for building search_ads filters.",
      annotations: readOnly,
      inputSchema: z.object({
        categoryId: z.number().int().describe("Category id"),
      }),
    },
    async ({ categoryId }) => {
      try {
        return ok(await api.getRefineOptions(categoryId));
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "get_price_facets",
    {
      title: "Adverts price facets",
      description:
        "Price buckets for the current filter bag (same params as search_ads, no detail).",
      annotations: readOnly,
      inputSchema: searchFiltersSchema.omit({ detail: true }),
    },
    async (args) => {
      try {
        const filters: Record<string, unknown> = {
          ...toOldSearchParams({ ...args, detail: "standard" }),
        };
        if (args.areaIds?.length) {
          filters["areaID[]"] = args.areaIds.map(String);
        }
        if (args.countyIds?.length) {
          filters["countyID[]"] = args.countyIds.map(String);
        }
        return ok(await api.getPriceFacets(filters as OldSearchParams));
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "get_counties",
    {
      title: "List Adverts counties",
      description: "County id/name list for search_ads countyIds.",
      annotations: readOnly,
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const res = await api.getCounties("county");
        return ok({
          status: res.status,
          counties: res.response.map((c) => ({ id: c.id, name: c.name })),
        });
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "get_areas",
    {
      title: "List Adverts areas",
      description: "Areas for a county — use as search_ads areaIds.",
      annotations: readOnly,
      inputSchema: z.object({
        countyId: z.number().int().describe("County id from get_counties"),
      }),
    },
    async ({ countyId }) => {
      try {
        const res = await api.getAreas("area", countyId);
        return ok({
          status: res.status,
          areas: res.response.map((a) => ({ id: a.id, name: a.name })),
        });
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "get_ad",
    {
      title: "Get Adverts ad details",
      description:
        "Full ad by id (legacy advert.json). Prefer after search_ads. detail defaults to standard.",
      annotations: readOnly,
      inputSchema: z.object({
        id: z.number().int().positive().describe("Ad id"),
        detail: detailSchema,
        includeComments: z
          .boolean()
          .optional()
          .describe("When true, request comments (default false)"),
      }),
    },
    async ({ id, detail, includeComments }) => {
      try {
        const showComments = includeComments ? 1 : 0;
        const res = await api.getAdDetails(
          id,
          showComments,
          1,
          includeComments ? 10 : 0,
          1,
          640,
          480
        );
        return ok(projectAdDetails(res, detail));
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "get_discover",
    {
      title: "Adverts discover sections",
      description: "Home discover carousels for a lat/lon.",
      annotations: readOnly,
      inputSchema: z.object({
        latitude: z.string().describe('e.g. "53.35"'),
        longitude: z.string().describe('e.g. "-6.26"'),
      }),
    },
    async ({ latitude, longitude }) => {
      try {
        return ok(await api.getDiscoverSections(latitude, longitude));
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "get_app_config",
    {
      title: "Adverts app config",
      description: "Feature flags from GET app/config.",
      annotations: readOnly,
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return ok(await api.getAppConfig());
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "auth_login",
    {
      title: "Log in to Adverts",
      description:
        "Optional email/password login for authenticated actions. Search works without login. May need recaptchaToken (Android sends one). Does not return raw tokens.",
      inputSchema: z.object({
        username: z.string().min(1).describe("Adverts email or username"),
        password: z.string().min(1).describe("Account password"),
        recaptchaToken: z
          .string()
          .optional()
          .describe("X-Recaptcha-Token when required"),
      }),
    },
    async ({ username, password, recaptchaToken }) => {
      try {
        await api.login(username, password, recaptchaToken);
        sessionUsernames.set(api, username);
        return ok({ ok: true, ...authSnapshot(api) });
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "auth_status",
    {
      title: "Adverts auth status",
      description:
        "Whether this MCP session has an Adverts access token. Never returns raw tokens.",
      annotations: readOnly,
      inputSchema: z.object({}),
    },
    async () => ok(authSnapshot(api))
  );

  server.registerTool(
    "auth_logout",
    {
      title: "Log out of Adverts",
      description: "Clear access token from this MCP process and token file.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        api.clearTokens();
        sessionUsernames.delete(api);
        return ok({ ok: true, ...authSnapshot(api) });
      } catch (err) {
        api.clearTokens();
        sessionUsernames.delete(api);
        return toolError(err);
      }
    }
  );

  return server;
}
