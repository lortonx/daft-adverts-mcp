/**
 * Golden optionality asserts for response models (see research/ANDROID.md).
 */
import { describe, expect, test } from "bun:test";
import fs from "fs";
import path from "path";

const GENERATED = path.join(
  import.meta.dir,
  "../src/types/generated.ts"
);

function readInterface(name: string): string {
  const src = fs.readFileSync(GENERATED, "utf8");
  const re = new RegExp(`export interface ${name} \\{([^}]*)\\}`, "s");
  const m = src.match(re);
  if (!m) throw new Error(`interface ${name} not found in generated.ts`);
  return m[1];
}

function fieldRequired(body: string, field: string): boolean {
  const re = new RegExp(`^\\s*${field}(\\?)?:`, "m");
  const m = body.match(re);
  if (!m) throw new Error(`field ${field} not found`);
  return !m[1];
}

describe("response optionality goldens", () => {
  test("BasicAdvert: title/ad_status/category/media required", () => {
    const b = readInterface("BasicAdvert");
    for (const f of ["ad_id", "title", "ad_status", "category", "media"]) {
      expect(fieldRequired(b, f)).toBe(true);
    }
    // live getAdvert sometimes omits can_leave_feedback
    expect(fieldRequired(b, "can_leave_feedback")).toBe(false);
  });

  test("Comment: ids required; offer optional", () => {
    const b = readInterface("Comment");
    expect(fieldRequired(b, "ad_id")).toBe(true);
    expect(fieldRequired(b, "id")).toBe(true);
    expect(fieldRequired(b, "user_id")).toBe(true);
    expect(fieldRequired(b, "offer")).toBe(false);
  });

  test("Conversation: id/user/with_user required; advert optional", () => {
    const b = readInterface("Conversation");
    expect(fieldRequired(b, "id")).toBe(true);
    expect(fieldRequired(b, "user")).toBe(true);
    expect(fieldRequired(b, "with_user")).toBe(true);
    expect(fieldRequired(b, "summary")).toBe(true);
    expect(fieldRequired(b, "advert")).toBe(false);
  });

  test("PrivateProfile: non-null ctor fields required; avatar_url optional", () => {
    const b = readInterface("PrivateProfile");
    expect(fieldRequired(b, "username")).toBe(true);
    expect(fieldRequired(b, "email_address")).toBe(true);
    expect(fieldRequired(b, "consent_options")).toBe(true);
    expect(fieldRequired(b, "avatar_url")).toBe(false);
    expect(fieldRequired(b, "area_name")).toBe(false);
  });

  test("Media: id/is_main required; image urls optional", () => {
    const b = readInterface("Media");
    expect(fieldRequired(b, "id")).toBe(true);
    expect(fieldRequired(b, "is_main")).toBe(true);
    expect(fieldRequired(b, "image_url_large")).toBe(false);
    expect(fieldRequired(b, "image_url_thumbnail")).toBe(false);
  });

  test("SearchAdvert is distinct from ads Advert", () => {
    const src = fs.readFileSync(GENERATED, "utf8");
    expect(src).toContain("export interface SearchAdvert");
    expect(src.match(/export interface Advert \{/g)?.length).toBe(1);
  });
});

const REQUESTS = path.join(import.meta.dir, "../src/types/requests.ts");

function readRequestInterface(name: string): string {
  const src = fs.readFileSync(REQUESTS, "utf8");
  const re = new RegExp(`export interface ${name} \\{([^}]*)\\}`, "s");
  const m = src.match(re);
  if (!m) throw new Error(`interface ${name} not found in requests.ts`);
  return m[1];
}

describe("request optionality goldens (Android packers)", () => {
  test("BumpAdBody: bump_type/amount/payment_method required", () => {
    const b = readRequestInterface("BumpAdBody");
    expect(fieldRequired(b, "bump_type")).toBe(true);
    expect(fieldRequired(b, "amount")).toBe(true);
    expect(fieldRequired(b, "payment_method")).toBe(true);
    expect(fieldRequired(b, "payment_data")).toBe(false);
  });

  test("PayForAdBody: amount/priority_type/bumped_ad required", () => {
    const b = readRequestInterface("PayForAdBody");
    expect(fieldRequired(b, "amount")).toBe(true);
    expect(fieldRequired(b, "priority_type")).toBe(true);
    expect(fieldRequired(b, "bumped_ad")).toBe(true);
    expect(fieldRequired(b, "payment_method")).toBe(false);
  });

  test("PaymentIntentBody: amount/order_type/save_card/relist required", () => {
    const b = readRequestInterface("PaymentIntentBody");
    expect(fieldRequired(b, "amount")).toBe(true);
    expect(fieldRequired(b, "order_type")).toBe(true);
    expect(fieldRequired(b, "save_card")).toBe(true);
    expect(fieldRequired(b, "relist")).toBe(true);
    expect(fieldRequired(b, "item_id")).toBe(false);
  });

  test("PlaceAdBody: media_ids required; draft free_ad optional", () => {
    const b = readRequestInterface("PlaceAdBody");
    expect(fieldRequired(b, "media_ids")).toBe(true);
    expect(fieldRequired(b, "title")).toBe(true);
    expect(fieldRequired(b, "category")).toBe(true);
    expect(fieldRequired(b, "free_ad")).toBe(false);
  });

  test("OldSearchParams: all ParamKey filters optional", () => {
    const b = readRequestInterface("OldSearchParams");
    for (const f of [
      "q",
      "include_pets",
      "w",
      "h",
      "search_cat",
      "pg",
      "watchlist",
    ]) {
      expect(fieldRequired(b, f)).toBe(false);
    }
  });

  test("RelistAdBody aliases PayForAdBody", () => {
    const src = fs.readFileSync(REQUESTS, "utf8");
    expect(src).toMatch(
      /export type RelistAdBody\s*=\s*PayForAdBody/
    );
  });
});

const HAND_TYPES = path.join(import.meta.dir, "../src/types.ts");

function readHandInterface(name: string): string {
  const src = fs.readFileSync(HAND_TYPES, "utf8");
  const re = new RegExp(`export interface ${name} \\{([^}]*)\\}`, "s");
  const m = src.match(re);
  if (!m) throw new Error(`interface ${name} not found in types.ts`);
  return m[1];
}

describe("hand types optionality (types.ts)", () => {
  test("Account: core fields + facebook_user_id required; tokens optional", () => {
    const b = readHandInterface("Account");
    for (const f of [
      "user_id",
      "username",
      "status",
      "sms_verified",
      "user_type",
      "facebook_user_id",
    ]) {
      expect(fieldRequired(b, f)).toBe(true);
    }
    expect(fieldRequired(b, "access_token")).toBe(false);
    expect(fieldRequired(b, "accessToken")).toBe(false);
  });

  test("AppConfig: all four flags required", () => {
    const b = readHandInterface("AppConfig");
    for (const f of [
      "skip_enabled",
      "show_recently_viewed_ads",
      "show_discover_content",
      "show_category_search",
    ]) {
      expect(fieldRequired(b, f)).toBe(true);
    }
  });

  test("DiscoverSection: id/type/view_more required; ads optional", () => {
    const b = readHandInterface("DiscoverSection");
    expect(fieldRequired(b, "id")).toBe(true);
    expect(fieldRequired(b, "type")).toBe(true);
    expect(fieldRequired(b, "view_more")).toBe(true);
    expect(fieldRequired(b, "title")).toBe(false);
    expect(fieldRequired(b, "ads")).toBe(false);
  });

  test("DiscoverAd: ad_id/title required; media/price optional", () => {
    const b = readHandInterface("DiscoverAd");
    expect(fieldRequired(b, "ad_id")).toBe(true);
    expect(fieldRequired(b, "title")).toBe(true);
    expect(fieldRequired(b, "main_image")).toBe(false);
    expect(fieldRequired(b, "price")).toBe(false);
  });

  test("OldSearchAdvert/Pagination alias generated SearchAdvert/Pagination", () => {
    const src = fs.readFileSync(HAND_TYPES, "utf8");
    expect(src).toMatch(
      /export type OldSearchPagination\s*=\s*Pagination/
    );
    expect(src).toMatch(/export type OldSearchAdvert\s*=\s*SearchAdvert/);
  });

  test("OldSearchResponse: status/response required", () => {
    const b = readHandInterface("OldSearchResponse");
    expect(fieldRequired(b, "status")).toBe(true);
    expect(fieldRequired(b, "response")).toBe(true);
  });
});
