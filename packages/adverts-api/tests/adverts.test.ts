import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { AdvertsApi, ApiError } from "../src/adverts";

/** Fixture keys (production values live in ADVERTS_*_API_KEY env). */
const TEST_NEW_API_KEY = "test-new-api-key";
const TEST_OLD_API_KEY = "test-old-api-key";

const mockAppConfig = {
  skip_enabled: true,
  show_recently_viewed_ads: true,
  show_discover_content: true,
  show_category_search: false,
};

const mockDiscover = [
  {
    id: "nearby",
    type: "carousel",
    title: "Ads near Temple Bar, Dublin",
    search_path: "/for-sale/location_53.35_-6.26_2/",
    view_more: true,
    ads: [
      {
        ad_id: 40765276,
        title: "kitchen cabinet",
        main_image: "https://media.adverts.ie/example.jpg",
        price: "&euro;14",
        type: "offered",
        subtype: "none",
      },
    ],
  },
];

const mockAdvert = {
  ad_id: 40765276,
  title: "kitchen cabinet",
  category: { id: 159, name: "Home & Garden" },
  media: [],
  ad_status: "published",
};

const mockSearchAds = {
  ads: [{ ad_id: 40765276, title: "kitchen cabinet", price: "&euro;14" }],
};

function jsonResponse(body: object | string | null, status = 200): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

describe("@adverts-ie/api fresh (new.api.adverts.ie)", () => {
  let api: AdvertsApi;
  let fetchFn: ReturnType<typeof mock>;
  let lastUrl = "";
  let lastInit: RequestInit | undefined;

  beforeEach(() => {
    fetchFn = mock((url: string, init?: RequestInit) => {
      lastUrl = String(url);
      lastInit = init;
      if (url.includes("/app/config")) return Promise.resolve(jsonResponse(mockAppConfig));
      if (url.includes("/discover")) return Promise.resolve(jsonResponse(mockDiscover));
      if (url.includes("/search/ads")) return Promise.resolve(jsonResponse(mockSearchAds));
      if (url.includes("/advert/")) return Promise.resolve(jsonResponse(mockAdvert));
      if (url.includes("/categories"))
        return Promise.resolve(jsonResponse([{ id: 1, name: "Test" }]));
      if (url.includes("search.json"))
        return Promise.resolve(
          jsonResponse({
            status: 1,
            response: {
              pagination: { total_results: 10, current_page: 1 },
              items: [],
            },
          })
        );
      return Promise.resolve(jsonResponse({ error: "not found" }, 404));
    });
    api = new AdvertsApi({
      fetchFn: fetchFn as typeof fetch,
      newApiKey: TEST_NEW_API_KEY,
      oldApiKey: TEST_OLD_API_KEY,
      appVersionCode: "1001176",
      appVersionName: "1.91.3",
    });
  });

  afterEach(() => {
    lastUrl = "";
    lastInit = undefined;
  });

  it("getAppConfig hits NEW host with API key and Accept version", async () => {
    const result = await api.getAppConfig();
    expect(result).toEqual(mockAppConfig);
    expect(lastUrl).toStartWith("https://new.api.adverts.ie/app/config");
    expect(lastInit?.headers).toMatchObject({
      "X-Adverts-Api-Key": TEST_NEW_API_KEY,
      Accept: "application/json; version=9",
      "X-App-Platform": "android",
      "x-app-version": "1001176",
    });
  });

  it("getDiscoverSections returns carousel ads with ad_id/title/price", async () => {
    const result = await api.getDiscoverSections("53.35", "-6.26");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("nearby");
    expect(result[0].ads?.[0].ad_id).toBe(40765276);
    expect(result[0].ads?.[0].title).toBe("kitchen cabinet");
    expect(result[0].ads?.[0].price).toContain("euro");
    expect(lastUrl).toContain("lat=53.35");
    expect(lastUrl).toContain("lng=-6.26");
  });

  it("getAdvert returns ad_id and title from fresh API", async () => {
    const result = await api.getAdvert(40765276);
    expect(result.ad_id).toBe(40765276);
    expect(result.title).toBe("kitchen cabinet");
    expect(result.ad_status).toBe("published");
    expect(lastUrl).toBe("https://new.api.adverts.ie/advert/40765276");
  });

  it("getSearchResultAds sends ids[] on NEW search/ads", async () => {
    const result = await api.getSearchResultAds([40765276]);
    expect(result.ads).toHaveLength(1);
    expect(result.ads?.[0].ad_id).toBe(40765276);
    expect(lastUrl).toContain("https://new.api.adverts.ie/search/ads");
    expect(lastUrl).toContain("ids");
    expect(lastUrl).toContain("40765276");
  });

  it("sets Basic adverts: token auth on NEW requests when logged in", async () => {
    api.setToken("test-token-123");
    await api.getAppConfig();
    const expected = `Basic ${Buffer.from("adverts:test-token-123", "utf8").toString("base64")}`;
    expect(lastInit?.headers).toMatchObject({ Authorization: expected });
  });

  it("legacy search.json uses OLD host + api_key (not primary)", async () => {
    const result = await api.search({ q: "iphone", pg: "1" });
    expect(result.status).toBe(1);
    expect(result.response?.pagination?.total_results).toBe(10);
    expect(lastUrl).toStartWith("https://api.adverts.ie/search.json");
    expect(lastUrl).toContain(`api_key=${TEST_OLD_API_KEY}`);
    expect(lastInit?.headers).not.toMatchObject({
      "X-Adverts-Api-Key": TEST_NEW_API_KEY,
    });
  });

  it("surfaces ApiError with body for non-2xx", async () => {
    fetchFn.mockImplementation(() =>
      Promise.resolve(jsonResponse({ message: "nope" }, 403))
    );
    try {
      await api.getAppConfig();
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      if (!(err instanceof ApiError)) throw err;
      expect(err.status).toBe(403);
      expect(err.body).toEqual({ message: "nope" });
    }
  });
});
