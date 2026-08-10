import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { AdvertsApi } from "@adverts-ie/api";
import type {
  AdResponse,
  LocationResponse,
  OldSearchResponse,
  RefineGroup,
} from "@adverts-ie/api";
import { createServer } from "../src/create-server";

const mockSearch: OldSearchResponse = {
  status: 1,
  response: {
    data: [
      {
        ad_id: 111,
        title: "MacBook Pro 14",
        price: 1200,
        price_string: "€1,200",
        location: "Dublin",
        ad_type: "offered",
        ad_status: "active",
        priImageUrl: "https://cdn.example/big.jpg",
        tracking_pixel: "https://track.example/p",
        href: "/computers/macbook-pro-14/111",
        has_premium_badge: 0,
        is_watched: 0,
        user: "seller1",
        category_id: 42,
        county_id: 1,
      },
      {
        ad_id: 222,
        title: "Bike",
        price_string: "€200",
        location: "Cork",
        ad_type: "offered",
        has_premium_badge: false,
        is_watched: false,
      },
    ],
    pagination: {
      current_page: 1,
      first_on_page: 1,
      last_on_page: 2,
      results_per_page: 20,
      total_pages: 1,
      total_results: 2,
    },
    sentence: "MacBook in Dublin",
    cat_facet: [
      { categoryId: 42, categoryName: "Computers", count: 1 },
    ],
  },
};

const mockCounties: LocationResponse = {
  status: 1,
  response: [
    { id: 1, name: "Dublin" },
    { id: 2, name: "Cork" },
  ],
};

const mockAreas: LocationResponse = {
  status: 1,
  response: [
    { id: 10, name: "Dublin City" },
    { id: 11, name: "Dun Laoghaire" },
  ],
};

const mockRefine: RefineGroup[] = [
  {
    group: "type",
    order: 1,
    items: [
      {
        key: "type",
        label: "Type",
        type: "select",
        select: [
          { id: "all", value: "All" },
          { id: "0", value: "For sale" },
        ],
      },
    ],
  },
];

const mockAdDetails: AdResponse = {
  status: 1,
  response: {
    id: 111,
    title: "MacBook Pro 14",
    description: "M3, 16GB",
    price: "1200",
    ad_status: "active",
    ad_type: "offered",
    message: "ok",
    data: [],
  } as AdResponse["response"],
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
  const u = new URL(url);
  if (u.pathname.endsWith("/account/secure-authenticate")) {
    const body = typeof init?.body === "string" ? init.body : String(init?.body ?? "");
    const params = new URLSearchParams(body);
    if (
      params.get("username") === "user@example.com" &&
      params.get("password") === "good-pass."
    ) {
      return Promise.resolve(
        jsonResponse({
          user_id: 99,
          username: "user@example.com",
          status: "active",
          sms_verified: 1,
          user_type: "regular",
          facebook_user_id: 0,
          access_token: "mock-access-token",
        })
      );
    }
    return Promise.resolve(jsonResponse({ message: "bad credentials" }, 401));
  }
  if (u.pathname.endsWith("/search.json")) {
    const counties = u.searchParams.getAll("countyID[]");
    if (counties.length) {
      return Promise.resolve(
        jsonResponse({
          ...mockSearch,
          response: {
            ...mockSearch.response,
            sentence: `counties=${counties.join(",")}`,
          },
        })
      );
    }
    if (u.searchParams.get("price_facets_only") || u.searchParams.has("rs_min_price")) {
      // price facets path — still return facet-ish envelope
      return Promise.resolve(
        jsonResponse({
          status: 1,
          price_facet: { options: [{ min: "0", max: "100", count: 3, label: "€0–€100" }] },
        })
      );
    }
    return Promise.resolve(jsonResponse(mockSearch));
  }
  if (u.pathname.endsWith("/location.json")) {
    if (u.searchParams.get("action") === "area") {
      return Promise.resolve(jsonResponse(mockAreas));
    }
    return Promise.resolve(jsonResponse(mockCounties));
  }
  if (u.pathname.endsWith("/advert.json")) {
    return Promise.resolve(jsonResponse(mockAdDetails));
  }
  if (u.pathname.includes("/category/") && u.pathname.includes("/refine")) {
    return Promise.resolve(jsonResponse(mockRefine));
  }
  if (u.pathname.endsWith("/app/config")) {
    return Promise.resolve(
      jsonResponse({
        skip_enabled: false,
        show_recently_viewed_ads: true,
        show_discover_content: true,
        show_category_search: true,
      })
    );
  }
  if (u.pathname.includes("/discover")) {
    return Promise.resolve(
      jsonResponse([
        {
          id: "1",
          type: "carousel",
          view_more: true,
          title: "Nearby",
          ads: [{ ad_id: 1, title: "Item" }],
        },
      ])
    );
  }
  return Promise.resolve(jsonResponse({ error: "not found", url }, 404));
}

