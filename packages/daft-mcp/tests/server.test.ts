import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { DaftApi } from "@daft-ie/api";
import type {
  ClassifiedAreasResponse,
  PropertyDetailsResponse,
  SearchResponse,
} from "@daft-ie/api";
import { createServer } from "../src/create-server";

process.env.DAFT_CLIENT_ID ??= "daft-android-v2";

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
        ber: { rating: "B2" },
        facilities: [
          { key: "parking", name: "Parking" },
          { key: "alarm", name: "Alarm" },
        ],
        featuredLevel: "FEATURED",
        featuredLevelFull: "FEATURED",
        platform: "android",
        point: { type: "Point", coordinates: [-6.2, 53.3] },
        seller: {
          sellerId: 9876,
          name: "Smith Properties",
          phone: "+353 1 919 8985",
          branch: "Dublin Office",
          sellerType: "BRANDED_AGENT",
          licenceNumber: "001806",
          profileImage: "https://cdn.example/seller.jpg",
          backgroundColour: "#fff",
        },
        media: { images: [{ size720x480: "https://cdn.example/big.jpg" }] },
        seoFriendlyPath: "/for-sale/apartment-example/1234567",
        publishDate: 1705311000,
      },
    },
    {
      listing: {
        id: 7654321,
        title: "1 Bed in Dublin 2",
        seoTitle: "1 Bed in Dublin 2",
        price: "€1,800",
        numBedrooms: "1 Bed",
        propertyType: "apartments",
        seller: {
          sellerId: 1111,
          name: "Private Landlord",
          sellerType: "PRIVATE_USER",
        },
        seoFriendlyPath: "/for-rent/apartment-example/7654321",
        publishDate: 1705312000,
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
} as SearchResponse;

const mockClassifiedAreas: ClassifiedAreasResponse = {
  counties: [{ id: "1", displayName: "Dublin", displayValue: "dublin" }],
  cities: [
    { id: "33", displayName: "Dublin City", displayValue: "dublin-city" },
  ],
  colleges: [],
  areas: [],
};

const mockPropertyDetailsById: Record<number, PropertyDetailsResponse> = {
  1234567: {
    listing: {
      ...mockSearchResponse.listings[0].listing,
      description: "Bright apartment near the canal",
      facilities: [{ key: "parking", name: "Parking" }],
      features: ["Parking", "Alarm"],
      addressDetails: {
        streetAddress: "Example Street",
        addressLocality: "Dublin 4",
        addressRegion: "Dublin",
      },
      areaName: "dublin-4-dublin",
      listingViews: 42,
    },
    canonicalUrl: "https://www.daft.ie/for-sale/apartment-example/1234567",
  },
  7654321: {
    listing: {
      ...mockSearchResponse.listings[1].listing,
      description: "Compact city centre flat",
      features: ["Furnished"],
      addressDetails: { streetAddress: "Dame Street" },
      areaName: "dublin-2-dublin",
    },
    canonicalUrl: "https://www.daft.ie/for-rent/apartment-example/7654321",
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function routeFetch(url: string, init?: RequestInit): Promise<Response> {
  if (url.includes("/auth/realms/daft/protocol/openid-connect/token")) {
    const body = typeof init?.body === "string" ? init.body : String(init?.body ?? "");
    const params = new URLSearchParams(body);
    if (params.get("grant_type") === "password") {
      if (
        params.get("username") === "user@example.com" &&
        params.get("password") === "good-pass."
      ) {
        // Minimal JWT payload: {"email":"user@example.com","preferred_username":"testuser","user_id":"5821124","exp":4102444800}
        const payload = Buffer.from(
          JSON.stringify({
            email: "user@example.com",
            preferred_username: "testuser",
            user_id: "5821124",
            exp: 4102444800,
          })
        ).toString("base64url");
        return Promise.resolve(
          jsonResponse({
            access_token: `hdr.${payload}.sig`,
            refresh_token: "mock-refresh-token",
            token_type: "Bearer",
            expires_in: 300,
            scope: "openid offline_access dapi",
          })
        );
      }
      return Promise.resolve(
        jsonResponse(
          { error: "invalid_grant", error_description: "Invalid user credentials" },
          401
        )
      );
    }
    return Promise.resolve(
      jsonResponse({ error: "unsupported_grant_type" }, 400)
    );
  }
  if (url.includes("/auth/realms/daft/protocol/openid-connect/logout")) {
    return Promise.resolve(jsonResponse({}));
  }
  if (url.includes("/old/v1/location/classifiedAreas")) {
    return Promise.resolve(jsonResponse(mockClassifiedAreas));
  }
  if (url.includes("/old/v1/listings")) {
    return Promise.resolve(jsonResponse(mockSearchResponse));
  }
  if (url.includes("/api/v3/ads/listing/")) {
    const id = Number(url.split("/").pop());
    const body = mockPropertyDetailsById[id];
    if (!body) {
      return Promise.resolve(jsonResponse({ message: "not found" }, 404));
    }
    return Promise.resolve(jsonResponse(body));
  }
  if (url.includes("/old/v1/autocomplete")) {
    return Promise.resolve(jsonResponse([mockClassifiedAreas.counties[0]]));
  }
  return Promise.resolve(jsonResponse({ error: "not found" }, 404));
}

function textPayload(result: { content?: unknown }): unknown {
  const block = (result.content as { type: string; text: string }[])?.[0];
  expect(block?.type).toBe("text");
  return JSON.parse(block.text);
}

describe("daft MCP server", () => {
  let client: Client;
  let handler: ReturnType<typeof createMcpHandler>;

  beforeEach(async () => {
    const fetchFn = mock((url: string, init?: RequestInit) => routeFetch(url, init));
    const daft = new DaftApi({
      fetchFn: fetchFn as unknown as typeof fetch,
      platform: "android",
      appVersion: "9.8.1",
    });

    handler = createMcpHandler(() => createServer(daft));
    const transport = new StreamableHTTPClientTransport(
      new URL("http://test.local/mcp"),
      {
        fetch: (url, init) => handler.fetch(new Request(url, init)),
      }
    );
    client = new Client(
      { name: "test-harness", version: "1.0.0" },
      { versionNegotiation: { mode: "auto" } }
    );
    await client.connect(transport);
  });

  afterEach(async () => {
    await client.close();
    await handler.close();
  });

  it("lists the public tools including auth", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "auth_login",
      "auth_logout",
      "auth_status",
      "autocomplete",
      "get_property",
      "resolve_area",
      "search_for_rent",
      "search_for_sale",
      "search_sharing",
    ]);
  });

  it("auth_login / auth_status / auth_logout manage session without leaking tokens", async () => {
    const before = textPayload(
      await client.callTool({ name: "auth_status", arguments: {} })
    ) as { loggedIn: boolean };
    expect(before.loggedIn).toBe(false);

    const login = await client.callTool({
      name: "auth_login",
      arguments: { username: "user@example.com", password: "good-pass." },
    });
    expect(login.isError).toBeFalsy();
    const loggedIn = textPayload(login) as Record<string, unknown>;
    expect(loggedIn.ok).toBe(true);
    expect(loggedIn.loggedIn).toBe(true);
    expect(loggedIn.username).toBe("us***@e***.com");
    expect(loggedIn.preferredUsername).toBe("te***r");
    expect(loggedIn.userId).toBe("5821124");
    expect(loggedIn).not.toHaveProperty("access_token");
    expect(loggedIn).not.toHaveProperty("refresh_token");
    expect(JSON.stringify(loggedIn)).not.toContain("good-pass");
    expect(JSON.stringify(loggedIn)).not.toContain("user@example.com");
    expect(JSON.stringify(loggedIn)).not.toContain("testuser");

    const status = textPayload(
      await client.callTool({ name: "auth_status", arguments: {} })
    ) as { loggedIn: boolean; hasRefreshToken: boolean };
    expect(status.loggedIn).toBe(true);
    expect(status.hasRefreshToken).toBe(true);

    const logout = textPayload(
      await client.callTool({ name: "auth_logout", arguments: {} })
    ) as { loggedIn: boolean; ok: boolean };
    expect(logout.ok).toBe(true);
    expect(logout.loggedIn).toBe(false);
  });

  it("auth_login surfaces invalid credentials", async () => {
    const result = await client.callTool({
      name: "auth_login",
      arguments: { username: "user@example.com", password: "wrong" },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text;
    expect(text).toContain("401");
  });

  it("search_for_rent defaults to detail=standard (no facilities/ber junk)", async () => {
    const result = await client.callTool({
      name: "search_for_rent",
      arguments: { county: "dublin", maxPrice: 2000 },
    });
    expect(result.isError).toBeFalsy();
    const payload = textPayload(result) as {
      listings: Array<{ listing: Record<string, unknown> }>;
      paging: Record<string, unknown>;
    };
    expect(payload.paging).toEqual(mockSearchResponse.paging);
    expect(payload.listings).toHaveLength(2);
    const listing = payload.listings[0].listing;
    expect(listing).toEqual({
      id: 1234567,
      title: "2 Bed Apartment in Dublin 4",
      seoTitle: "2 Bed Apartment in Dublin 4",
      price: "€350,000",
      numBedrooms: "2 Bed",
      propertyType: "apartments",
      seoFriendlyPath: "/for-sale/apartment-example/1234567",
      publishDate: 1705311000,
      seller: {
        sellerId: 9876,
        name: "Smith Properties",
        phone: "+353 1 919 8985",
        branch: "Dublin Office",
        sellerType: "BRANDED_AGENT",
        licenceNumber: "001806",
      },
    });
    expect(listing).not.toHaveProperty("facilities");
    expect(listing).not.toHaveProperty("ber");
    expect(listing).not.toHaveProperty("media");
    expect(listing).not.toHaveProperty("platform");
    expect(listing).not.toHaveProperty("featuredLevel");
    expect(listing).not.toHaveProperty("point");
  });

  it("search_for_rent detail=minimal keeps only list essentials", async () => {
    const result = await client.callTool({
      name: "search_for_rent",
      arguments: { county: "dublin", detail: "minimal" },
    });
    expect(result.isError).toBeFalsy();
    const listing = (
      textPayload(result) as {
        listings: Array<{ listing: Record<string, unknown> }>;
      }
    ).listings[0].listing;
    expect(listing).toEqual({
      id: 1234567,
      title: "2 Bed Apartment in Dublin 4",
      price: "€350,000",
      seoFriendlyPath: "/for-sale/apartment-example/1234567",
      seller: { name: "Smith Properties", sellerType: "BRANDED_AGENT" },
    });
  });

  it("search_for_rent detail=full keeps facilities and ber, strips media", async () => {
    const result = await client.callTool({
      name: "search_for_rent",
      arguments: { county: "dublin", detail: "full" },
    });
    expect(result.isError).toBeFalsy();
    const listing = (
      textPayload(result) as {
        listings: Array<{ listing: Record<string, unknown> }>;
      }
    ).listings[0].listing;
    expect(listing.facilities).toEqual([
      { key: "parking", name: "Parking" },
      { key: "alarm", name: "Alarm" },
    ]);
    expect(listing.ber).toEqual({ rating: "B2" });
    expect(listing).not.toHaveProperty("media");
    expect(
      (listing.seller as Record<string, unknown>).profileImage
    ).toBeUndefined();
  });

  it("search_for_rent enrichTop merges details-only fields into top hits only", async () => {
    const result = await client.callTool({
      name: "search_for_rent",
      arguments: { county: "dublin", enrichTop: 1, detail: "standard" },
    });
    expect(result.isError).toBeFalsy();
    const payload = textPayload(result) as {
      listings: Array<{
        listing: Record<string, unknown>;
        canonicalUrl?: string;
      }>;
    };
    expect(payload.listings).toHaveLength(2);
    expect(payload.listings[0].listing.description).toBe(
      "Bright apartment near the canal"
    );
    expect(payload.listings[0].listing.features).toEqual(["Parking", "Alarm"]);
    expect(payload.listings[0].listing.addressDetails).toEqual({
      streetAddress: "Example Street",
      addressLocality: "Dublin 4",
      addressRegion: "Dublin",
    });
    expect(payload.listings[0].listing.areaName).toBe("dublin-4-dublin");
    expect(payload.listings[0].listing.listingViews).toBe(42);
    expect(payload.listings[0].canonicalUrl).toBe(
      "https://www.daft.ie/for-sale/apartment-example/1234567"
    );
    expect(payload.listings[0].listing).not.toHaveProperty("facilities");
    expect(payload.listings[1].listing).not.toHaveProperty("description");
    expect(payload.listings[1]).not.toHaveProperty("canonicalUrl");
  });

  it("rejects enrichTop above 3", async () => {
    const result = await client.callTool({
      name: "search_for_rent",
      arguments: { county: "dublin", enrichTop: 4 },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text;
    expect(text).toContain("Input validation error");
  });

  it("search_sharing publishedWithinDays filters and stops after older page", async () => {
    const day = 86_400_000;
    const now = Date.now();
    const seller = { sellerId: 1, name: "Host" };
    const page1: SearchResponse = {
      listings: [
        {
          listing: {
            id: 11,
            title: "Fresh room",
            seoTitle: "Fresh room",
            seller,
            publishDate: now - day,
          },
        },
        {
          listing: {
            id: 12,
            title: "Also fresh",
            seoTitle: "Also fresh",
            seller,
            lastUpdateDate: now - Math.floor(day / 2),
          },
        },
      ],
      paging: {
        totalPages: 3,
        currentPage: 1,
        totalResults: 5,
        displayingFrom: 1,
        displayingTo: 2,
      },
    };
    const page2: SearchResponse = {
      listings: [
        {
          listing: {
            id: 13,
            title: "Within window",
            seoTitle: "Within window",
            seller,
            publishDate: now - Math.floor(1.5 * day),
          },
        },
        {
          listing: {
            id: 14,
            title: "Too old",
            seoTitle: "Too old",
            seller,
            publishDate: now - 10 * day,
          },
        },
      ],
      paging: {
        totalPages: 3,
        currentPage: 2,
        totalResults: 5,
        displayingFrom: 3,
        displayingTo: 4,
      },
    };
    const page3: SearchResponse = {
      listings: [
        {
          listing: {
            id: 15,
            title: "Should not fetch",
            seoTitle: "Should not fetch",
            seller,
            publishDate: now - 20 * day,
          },
        },
      ],
      paging: {
        totalPages: 3,
        currentPage: 3,
        totalResults: 5,
        displayingFrom: 5,
        displayingTo: 5,
      },
    };

    const listingBodies: unknown[] = [];
    const fetchFn = mock((url: string, init?: RequestInit) => {
      if (url.includes("/old/v1/location/classifiedAreas")) {
        return Promise.resolve(jsonResponse(mockClassifiedAreas));
      }
      if (url.includes("/old/v1/listings")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          sort?: string;
          paging?: { from?: string; pageSize?: string };
        };
        listingBodies.push(body);
        const from = Number(body.paging?.from ?? 0);
        const pageSize = Number(body.paging?.pageSize ?? 20);
        const page = from / pageSize + 1;
        if (page === 1) return Promise.resolve(jsonResponse(page1));
        if (page === 2) return Promise.resolve(jsonResponse(page2));
        return Promise.resolve(jsonResponse(page3));
      }
      return Promise.resolve(jsonResponse({ error: "not found" }, 404));
    });

    const daft = new DaftApi({
      fetchFn: fetchFn as unknown as typeof fetch,
      platform: "android",
      appVersion: "9.8.1",
    });
    await client.close();
    await handler.close();

    handler = createMcpHandler(() => createServer(daft));
    const transport = new StreamableHTTPClientTransport(
      new URL("http://test.local/mcp"),
      {
        fetch: (url, init) => handler.fetch(new Request(url, init)),
      }
    );
    client = new Client(
      { name: "test-harness", version: "1.0.0" },
      { versionNegotiation: { mode: "auto" } }
    );
    await client.connect(transport);

    const result = await client.callTool({
      name: "search_sharing",
      arguments: {
        county: "dublin",
        maxPrice: 650,
        publishedWithinDays: 2,
        pageSize: 2,
      },
    });
    expect(result.isError).toBeFalsy();
    const payload = textPayload(result) as {
      listings: Array<{ listing: { id: number } }>;
    };
    expect(payload.listings.map((x) => x.listing.id)).toEqual([11, 12, 13]);
    expect(listingBodies).toHaveLength(2);
    expect((listingBodies[0] as { sort?: string }).sort).toBe("publishDateDesc");
  });

  it("get_property defaults to detail=standard", async () => {
    const result = await client.callTool({
      name: "get_property",
      arguments: { id: 1234567 },
    });
    expect(result.isError).toBeFalsy();
    const payload = textPayload(result) as {
      listing: Record<string, unknown>;
      canonicalUrl: string;
    };
    expect(payload.canonicalUrl).toBe(
      "https://www.daft.ie/for-sale/apartment-example/1234567"
    );
    expect(payload.listing.description).toBe("Bright apartment near the canal");
    expect(payload.listing.features).toEqual(["Parking", "Alarm"]);
    expect(payload.listing).not.toHaveProperty("facilities");
    expect(payload.listing).not.toHaveProperty("media");
    expect(payload).not.toHaveProperty("breadcrumbs");
  });

  it("get_property detail=full keeps facilities", async () => {
    const result = await client.callTool({
      name: "get_property",
      arguments: { id: 1234567, detail: "full" },
    });
    expect(result.isError).toBeFalsy();
    const payload = textPayload(result) as {
      listing: Record<string, unknown>;
    };
    expect(payload.listing.facilities).toEqual([
      { key: "parking", name: "Parking" },
    ]);
    expect(payload.listing).not.toHaveProperty("media");
  });

  it("autocomplete returns areas", async () => {
    const result = await client.callTool({
      name: "autocomplete",
      arguments: { searchTerm: "dubl" },
    });
    expect(result.isError).toBeFalsy();
    expect(textPayload(result)).toEqual({
      areas: [{ id: "1", displayName: "Dublin", displayValue: "dublin" }],
    });
  });

  it("resolve_area returns shape ids", async () => {
    const result = await client.callTool({
      name: "resolve_area",
      arguments: { location: "dublin" },
    });
    expect(result.isError).toBeFalsy();
    expect(textPayload(result)).toEqual({ ids: ["1"] });
  });

  it("rejects invalid tool arguments before the handler runs", async () => {
    const result = await client.callTool({
      name: "get_property",
      arguments: { id: -1 },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text;
    expect(text).toContain("Input validation error");
  });

  it("surfaces ApiError as isError tool result", async () => {
    const fetchFn = mock(() =>
      Promise.resolve(jsonResponse({ message: "boom" }, 500))
    );
    const daft = new DaftApi({
      fetchFn: fetchFn as unknown as typeof fetch,
      platform: "android",
    });
    await client.close();
    await handler.close();

    handler = createMcpHandler(() => createServer(daft));
    const transport = new StreamableHTTPClientTransport(
      new URL("http://test.local/mcp"),
      {
        fetch: (url, init) => handler.fetch(new Request(url, init)),
      }
    );
    client = new Client(
      { name: "test-harness", version: "1.0.0" },
      { versionNegotiation: { mode: "auto" } }
    );
    await client.connect(transport);

    const result = await client.callTool({
      name: "get_property",
      arguments: { id: 1 },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text;
    expect(text).toContain("Daft API error 500");
  });
});
