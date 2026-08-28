import { describe, it, expect, mock, beforeEach, afterEach, beforeAll } from "bun:test";
import { appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { DaftApi } from "../src/daft";
import { ROOM_TYPES } from "../src/types";
import type {
  SearchResponse,
  PropertyDetailsResponse,
  ClassifiedAreasResponse,
  TokenResponse,
} from "../src/types";

/** Production value lives in DAFT_CLIENT_ID (root .env). */
process.env.DAFT_CLIENT_ID ??= "daft-android-v2";

const LOG_DIR = "tests/logs";
const RESPONSE_LOG = "tests/logs/test.log";
mkdirSync(LOG_DIR, { recursive: true });

function logResponse(response: unknown) {
  appendFileSync(RESPONSE_LOG, JSON.stringify(response) + "\n");
}

// ------------------------------------------------------------
// Real-shaped mock data (matching the production API responses)
// ------------------------------------------------------------

const mockSearchResponse: SearchResponse = {
  listings: [
    {
      listing: {
        id: 1234567,
        title: "2 Bed Apartment in Dublin 4",
        seoTitle: "2 Bed Apartment in Dublin 4",
        price: "€350,000",
        numBedrooms: "2 Bed",
        propertyType: "apartments",
        seller: {
          sellerId: 9876,
          name: "Smith Properties",
          branch: "Dublin Office",
        },
        point: { type: "Point", coordinates: [-6.2554, 53.3249] },
        seoFriendlyPath:
          "/for-sale/apartment-123-example-street-dublin-4/1234567",
        media: {
          images: [{ url: "https://img.daft.ie/1234567/thumb.jpg" }],
        },
        publishDate: 1705311000,
        featuredLevel: "BASIC",
      },
    },
  ],
  paging: {
    totalPages: 10,
    currentPage: 1,
    totalResults: 185,
    displayingFrom: 1,
    displayingTo: 20,
  },
};

const mockClassifiedAreas: ClassifiedAreasResponse = {
  counties: [{ id: "1", displayName: "Dublin", displayValue: "dublin" }],
  cities: [{ id: "33", displayName: "Dublin City", displayValue: "dublin-city" }],
  colleges: [],
  areas: [],
};

const mockPropertyDetails: PropertyDetailsResponse = {
  listing: mockSearchResponse.listings[0].listing,
};

const mockTokenResponse: TokenResponse = {
  access_token: "mock-access-token-123",
  expires_in: 300,
  refresh_expires_in: 1800,
  refresh_token: "mock-refresh-token-456",
  token_type: "Bearer",
  scope: "openid offline_access dapi",
};

// ------------------------------------------------------------
// Mock fetch helpers
// ------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => {
      logResponse(body);
      return Promise.resolve(body);
    },
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

type FetchCall = [url: string, options: RequestInit];

function lastCall(fetchFn: ReturnType<typeof mock>): FetchCall {
  const calls = fetchFn.mock.calls as unknown as FetchCall[];
  return calls[calls.length - 1];
}