function textPayload(result: { content?: unknown }): unknown {
  const block = (result.content as { type: string; text: string }[])?.[0];
  expect(block?.type).toBe("text");
  return JSON.parse(block.text);
}

describe("adverts MCP server", () => {
  let client: Client;
  let handler: ReturnType<typeof createMcpHandler>;
  let lastSearchUrl = "";

  beforeEach(async () => {
    lastSearchUrl = "";
    const fetchFn = mock((url: string, init?: RequestInit) => {
      if (String(url).includes("search.json")) lastSearchUrl = String(url);
      return routeFetch(url, init);
    });
    const api = new AdvertsApi({
      fetchFn: fetchFn as unknown as typeof fetch,
      newApiKey: "test-new-key",
      oldApiKey: "test-old-key",
    });

    handler = createMcpHandler(() => createServer(api));
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

  it("lists search-first tools including auth", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "auth_login",
      "auth_logout",
      "auth_status",
      "get_ad",
      "get_app_config",
      "get_areas",
      "get_counties",
      "get_discover",
      "get_price_facets",
      "get_refine_options",
      "search_ads",
    ]);
  });

  it("search_ads projects standard listings and drops image junk", async () => {
    const result = await client.callTool({
      name: "search_ads",
      arguments: { q: "macbook", page: 1 },
    });
    expect(result.isError).toBeFalsy();
    const body = textPayload(result) as {
      status: number;
      response: {
        data: Record<string, unknown>[];
        sentence?: string;
      };
    };
    expect(body.status).toBe(1);
    expect(body.response.data).toHaveLength(2);
    expect(body.response.data[0].ad_id).toBe(111);
    expect(body.response.data[0].title).toBe("MacBook Pro 14");
    expect(body.response.data[0].href).toBe(
      "https://adverts.ie/computers/macbook-pro-14/111"
    );
    expect(body.response.data[0].priImageUrl).toBeUndefined();
    expect(body.response.data[0].tracking_pixel).toBeUndefined();
    expect(body.response.sentence).toBe("MacBook in Dublin");
  });

  it("search_ads with countyIds hits multi-county path", async () => {
    const result = await client.callTool({
      name: "search_ads",
      arguments: { countyIds: [1, 2], q: "bike" },
    });
    expect(result.isError).toBeFalsy();
    const body = textPayload(result) as {
      response: { sentence?: string };
    };
    expect(body.response.sentence).toContain("counties=");
    expect(lastSearchUrl).toContain("countyID");
  });

  it("get_counties / get_areas / get_refine_options support search", async () => {
    const counties = textPayload(
      await client.callTool({ name: "get_counties", arguments: {} })
    ) as { counties: { id: number; name: string }[] };
    expect(counties.counties[0]).toEqual({ id: 1, name: "Dublin" });

    const areas = textPayload(
      await client.callTool({
        name: "get_areas",
        arguments: { countyId: 1 },
      })
    ) as { areas: { id: number }[] };
    expect(areas.areas.map((a) => a.id)).toEqual([10, 11]);

    const refine = textPayload(
      await client.callTool({
        name: "get_refine_options",
        arguments: { categoryId: 42 },
      })
    ) as RefineGroup[];
    expect(refine[0].group).toBe("type");
  });

  it("get_ad returns projected details", async () => {
    const body = textPayload(
      await client.callTool({
        name: "get_ad",
        arguments: { id: 111 },
      })
    ) as { status: number; response: { title?: string; description?: string } };
    expect(body.status).toBe(1);
    expect(body.response.title).toBe("MacBook Pro 14");
    expect(body.response.description).toBe("M3, 16GB");
  });

  it("auth_login / auth_status / auth_logout never leak tokens", async () => {
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
    expect(JSON.stringify(loggedIn)).not.toContain("mock-access-token");

    const status = textPayload(
      await client.callTool({ name: "auth_status", arguments: {} })
    ) as { loggedIn: boolean; username: string | null };
    expect(status.loggedIn).toBe(true);
    expect(status.username).toContain("***");
    expect(JSON.stringify(status)).not.toContain("mock-access-token");

    const logout = textPayload(
      await client.callTool({ name: "auth_logout", arguments: {} })
    ) as { loggedIn: boolean };
    expect(logout.loggedIn).toBe(false);
  });
});
