/**
 * Smoke coverage: every inventory Retrofit → TS method hits the right host/verb/path.
 */
import { describe, expect, it, mock } from "bun:test";
import fs from "fs";
import path from "path";
import { AdvertsApi } from "../src/adverts";

const PKG = path.resolve(import.meta.dir, "..");
const inventory = JSON.parse(
  fs.readFileSync(path.join(PKG, "research/inventory.json"), "utf8")
) as {
  methods: InventoryMethod[];
};

type Param = {
  kind: string;
  name: string;
  key?: string;
  tsType: string;
  optional?: boolean;
};

type PathSeg =
  | { type: "static"; value: string }
  | { type: "param"; key: string; name: string };

type InventoryMethod = {
  tsName: string;
  host: "new" | "old";
  http: string;
  pathLiteral: string;
  pathSegments: PathSeg[];
  multipart?: boolean;
  params: Param[];
  returnTs: string;
};

const TEST_NEW_API_KEY = "test-new-api-key";
const TEST_OLD_API_KEY = "test-old-api-key";
const NEW_BASE = "https://new.api.adverts.ie/";
const OLD_BASE = "https://api.adverts.ie/";
const PIXEL_URL = "https://pixel.example/track?x=1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body ?? {}), {
    status,
    statusText: "OK",
    headers: { "Content-Type": "application/json" },
  });
}

function fixtureForTsType(tsType: string, name: string): unknown {
  if (tsType.endsWith("[]")) {
    if (tsType.startsWith("number")) return [42];
    return ["a"];
  }
  switch (tsType) {
    case "number":
      return 42;
    case "boolean":
      return true;
    case "string":
      if (name === "url" || name.toLowerCase().includes("url")) return PIXEL_URL;
      return "t";
    case "ImageUpload":
      return new Uint8Array([1, 2, 3, 4]);
    case "PlaceAdBody":
    case "UpdateAdBody":
      return {
        media_ids: [1],
        title: "title",
        category: 1,
        ad_type: "offered",
      };
    case "BumpAdBody":
      return { bump_type: "bump", amount: 1, payment_method: "paypal" };
    case "PayForAdBody":
    case "RelistAdBody":
      return { amount: 1, priority_type: "featured", bumped_ad: 1 };
    case "PaymentIntentBody":
      return {
        amount: 100,
        order_type: "advert",
        save_card: false,
        relist: false,
      };
    case "BuyCreditsBody":
      return { price: 10, payment_method: "paypal" };
    case "BuyNowParams":
      return { quantity: 1, shipping: "collection" };
    case "OfferCommentParams":
      return { item_id: 42, message: "hi" };
    case "EditProfileParams":
      return { email: "a@b.c" };
    case "NotificationSettingsBody":
      return { settings: { push: 1 as const } };
    case "OldSearchParams":
      return { q: "phone", pg: "1" };
    default:
      if (tsType.includes("Params") || tsType.includes("Body")) {
        return {};
      }
      return "t";
  }
}

function buildArgs(method: InventoryMethod): unknown[] {
  return method.params.map((p) => {
    if (p.kind === "queryMap" || p.kind === "fieldMap") {
      return fixtureForTsType(p.tsType, p.name);
    }
    if (p.optional && p.kind === "header") {
      // Pass a value so Authorization / recaptcha wiring is exercised.
      return p.key === "Authorization" ? "Bearer-test" : "recaptcha-token";
    }
    return fixtureForTsType(p.tsType, p.name);
  });
}

function expectedPath(method: InventoryMethod): string {
  if (method.tsName === "trackPixel") return PIXEL_URL;
  return method.pathSegments
    .map((seg) => {
      if (seg.type === "static") return seg.value;
      const param = method.params.find((p) => p.name === seg.name);
      const value = fixtureForTsType(param?.tsType ?? "string", seg.name);
      return encodeURIComponent(`${value}`);
    })
    .join("");
}

