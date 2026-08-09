import { describe, expect, it } from "bun:test";
import {
  AD_ACTIONS,
  AD_LEAD_TYPES,
  AD_STATUSES,
  AD_SUBTYPES,
  BUY_NOW_COLLECTION,
  DISCOVER_SECTION_TYPES,
  FEEDBACK_API_VALUES,
  FEEDBACK_TYPES,
  LOCATION_ACTIONS,
  NEARBY_RANGES_KM,
  ORDER_TYPES,
  PAYMENT_METHODS,
  PLACE_AD_TYPES,
  PLATFORMS,
  REPORT_AD_REASONS,
  SEARCH_AD_TYPES,
  SEARCH_AD_TYPE_LABELS,
  SEARCH_CONDITIONS,
  SEARCH_SELLER_TYPES,
  SEARCH_SORT_BY,
  SEARCH_SORT_BY_LABELS,
  UPSELL_TYPES,
  USER_TYPES,
  WATCH_AD_ACTIONS,
} from "../src/types/enums";

describe("search / place-ad enums", () => {
  it("SEARCH_SORT_BY covers Android array_sort_by_keys + best_match", () => {
    expect([...SEARCH_SORT_BY]).toEqual([
      "best_match-desc",
      "refresh_date-desc",
      "start_date-desc",
      "price-asc",
      "price-desc",
      "comment_date-desc",
    ]);
    for (const k of SEARCH_SORT_BY) {
      expect(SEARCH_SORT_BY_LABELS[k].length).toBeGreaterThan(0);
    }
  });

  it("SEARCH_AD_TYPES matches live refine type select", () => {
    expect([...SEARCH_AD_TYPES]).toEqual(["all", "0", "wanted", "swap"]);
    expect(SEARCH_AD_TYPE_LABELS["0"]).toBe("For sale");
    expect(SEARCH_AD_TYPE_LABELS.all).toBe("All");
  });

  it("PLACE_AD_TYPES matches Category.allowed_ad_types", () => {
    expect([...PLACE_AD_TYPES]).toEqual([
      "offered",
      "wanted",
      "swap",
      "free",
    ]);
  });

  it("seller / condition refine ids", () => {
    expect([...SEARCH_SELLER_TYPES]).toEqual(["0", "1", "2"]);
    expect([...SEARCH_CONDITIONS]).toEqual(["0", "excellent", "brandnew"]);
  });
});

describe("Android defs wire enums", () => {
  it("PaymentMethod", () => {
    expect([...PAYMENT_METHODS]).toEqual([
      "paypal",
      "stripe",
      "card",
      "cash",
      "credit",
      "android_pay",
      "phone",
    ]);
  });

  it("AdAction / AdStatus / AdSubType", () => {
    expect([...AD_ACTIONS]).toEqual([
      "bump",
      "close",
      "edit",
      "place",
      "relist",
      "sold",
      "withdraw",
    ]);
    expect([...AD_STATUSES]).toEqual([
      "active",
      "pending",
      "sold",
      "withdrawn",
      "draft",
      "unpaid",
    ]);
    expect([...AD_SUBTYPES]).toEqual([
      "adoption",
      "found",
      "lost",
      "job",
      "service",
    ]);
  });

  it("upsell / order / discover / lead", () => {
    expect([...UPSELL_TYPES]).toEqual([
      "basic",
      "premium",
      "priority",
      "free",
    ]);
    expect([...ORDER_TYPES]).toEqual(["advert", "buy_now"]);
    expect([...DISCOVER_SECTION_TYPES]).toEqual(["carousel", "theme"]);
    expect([...AD_LEAD_TYPES]).toEqual([
      "call",
      "email",
      "pm",
      "application",
    ]);
  });

  it("feedback / platform / location / user", () => {
    expect([...FEEDBACK_API_VALUES]).toEqual([1, 3]);
    expect([...FEEDBACK_TYPES]).toEqual(["negative", "positive"]);
    expect([...PLATFORMS]).toEqual(["android"]);
    expect([...LOCATION_ACTIONS]).toEqual(["county", "area"]);
    expect([...USER_TYPES]).toContain("regular");
    expect([...USER_TYPES]).toContain("provider");
  });

  it("nearby / report / watch / buy-now collection", () => {
    expect([...NEARBY_RANGES_KM]).toEqual(["2", "5", "10", "30", "75"]);
    expect([...REPORT_AD_REASONS]).toContain("Scam");
    expect([...WATCH_AD_ACTIONS]).toEqual([
      "addToWatchList",
      "deleteFromWatchList",
    ]);
    expect(BUY_NOW_COLLECTION).toBe("collection");
  });
});