/** Dispatch mock fetch by URL so different endpoints return real-shaped data. */
function routeFetch(url: string, _options: RequestInit) {
  if (url.includes("/old/v1/location/classifiedAreas")) {
    return Promise.resolve(jsonResponse(mockClassifiedAreas));
  }
  if (url.includes("/old/v1/listings")) {
    return Promise.resolve(jsonResponse(mockSearchResponse));
  }
  if (url.includes("/api/v3/ads/listing/")) {
    return Promise.resolve(jsonResponse(mockPropertyDetails));
  }
  if (url.includes("/old/v1/filters/autocomplete/areas")) {
    return Promise.resolve(jsonResponse([mockClassifiedAreas.counties[0]]));
  }
  if (url.includes("/old/v1/autocomplete")) {
    return Promise.resolve(jsonResponse([mockClassifiedAreas.counties[0]]));
  }
  if (url.includes("/api/v1/locations/autocomplete")) {
    return Promise.resolve(
      jsonResponse([{ latitude: 53.32, longitude: -6.26, address: ["Dublin"] }])
    );
  }
  if (url.includes("/auth/realms/daft/protocol/openid-connect/token")) {
    return Promise.resolve(jsonResponse(mockTokenResponse));
  }
  if (url.includes("/old/v1/report/reasons")) {
    return Promise.resolve(
      jsonResponse([{ id: 1, title: "Fraudulent", text: "This ad is fraudulent" }])
    );
  }
  if (url.includes("/api/v1/locations/areas/")) {
    return Promise.resolve(
      jsonResponse({ daftAreaId: "1", allianzAreaId: "999" })
    );
  }
  if (url.includes("/api/v1/users/my-properties")) {
    return Promise.resolve(jsonResponse([]));
  }
  if (url.includes("/api/v1/users/")) {
    return Promise.resolve(
      jsonResponse({
        userId: 5821124,
        legacyId: 5821124,
        username: "testuser-1689163863",
        name: "Test User",
        email: "user@example.com",
      })
    );
  }
  if (url.includes("/api/v2/saved-ads/")) {
    return Promise.resolve(
      jsonResponse({
        savedListings: [],
        paging: {
          totalPages: 1,
          currentPage: 1,
          displayingFrom: 0,
          displayingTo: 0,
          totalResults: 0,
        },
      })
    );
  }
  if (url.includes("/api/v1/forms/enquiry/")) {
    return Promise.resolve(
      jsonResponse({
        firstName: "Test",
        lastName: "User",
        email: "user@example.com",
        message: "",
        enquired: false,
      })
    );
  }
  if (url.includes("/api/v3/enquiries")) {
    return Promise.resolve(
      jsonResponse({
        adTitle: "2 Bed Apartment in Dublin 4",
        replies: [],
        pagination: { totalResults: 0, totalPages: 1, pageNumber: 1, pageSize: 20 },
      })
    );
  }
  if (url.includes("/old/v4/reply")) {
    return Promise.resolve(jsonResponse(null, 201));
  }
  return Promise.resolve(jsonResponse({}));
}

function makeClient(fetchFn: ReturnType<typeof mock>): DaftApi {
  return new DaftApi({
    fetchFn: fetchFn as unknown as typeof fetch,
    platform: "android",
    appVersion: "9.8.1",
  });
}