function expectedBase(method: InventoryMethod): string {
  if (method.tsName === "trackPixel") return PIXEL_URL;
  return method.host === "old" ? OLD_BASE : NEW_BASE;
}

describe("AdvertsApi inventory method coverage", () => {
  it(`covers all ${inventory.methods.length} public inventory methods`, () => {
    expect(inventory.methods.length).toBe(119);
  });

  for (const method of inventory.methods) {
    it(`${method.http} ${method.host} ${method.tsName}`, async () => {
      let lastUrl = "";
      let lastInit: RequestInit | undefined;
      const fetchFn = mock((url: string, init?: RequestInit) => {
        lastUrl = String(url);
        lastInit = init;
        return Promise.resolve(jsonResponse({ ok: true, method: method.tsName }));
      });

      const api = new AdvertsApi({
        fetchFn: fetchFn as typeof fetch,
        newApiKey: TEST_NEW_API_KEY,
        oldApiKey: TEST_OLD_API_KEY,
        appVersionCode: "1001176",
        appVersionName: "1.91.3",
      });

      const fn = (api as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[
        method.tsName
      ];
      expect(typeof fn).toBe("function");

      const args = buildArgs(method);
      const result = await fn.apply(api, args);
      expect(fetchFn).toHaveBeenCalled();
      if (method.returnTs === "void") {
        expect(result).toBeUndefined();
      } else {
        expect(result).toEqual({ ok: true, method: method.tsName });
      }

      expect(lastInit?.method?.toUpperCase()).toBe(method.http.toUpperCase());

      const path = expectedPath(method);
      if (method.tsName === "trackPixel") {
        expect(lastUrl).toStartWith(PIXEL_URL);
      } else {
        expect(lastUrl).toStartWith(expectedBase(method));
        const u = new URL(lastUrl);
        // pathname without leading slash, allow trailing emptiness
        const pathname = u.pathname.replace(/^\//, "");
        expect(pathname).toBe(path.replace(/^\//, ""));
      }

      const headers = lastInit?.headers as Record<string, string>;
      if (method.host === "new") {
        expect(headers["X-Adverts-Api-Key"]).toBe(TEST_NEW_API_KEY);
        expect(headers.Accept).toBe("application/json; version=9");
      } else {
        expect(lastUrl).toContain(`api_key=${TEST_OLD_API_KEY}`);
        expect(headers["X-Adverts-Api-Key"]).toBeUndefined();
      }

      if (method.multipart) {
        expect(lastInit?.body).toBeInstanceOf(FormData);
      }

      // Optional header params that were passed should appear.
      for (const p of method.params) {
        if (p.kind !== "header" || p.optional) continue;
      }
      const recaptcha = method.params.find(
        (p) => p.kind === "header" && p.key === "X-Recaptcha-Token"
      );
      if (recaptcha) {
        expect(headers["X-Recaptcha-Token"]).toBe("recaptcha-token");
      }
    });
  }
});

describe("AdvertsApi hand wrappers", () => {
  it("login stores access_token from authenticateAccount", async () => {
    const fetchFn = mock(() =>
      Promise.resolve(
        jsonResponse({
          user_id: 1,
          username: "u",
          status: "ok",
          sms_verified: 0,
          user_type: "private",
          facebook_user_id: 0,
          access_token: "tok-login",
        })
      )
    );
    const api = new AdvertsApi({
      fetchFn: fetchFn as typeof fetch,
      newApiKey: TEST_NEW_API_KEY,
      oldApiKey: TEST_OLD_API_KEY,
    });
    const account = await api.login("user@example.com", "secret", "captcha");
    expect(account.access_token).toBe("tok-login");
    expect(api.getToken()).toBe("tok-login");
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain(
      "account/secure-authenticate"
    );
    expect((init.headers as Record<string, string>)["X-Recaptcha-Token"]).toBe(
      "captcha"
    );
  });
});
