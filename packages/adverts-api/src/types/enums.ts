/**
 * Wire enums from Android `utils/defs` + hardcoded resource arrays.
 *
 * Not included (server-driven catalogs): counties/areas, categories, refine
 * option lists beyond the known type/seller/condition keys, place-ad
 * payment/shipping option keys from OPTIONS advert.
 */

/** Query param `sortby` — app-local string arrays, not from API. */
export const SEARCH_SORT_BY = [
  "best_match-desc",
  "refresh_date-desc",
  "start_date-desc",
  "price-asc",
  "price-desc",
  "comment_date-desc",
] as const;
export type SearchSortBy = (typeof SEARCH_SORT_BY)[number];

/** Human labels matching Android `array_sort_by_labels` (+ Best Match). */
export const SEARCH_SORT_BY_LABELS: Record<SearchSortBy, string> = {
  "best_match-desc": "Best Match",
  "refresh_date-desc": "Most Recent",
  "start_date-desc": "Date Entered",
  "price-asc": "Lowest Price",
  "price-desc": "Highest Price",
  "comment_date-desc": "Last Comment",
};

/**
 * Refine option key `type` → query `type=…`.
 * Live values: All=`all`, For sale=`0`, Wanted=`wanted`, Swap=`swap`.
 * (Place-ad uses {@link PLACE_AD_TYPES} — "for sale" there is `offered`, not `0`.)
 */
export const SEARCH_AD_TYPES = ["all", "0", "wanted", "swap"] as const;
export type SearchAdType = (typeof SEARCH_AD_TYPES)[number];

export const SEARCH_AD_TYPE_LABELS: Record<SearchAdType, string> = {
  all: "All",
  "0": "For sale",
  wanted: "Wanted",
  swap: "Swap",
};

/** Place-ad / category `allowed_ad_types` / body `ad_type`. */
export const PLACE_AD_TYPES = ["offered", "wanted", "swap", "free"] as const;
export type PlaceAdType = (typeof PLACE_AD_TYPES)[number];

/** Refine `seller_type`. */
export const SEARCH_SELLER_TYPES = ["0", "1", "2"] as const;
export type SearchSellerType = (typeof SEARCH_SELLER_TYPES)[number];

export const SEARCH_SELLER_TYPE_LABELS: Record<SearchSellerType, string> = {
  "0": "All",
  "1": "Private seller",
  "2": "Shop",
};

/** Refine `condition` (`excellent` = Used in UI). */
export const SEARCH_CONDITIONS = ["0", "excellent", "brandnew"] as const;
export type SearchCondition = (typeof SEARCH_CONDITIONS)[number];

export const SEARCH_CONDITION_LABELS: Record<SearchCondition, string> = {
  "0": "All",
  excellent: "Used",
  brandnew: "Brand new",
};

/** `utils/defs/PaymentMethod` — bump / pay / buy-credits / buy-now. */
export const PAYMENT_METHODS = [
  "paypal",
  "stripe",
  "card",
  "cash",
  "credit",
  "android_pay",
  "phone",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** `utils/defs/AdAction` — POST advert/:id/:action. */
export const AD_ACTIONS = [
  "bump",
  "close",
  "edit",
  "place",
  "relist",
  "sold",
  "withdraw",
] as const;
export type AdAction = (typeof AD_ACTIONS)[number];

/**
 * Lifecycle / my-ads path statuses from `AdType` (status subset).
 * Listing kinds (`offered` / `wanted` / …) live in {@link PLACE_AD_TYPES}.
 */
export const AD_STATUSES = [
  "active",
  "pending",
  "sold",
  "withdrawn",
  "draft",
  "unpaid",
] as const;
export type AdStatus = (typeof AD_STATUSES)[number];

/** `utils/defs/AdSubType` — wire `subtype` / `ad_subtype`. */
export const AD_SUBTYPES = [
  "adoption",
  "found",
  "lost",
  "job",
  "service",
] as const;
export type AdSubType = (typeof AD_SUBTYPES)[number];

/**
 * Upsell / bump / priority packages (`basic` | `premium` | `priority`).
 * Relist free-bump path may send `free`.
 */
export const UPSELL_TYPES = ["basic", "premium", "priority", "free"] as const;
export type UpsellType = (typeof UPSELL_TYPES)[number];

/** Stripe `order_type` — `StripeConstants` advert | buy_now. */
export const ORDER_TYPES = ["advert", "buy_now"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

/** `utils/defs/discover/DiscoverSectionType`. */
export const DISCOVER_SECTION_TYPES = ["carousel", "theme"] as const;
export type DiscoverSectionType = (typeof DISCOVER_SECTION_TYPES)[number];

/** `utils/defs/ad/AdLeadType` — PUT advert/:id/lead/:type. */
export const AD_LEAD_TYPES = ["call", "email", "pm", "application"] as const;
export type AdLeadType = (typeof AD_LEAD_TYPES)[number];

/** `utils/defs/FeedbackApiType` — leaveFeedback `feedback_value`. */
export const FEEDBACK_API_VALUES = [1, 3] as const;
export type FeedbackApiValue = (typeof FEEDBACK_API_VALUES)[number];

export const FEEDBACK_API_VALUE_LABELS: Record<FeedbackApiValue, string> = {
  1: "negative",
  3: "positive",
};

/** `utils/defs/FeedbackType` — browse feedback path segment. */
export const FEEDBACK_TYPES = ["negative", "positive"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

/** `utils/defs/Platform` — registerpush `platform`. */
export const PLATFORMS = ["android"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** `utils/defs/LocationAction` — location.json `action`. */
export const LOCATION_ACTIONS = ["county", "area"] as const;
export type LocationAction = (typeof LOCATION_ACTIONS)[number];

/** `utils/defs/UserType` — Account / profile `user_type`. */
export const USER_TYPES = [
  "regular",
  "company",
  "dealer",
  "merchant",
  "provider",
  "simi",
] as const;
export type UserType = (typeof USER_TYPES)[number];

/** Buy-now FieldMap `shipping` when collecting (else region id string). */
export const BUY_NOW_COLLECTION = "collection" as const;

/**
 * Nearby refine — `R.array.array_nearby_labels` / `nearby_values`.
 * UI labels are Nkm; wire `nearby_range` is km after Android `/1000`
 * (`NearbyConstants.DEFAULT_NEARBY_DISTANCE` = 2).
 */
export const NEARBY_RANGES_KM = ["2", "5", "10", "30", "75"] as const;
export type NearbyRangeKm = (typeof NEARBY_RANGES_KM)[number];

export const NEARBY_RANGE_LABELS: Record<NearbyRangeKm, string> = {
  "2": "2km",
  "5": "5km",
  "10": "10km",
  "30": "30km",
  "75": "75km",
};

/**
 * Report-ad spinner labels (`R.array.report_ad_reasons_array`) —
 * wire `reason` is the selected label string.
 */
export const REPORT_AD_REASONS = [
  "Duplicate ad",
  "Inappropriate material",
  "Scam",
  "Suspected stolen item",
  "Wrong category",
] as const;
export type ReportAdReason = (typeof REPORT_AD_REASONS)[number];

/** `utils/defs/WatchAdAction` — advert.json watchlist action. */
export const WATCH_AD_ACTIONS = [
  "addToWatchList",
  "deleteFromWatchList",
] as const;
export type WatchAdAction = (typeof WATCH_AD_ACTIONS)[number];