describe("DaftApi", () => {
  let fetchFn: ReturnType<typeof mock>;
  let daft: DaftApi;

  beforeAll(() => {
    writeFileSync(RESPONSE_LOG, "");
  });

  beforeEach(() => {
    fetchFn = mock((url: string, options: RequestInit) => routeFetch(url, options));
    daft = makeClient(fetchFn);
  });

  afterEach(() => {
    fetchFn.mockRestore();
  });

  describe("constructor", () => {
    it("should create instance with default options", () => {
      const client = new DaftApi();
      expect(client).toBeDefined();
    });

    it("should create instance with custom options", () => {
      const client = new DaftApi({
        baseUrl: "https://custom.api.com",
        timeout: 5000,
        headers: { "x-custom": "value" },
      });
      expect(client).toBeDefined();
    });

    it("should resolve clientId from DAFT_CLIENT_ID", () => {
      const client = new DaftApi({});
      expect(client).toBeDefined();
    });

    it("should throw when clientId and DAFT_CLIENT_ID are missing", () => {
      const prev = process.env.DAFT_CLIENT_ID;
      delete process.env.DAFT_CLIENT_ID;
      try {
        expect(() => new DaftApi({})).toThrow(/DAFT_CLIENT_ID/);
      } finally {
        if (prev === undefined) delete process.env.DAFT_CLIENT_ID;
        else process.env.DAFT_CLIENT_ID = prev;
      }
    });
  });

  describe("search", () => {
    it("should make POST request to correct endpoint", async () => {
      await daft.search({ section: "residential-for-sale" });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, options] = lastCall(fetchFn);
      expect(url).toBe("https://gateway.daft.ie/old/v1/listings");
      expect(options.method).toBe("POST");
    });

    it("should include android-style headers", async () => {
      await daft.search({ section: "residential-for-sale" });

      const [, options] = lastCall(fetchFn);
      expect(options.headers).toMatchObject({
        "Content-Type": "application/json",
        brand: "daft",
        platform: "android",
        app_version: "9.8.1",
        "User-Agent": "daft/9.8.1/AndroidVersion/15",
      });
    });

    it("should send correct payload", async () => {
      await daft.search({
        section: "residential-to-rent",
        ranges: [{ name: "numBeds", from: 2, to: 3 }],
        paging: { from: "0", pageSize: "20" },
      });

      const [, options] = lastCall(fetchFn);
      const body = JSON.parse(options.body as string);
      expect(body).toMatchObject({
        section: "residential-to-rent",
        ranges: [{ name: "numBeds", from: 2, to: 3 }],
        paging: { from: "0", pageSize: "20" },
      });
    });

    it("should return parsed response", async () => {
      const result = await daft.search({ section: "residential-for-sale" });
      expect(result).toEqual(mockSearchResponse);
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0].listing.price).toBe("€350,000");
      expect(result.paging.totalResults).toBe(185);
    });
  });

  describe("search helpers", () => {
    it("ROOM_TYPES matches verified roomType filter values", () => {
      expect(ROOM_TYPES).toEqual(["single", "double", "twin", "shared"]);
    });

    it("searchForSale: resolves county to storedShapeIds and searches", async () => {
      const result = await daft.searchForSale({ county: "dublin" });

      expect(result.listings).toHaveLength(1);
      expect(fetchFn).toHaveBeenCalledTimes(2);

      const [, options] = lastCall(fetchFn);
      const body = JSON.parse(options.body as string);
      expect(body.section).toBe("residential-for-sale");
      expect(body.geoFilter).toEqual({
        storedShapeIds: ["1"],
        name: "dublin",
        geoSearchType: "STORED_SHAPES",
      });
    });

    it("searchForSale: includes price range", async () => {
      await daft.searchForSale({ minPrice: 200000, maxPrice: 400000 });

      const [, options] = lastCall(fetchFn);
      const body = JSON.parse(options.body as string);
      expect(body.ranges).toContainEqual(
        expect.objectContaining({ name: "salePrice" })
      );
    });

    it("searchForRent: uses rentalPrice for price range", async () => {
      await daft.searchForRent({ minPrice: 1500, maxPrice: 2500 });

      const [, options] = lastCall(fetchFn);
      const body = JSON.parse(options.body as string);
      expect(body.ranges).toContainEqual(
        expect.objectContaining({ name: "rentalPrice" })
      );
    });

    it("searchForRent: uses correct section", async () => {
      await daft.searchForRent({ county: "dublin" });
      const [, options] = lastCall(fetchFn);
      expect(JSON.parse(options.body as string).section).toBe(
        "residential-to-rent"
      );
    });

    it("searchForSharing: uses correct section", async () => {
      await daft.searchForSharing({ county: "dublin" });
      const [, options] = lastCall(fetchFn);
      expect(JSON.parse(options.body as string).section).toBe("sharing");
    });

    it("searchCommercialForSale: uses correct section", async () => {
      await daft.searchCommercialForSale({ county: "dublin" });
      const [, options] = lastCall(fetchFn);
      expect(JSON.parse(options.body as string).section).toBe(
        "commercial-for-sale"
      );
    });

    it("searchCommercialForRent: uses correct section", async () => {
      await daft.searchCommercialForRent({ county: "dublin" });
      const [, options] = lastCall(fetchFn);
      expect(JSON.parse(options.body as string).section).toBe(
        "commercial-to-rent"
      );
    });

    it("searchNewDevelopments: uses correct section", async () => {
      await daft.searchNewDevelopments({ county: "dublin" });
      const [, options] = lastCall(fetchFn);
      expect(JSON.parse(options.body as string).section).toBe("new-homes");
    });

    it("searchForSale: includes beds range", async () => {
      await daft.searchForSale({ minBeds: 2, maxBeds: 4 });
      const [, options] = lastCall(fetchFn);
      const body = JSON.parse(options.body as string);
      expect(body.ranges).toContainEqual(
        expect.objectContaining({ name: "numBeds", from: 2, to: 4 })
      );
    });

    it("searchForSale: includes property type filters", async () => {
      await daft.searchForSale({ propertyTypes: ["apartments", "houses"] });
      const [, options] = lastCall(fetchFn);
      const body = JSON.parse(options.body as string);
      expect(body.filters).toContainEqual(
        expect.objectContaining({
          name: "propertyType",
          values: ["apartments", "houses"],
        })
      );
    });

    it("searchForSale: includes facility AND-filter", async () => {
      await daft.searchForSale({ facilities: ["parking", "alarm"] });
      const [, options] = lastCall(fetchFn);
      const body = JSON.parse(options.body as string);
      expect(body.andFilters).toContainEqual(
        expect.objectContaining({
          name: "facilities",
          values: ["parking", "alarm"],
        })
      );
    });

    it("searchForSharing: includes roomType filters", async () => {
      await daft.searchForSharing({ roomTypes: ["double", "single"] });
      const [, options] = lastCall(fetchFn);
      const body = JSON.parse(options.body as string);
      expect(body.filters).toContainEqual(
        expect.objectContaining({
          name: "roomType",
          values: ["double", "single"],
        })
      );
    });

    it("searchForSale: includes terms", async () => {
      await daft.searchForSale({ terms: "sea view" });
      const [, options] = lastCall(fetchFn);
      expect(JSON.parse(options.body as string).terms).toBe("sea view");
    });

    it("searchForSale: normalizes legacy sort aliases", async () => {
      await daft.searchForSale({ sort: "dateDesc" });
      const [, options] = lastCall(fetchFn);
      expect(JSON.parse(options.body as string).sort).toBe("publishDateDesc");
    });

    it("searchForSale: handles pagination", async () => {
      await daft.searchForSale({ page: 3, pageSize: 50 });
      const [, options] = lastCall(fetchFn);
      expect(JSON.parse(options.body as string).paging).toEqual({
        from: "100",
        pageSize: "50",
      });
    });

    it("searchForSale: explicit geoFilter takes precedence over county", async () => {
      await daft.searchForSale({
        county: "dublin",
        geoFilter: {
          storedShapeIds: ["4090"],
          geoSearchType: "STORED_SHAPES",
        },
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [, options] = lastCall(fetchFn);
      expect(JSON.parse(options.body as string).geoFilter).toEqual({
        storedShapeIds: ["4090"],
        geoSearchType: "STORED_SHAPES",
      });
    });
  });

  describe("resolveAreaIds", () => {
    it("should resolve a county name to stored shape ids", async () => {
      const ids = await daft.resolveAreaIds("dublin");
      expect(ids).toEqual(["1"]);
    });

    it("should resolve displayValue names", async () => {
      const ids = await daft.resolveAreaIds("dublin-city");
      expect(ids).toEqual(["33"]);
    });

    it("should return undefined for unknown areas", async () => {
      const ids = await daft.resolveAreaIds("atlantis");
      expect(ids).toBeUndefined();
    });
  });

  describe("searchAllPages", () => {
    it("should fetch multiple pages", async () => {
      const multiPageResponse: SearchResponse = {
        ...mockSearchResponse,
        paging: { ...mockSearchResponse.paging, totalPages: 3 },
      };

      const multiFetch = mock((url: string, options: RequestInit) =>
        Promise.resolve(jsonResponse(multiPageResponse))
      );
      const multiDaft = makeClient(multiFetch);

      const allListings = await multiDaft.searchAllPages(
        (page) => multiDaft.search({ section: "residential-for-sale", paging: { from: String(page), pageSize: "20" } }),
        3
      );

      expect(multiFetch).toHaveBeenCalledTimes(3);
      expect(allListings).toHaveLength(3);
    });

    it("should stop when no more pages", async () => {
      const lastPageResponse: SearchResponse = {
        ...mockSearchResponse,
        paging: { ...mockSearchResponse.paging, totalPages: 1, currentPage: 1 },
      };

      const lastFetch = mock((url: string, options: RequestInit) =>
        Promise.resolve(jsonResponse(lastPageResponse))
      );
      const lastDaft = makeClient(lastFetch);

      const allListings = await lastDaft.searchAllPages(
        (page) => lastDaft.search({ section: "residential-for-sale", paging: { from: String(page), pageSize: "20" } }),
        10
      );

      expect(lastFetch).toHaveBeenCalledTimes(1);
      expect(allListings).toHaveLength(1);
    });
  });

  describe("property details", () => {
    it("getPropertyDetails: hits correct endpoint", async () => {
      const result = await daft.getPropertyDetails(1234567);
      const [url] = lastCall(fetchFn);
      expect(url).toBe("https://gateway.daft.ie/api/v3/ads/listing/1234567");
      expect(result.listing.id).toBe(1234567);
    });
  });

  describe("public endpoints", () => {
    it("getClassifiedAreas: returns counties", async () => {
      const result = await daft.getClassifiedAreas();
      expect(result.counties).toHaveLength(1);
    });

    it("getAutoCompleteAreas: returns areas", async () => {
      const result = await daft.getAutoCompleteAreas();
      expect(result[0].id).toBe("1");
    });

    it("autocomplete: POSTs text body", async () => {
      await daft.autocomplete("dubl");
      const [, options] = lastCall(fetchFn);
      expect(JSON.parse(options.body as string)).toEqual({ text: "dubl" });
    });

    it("getColleges: POSTs text body", async () => {
      await daft.getColleges("trinity");
      const [, options] = lastCall(fetchFn);
      expect(JSON.parse(options.body as string)).toEqual({ text: "trinity" });
    });

    it("getLocationAutocomplete: uses query param", async () => {
      await daft.getLocationAutocomplete("dublin");
      const [url] = lastCall(fetchFn);
      expect(url).toContain("/api/v1/locations/autocomplete?query=dublin");
    });

    it("getReportReasons: returns reasons", async () => {
      const result = await daft.getReportReasons();
      expect(result[0].title).toBe("Fraudulent");
    });

    it("getAreaMapping: returns mapping", async () => {
      const result = await daft.getAreaMapping(1);
      expect(result.allianzAreaId).toBe("999");
    });
  });

  describe("auth", () => {
    it("setToken: adds Authorization header", async () => {
      daft.setToken("bearer-token");
      await daft.getUserInfo(5821124);
      const [, options] = lastCall(fetchFn);
      expect(options.headers).toMatchObject({
        Authorization: "Bearer bearer-token",
      });
    });

    it("getToken: returns the set token", () => {
      daft.setToken("abc");
      expect(daft.getToken()).toBe("abc");
    });

    it("getUserInfo: hits /api/v1/users/{userId}", async () => {
      daft.setToken("t");
      const result = await daft.getUserInfo(5821124);
      const [url] = lastCall(fetchFn);
      expect(url).toBe("https://gateway.daft.ie/api/v1/users/5821124");
      expect(result.userId).toBe(5821124);
    });

    it("getSavedAds: sends pageSize and from query params", async () => {
      daft.setToken("t");
      await daft.getSavedAds(5821124, { pageSize: 20, from: 0 });
      const [url] = lastCall(fetchFn);
      expect(url).toBe(
        "https://gateway.daft.ie/api/v2/saved-ads/5821124?pageSize=20&from=0"
      );
    });

    it("getSavedReply: hits forms/enquiry endpoint", async () => {
      daft.setToken("t");
      const result = await daft.getSavedReply(1234567);
      const [url] = lastCall(fetchFn);
      expect(url).toBe(
        "https://gateway.daft.ie/api/v1/forms/enquiry/1234567"
      );
      expect(result.firstName).toBe("Test");
    });

    it("getEnquiries: sends adId query param", async () => {
      daft.setToken("t");
      await daft.getEnquiries(1234567, 2);
      const [url] = lastCall(fetchFn);
      expect(url).toBe(
        "https://gateway.daft.ie/api/v3/enquiries?adId=1234567&pageNumber=2"
      );
    });

    it("getMyProperties: returns properties array", async () => {
      daft.setToken("t");
      const result = await daft.getMyProperties();
      expect(result).toEqual([]);
    });

    it("login: sends password grant via form-encoded body", async () => {
      const loginClient = new DaftApi({ fetchFn: fetchFn as unknown as typeof fetch });
      const token = await loginClient.login("user", "pass");

      const [url, options] = lastCall(fetchFn);
      expect(url).toBe(
        "https://auth.daft.ie/auth/realms/daft/protocol/openid-connect/token"
      );
      const form = new URLSearchParams(options.body as string);
      expect(form.get("grant_type")).toBe("password");
      expect(form.get("client_id")).toBe("daft-android-v2");
      expect(form.get("username")).toBe("user");
      expect(form.get("password")).toBe("pass");
      expect(form.get("scope")).toBe("openid offline_access dapi");
      expect(loginClient.getToken()).toBe(token.access_token);
    });

    it("login: falls back when Keycloak 500s on dapi scope", async () => {
      const calls: FetchCall[] = [];
      const flakyFetch = mock((url: string, options: RequestInit) => {
        calls.push([url, options]);
        const form = new URLSearchParams(options.body as string);
        if (form.get("scope")?.includes("dapi")) {
          return Promise.resolve(
            jsonResponse(
              {
                error: "unknown_error",
                error_description: "For more on this error consult the server log.",
              },
              500
            )
          );
        }
        return Promise.resolve(jsonResponse(mockTokenResponse));
      });
      const loginClient = new DaftApi({
        fetchFn: flakyFetch as unknown as typeof fetch,
      });
      const token = await loginClient.login("user", "pass");
      expect(calls.length).toBe(2);
      expect(
        new URLSearchParams(calls[0][1].body as string).get("scope")
      ).toBe("openid offline_access dapi");
      expect(
        new URLSearchParams(calls[1][1].body as string).get("scope")
      ).toBe("openid offline_access");
      expect(loginClient.getToken()).toBe(token.access_token);
    });

    it("login: notifies onTokensChange with access and refresh", async () => {
      const snapshots: unknown[] = [];
      const loginClient = new DaftApi({
        fetchFn: fetchFn as unknown as typeof fetch,
        onTokensChange: (t) => snapshots.push(t),
      });
      await loginClient.login("user", "pass");
      expect(snapshots).toEqual([
        {
          accessToken: "mock-access-token-123",
          refreshToken: "mock-refresh-token-456",
        },
      ]);
    });

    it("refreshToken: sends refresh_token grant and stores access token", async () => {
      const refreshClient = new DaftApi({ fetchFn: fetchFn as unknown as typeof fetch });
      const token = await refreshClient.refreshToken("old-refresh");

      const [, options] = lastCall(fetchFn);
      const form = new URLSearchParams(options.body as string);
      expect(form.get("grant_type")).toBe("refresh_token");
      expect(form.get("client_id")).toBe("daft-android-v2");
      expect(form.get("refresh_token")).toBe("old-refresh");
      expect(refreshClient.getToken()).toBe("mock-access-token-123");
    });

    it("logout: calls the Keycloak logout endpoint", async () => {
      const logoutClient = new DaftApi({ fetchFn: fetchFn as unknown as typeof fetch });
      await logoutClient.logout("refresh-token", "user");

      const [url, options] = lastCall(fetchFn);
      expect(url).toBe(
        "https://auth.daft.ie/auth/realms/daft/protocol/openid-connect/logout"
      );
      const form = new URLSearchParams(options.body as string);
      expect(form.get("grant_type")).toBe("refresh_token");
      expect(form.get("refresh_token")).toBe("refresh-token");
    });
  });

  describe("error handling", () => {
    it("should throw ApiError with status on HTTP error", async () => {
      const errorFetch = mock((url: string, options: RequestInit) =>
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          text: () => Promise.resolve("{\"error\":\"nope\"}"),
          json: () => Promise.resolve({ error: "nope" }),
        } as unknown as Response)
      );
      const errorDaft = makeClient(errorFetch);

      await expect(
        errorDaft.search({ section: "residential-for-sale" })
      ).rejects.toMatchObject({
        status: 403,
        method: "POST",
      });
    });

    it("should include the response body in the error message", async () => {
      const errorFetch = mock((url: string, options: RequestInit) =>
        Promise.resolve({
          ok: false,
          status: 422,
          statusText: "Unprocessable Entity",
          text: () => Promise.resolve("token is a required field"),
          json: () => Promise.resolve({}),
        } as unknown as Response)
      );
      const errorDaft = makeClient(errorFetch);

      await expect(
        errorDaft.search({ section: "residential-for-sale" })
      ).rejects.toThrow(/HTTP 422/);
    });

    it("should throw on network error", async () => {
      const networkErrorFetch = mock((url: string, options: RequestInit) =>
        Promise.reject(new Error("Network error"))
      );
      const networkDaft = makeClient(networkErrorFetch);

      await expect(
        networkDaft.search({ section: "residential-for-sale" })
      ).rejects.toThrow("Network error");
    });
  });

  describe("auto token refresh", () => {
    it("refreshes on 401 and retries with the new token", async () => {
      let userCalls = 0;
      const stateful = mock((url: string, options: RequestInit) => {
        if (url.includes("/auth/realms/daft/protocol/openid-connect/token")) {
          return Promise.resolve(
            jsonResponse({
              ...mockTokenResponse,
              access_token: "new-access-token",
              refresh_token: "new-refresh-token",
            })
          );
        }
        if (url.includes("/api/v1/users/")) {
          userCalls++;
          if (userCalls === 1) {
            return Promise.resolve({
              ok: false,
              status: 401,
              statusText: "Unauthorized",
              text: () => Promise.resolve("expired"),
              json: () => Promise.resolve({}),
            } as unknown as Response);
          }
          return Promise.resolve(jsonResponse({ userId: 1, name: "Retried" }));
        }
        return Promise.resolve(jsonResponse({}));
      });

      const client = new DaftApi({
        fetchFn: stateful as unknown as typeof fetch,
        refreshToken: "rotatable-refresh",
      });
      client.setToken("expired-token");

      const result = await client.getUserInfo(1);

      expect(result).toMatchObject({ userId: 1, name: "Retried" });
      expect(client.getToken()).toBe("new-access-token");

      // token request + 401 + retry
      const calls = stateful.mock.calls as unknown as FetchCall[];
      const tokenCall = calls.find(([u]) => u.includes("openid-connect/token"));
      expect(tokenCall).toBeDefined();
      const form = new URLSearchParams((tokenCall as [string, RequestInit])[1].body as string);
      expect(form.get("grant_type")).toBe("refresh_token");
      expect(form.get("refresh_token")).toBe("rotatable-refresh");

      const retry = calls[calls.length - 1];
      expect(retry[1].headers).toMatchObject({
        Authorization: "Bearer new-access-token",
      });
    });

    it("propagates 401 when no refresh token is configured", async () => {
      const errorFetch = mock((url: string, options: RequestInit) =>
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          text: () => Promise.resolve("expired"),
          json: () => Promise.resolve({}),
        } as unknown as Response)
      );
      const client = new DaftApi({ fetchFn: errorFetch as unknown as typeof fetch });
      client.setToken("stale");

      await expect(client.getUserInfo(1)).rejects.toMatchObject({ status: 401 });
      // 1st with bearer → 401; refresh unavailable → clear → 2nd anonymous → 401
      expect(errorFetch).toHaveBeenCalledTimes(2);
      expect(client.getToken()).toBeUndefined();
    });

    it("only retries once when the retry also returns 401", async () => {
      let userCalls = 0;
      const badRefresh = mock((url: string, options: RequestInit) => {
        if (url.includes("openid-connect/token")) {
          return Promise.resolve(
            jsonResponse({
              ...mockTokenResponse,
              access_token: "still-bad",
            })
          );
        }
        if (url.includes("/api/v1/users/")) {
          userCalls++;
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: "Unauthorized",
            text: () => Promise.resolve("expired"),
            json: () => Promise.resolve({}),
          } as unknown as Response);
        }
        return Promise.resolve(jsonResponse({}));
      });

      const client = new DaftApi({
        fetchFn: badRefresh as unknown as typeof fetch,
        refreshToken: "rotatable-refresh",
      });
      client.setToken("stale");

      await expect(client.getUserInfo(1)).rejects.toMatchObject({ status: 401 });
      expect(userCalls).toBe(2);
    });

    it("clears a dead refresh token and retries anonymously", async () => {
      let listingCalls = 0;
      const deadSession = mock((url: string) => {
        if (url.includes("/auth/realms/daft/protocol/openid-connect/token")) {
          return Promise.resolve({
            ok: false,
            status: 400,
            statusText: "Bad Request",
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  error: "invalid_grant",
                  error_description: "Offline user session not found",
                })
              ),
            json: () =>
              Promise.resolve({
                error: "invalid_grant",
                error_description: "Offline user session not found",
              }),
          } as unknown as Response);
        }
        if (url.includes("/old/v1/listings")) {
          listingCalls++;
          if (listingCalls === 1) {
            return Promise.resolve({
              ok: false,
              status: 401,
              statusText: "Unauthorized",
              text: () => Promise.resolve("expired"),
              json: () => Promise.resolve({}),
            } as unknown as Response);
          }
          return Promise.resolve(jsonResponse(mockSearchResponse));
        }
        return Promise.resolve(jsonResponse({}));
      });

      const client = new DaftApi({
        fetchFn: deadSession as unknown as typeof fetch,
        refreshToken: "dead-refresh",
        authToken: "expired-access",
      });

      const result = await client.search({
        section: "residential-to-rent",
        paging: { from: "0", pageSize: "1" },
      });
      expect(result.listings.length).toBeGreaterThan(0);
      expect(client.getToken()).toBeUndefined();
      expect(client.getRefreshToken()).toBeUndefined();
      expect(listingCalls).toBe(2);
    });
  });

  describe("custom options", () => {
    it("should use custom base URL", async () => {
      const customFetch = mock((url: string, options: RequestInit) =>
        Promise.resolve(jsonResponse(mockSearchResponse))
      );
      const customDaft = new DaftApi({
        baseUrl: "https://custom.api.com",
        fetchFn: customFetch as unknown as typeof fetch,
      });

      await customDaft.search({ section: "residential-for-sale" });
      const [url] = lastCall(customFetch);
      expect(url).toBe("https://custom.api.com/old/v1/listings");
    });

    it("should use custom headers", async () => {
      const customFetch = mock((url: string, options: RequestInit) =>
        Promise.resolve(jsonResponse(mockSearchResponse))
      );
      const customDaft = new DaftApi({
        headers: { "x-api-key": "test-key" },
        fetchFn: customFetch as unknown as typeof fetch,
      });

      await customDaft.search({ section: "residential-for-sale" });
      const [, options] = lastCall(customFetch);
      expect(options.headers).toMatchObject({ "x-api-key": "test-key" });
    });

    it("should use custom user agent", async () => {
      const customFetch = mock((url: string, options: RequestInit) =>
        Promise.resolve(jsonResponse(mockSearchResponse))
      );
      const customDaft = new DaftApi({
        userAgent: "CustomBot/1.0",
        fetchFn: customFetch as unknown as typeof fetch,
      });

      await customDaft.search({ section: "residential-for-sale" });
      const [, options] = lastCall(customFetch);
      expect(options.headers).toMatchObject({ "User-Agent": "CustomBot/1.0" });
    });

    it("should accept authToken in options", async () => {
      const customFetch = mock((url: string, options: RequestInit) =>
        Promise.resolve(jsonResponse({ userId: 1 }))
      );
      const customDaft = new DaftApi({
        authToken: "from-options",
        fetchFn: customFetch as unknown as typeof fetch,
      });

      await customDaft.getUserInfo(1);
      const [, options] = lastCall(customFetch);
      expect(options.headers).toMatchObject({
        Authorization: "Bearer from-options",
      });
    });
  });
});
