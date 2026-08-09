/**
 * @adverts-ie/api — Unofficial TypeScript client for Adverts.ie
 *
 * Prefer the **fresh** API (`new.api.adverts.ie`). Legacy `api.adverts.ie`
 * remains for browse `search.json` which the Android app still calls.
 *
 * @example
 * ```typescript
 * import { AdvertsApi } from "@adverts-ie/api";
 *
 * const api = new AdvertsApi();
 * const config = await api.getAppConfig();
 * const discover = await api.getDiscoverSections("53.35", "-6.26");
 * ```
 *
 * @packageDocumentation
 */

export {
  AdvertsApi,
  ApiError,
  NEW_API_KEY,
  OLD_API_KEY,
} from "./adverts";
export type { QueryValue, ImageUpload, JsonValue } from "./adverts";
export type * from "./types";
export {
  SEARCH_SORT_BY,
  SEARCH_SORT_BY_LABELS,
  SEARCH_AD_TYPES,
  SEARCH_AD_TYPE_LABELS,
  PLACE_AD_TYPES,
  SEARCH_SELLER_TYPES,
  SEARCH_SELLER_TYPE_LABELS,
  SEARCH_CONDITIONS,
  SEARCH_CONDITION_LABELS,
  PAYMENT_METHODS,
  AD_ACTIONS,
  AD_STATUSES,
  AD_SUBTYPES,
  UPSELL_TYPES,
  ORDER_TYPES,
  DISCOVER_SECTION_TYPES,
  AD_LEAD_TYPES,
  FEEDBACK_API_VALUES,
  FEEDBACK_API_VALUE_LABELS,
  FEEDBACK_TYPES,
  PLATFORMS,
  LOCATION_ACTIONS,
  USER_TYPES,
  BUY_NOW_COLLECTION,
  NEARBY_RANGES_KM,
  NEARBY_RANGE_LABELS,
  REPORT_AD_REASONS,
  WATCH_AD_ACTIONS,
} from "./types";
