/**
 * Request bodies / form maps from Android helpers + AdPlacementKeys / ParamKey.
 *
 * Optionality (ANDROID.md):
 * - required = packer/helper always writes the key on that call path
 * - optional = conditional / category- or flow-dependent
 *
 * OldSearchParams: QueryMap&lt;String,String&gt; filter bag — every key optional
 * (Android OldApiHelper injects include_pets/w/h at call site, not via this type).
 */

import type { AdPlacementFormOption, JsonPrimitive } from "./generated";
import type {
  NearbyRangeKm,
  OrderType,
  PaymentMethod,
  PlaceAdType,
  SearchAdType,
  SearchCondition,
  SearchSellerType,
  SearchSortBy,
  UpsellType,
} from "./enums";

/** Multi-select map written as JSONObject of optionKey → boolean. */
export type MultiSelectFlags = Record<string, boolean>;

/** Buy-now shipping option prices: optionKey → Double. */
export type BuyNowShippingPrices = Record<string, number>;

/** Opaque payment_data blob (JSONObject / token payload). */
export type PaymentData = string | { readonly [key: string]: JsonPrimitive | PaymentData | PaymentData[] };

/**
 * Place / update ad JSON — PlaceAdvertForm.getValues().
 * Only media_ids is unconditionally written; title/category/ad_type are always
 * set by the place-ad UI before a successful place/update.
 */
export interface PlaceAdBody {
  /** getValues() always puts a JSONArray (may be empty) */
  media_ids: number[];
  title: string;
  /** setCategory(int) */
  category: number;
  /** setAdType / form */
  ad_type: PlaceAdType;

  description?: string;
  /** CurrencyField / Salary → Double (jobs write salary into price) */
  price?: number;
  /** setArea(int) / setCounty(int) */
  area?: number;
  areaLabel?: string;
  county?: number;
  county_label?: string;
  region?: number;

  accept_swaps?: boolean;
  enable_public_comments?: boolean;
  facebook_share?: boolean;
  donedeal_paid_share?: string;
  buynow_price?: number;
  buynow_quantity?: number;
  buynow_shipping?: BuyNowShippingPrices;
  buynow_collection?: boolean;
  shipping_options?: MultiSelectFlags;
  payment_options?: MultiSelectFlags;
  payment_method?: PaymentMethod;
  payment_data?: PaymentData;
  upsell_payment_method?: PaymentMethod;
  upsell_payment_data?: PaymentData;
  reserve_price?: number;
  /** Upsell package when placing (`basic` | `premium` | `priority`). */
  priority?: UpsellType;
  commission_only?: boolean;
  on_application?: boolean;
  salary_period?: string;
  employer_name?: string;
  /** Place path uses registration_number (vehicle_reg is draft-only) */
  registration_number?: string;
  car_year?: string;
  colour?: string;
  body_type?: number;
  fuel_type?: number;
  transmission_type?: string;
  engine_size?: number;
  mileage?: number;
  doors?: string;
  nct_expiry?: string;
  tax_expiry?: string;
  /** Long mediaId */
  main_image?: number;
  collection?: boolean;

  /**
   * Draft-only keys (getDraftAd) — not written by placeAd/updateAd getValues().
   * Kept optional for clients that persist drafts with the same shape.
   */
  category_label?: string;
  free_ad?: boolean;
  live_ad?: boolean;
  reserve_price_flag?: boolean;
  vehicle_reg?: string;
  images?: Array<{
    image_path: string;
    image_orientation?: number;
    image_rotation?: number;
  }>;
  form_options?: Record<string, AdPlacementFormOption>;
  place_ad_values?: PlaceAdValues;
  category_properties?: string[];
}

/** Nested draft place_ad_values — wire fields without draft wrappers. */
export type PlaceAdValues = Omit<
  PlaceAdBody,
  | "form_options"
  | "place_ad_values"
  | "images"
  | "category_properties"
  | "free_ad"
  | "live_ad"
  | "reserve_price_flag"
  | "category_label"
  | "vehicle_reg"
>;

/** updateAd posts the same getValues() JSON as placeAd. */
export type UpdateAdBody = PlaceAdBody;

/**
 * Bump — BumpAdManager.packageBumpParams.
 * Always: bump_type, amount, payment_method; payment_data if non-null.
 */
export interface BumpAdBody {
  bump_type: UpsellType;
  amount: number;
  payment_method: PaymentMethod;
  payment_data?: PaymentData;
}

/**
 * Pay-for-ad / relist — PlaceAdManager.packagePayForAdParams
 * (shared by payForAd + relistAd).
 * Always: amount, priority_type, bumped_ad (= 1).
 */
export interface PayForAdBody {
  amount: number;
  priority_type: UpsellType;
  /** Always 1 in the Android packer */
  bumped_ad: number;
  payment_method?: PaymentMethod;
  payment_data?: PaymentData;
}

/** Same packer as PayForAdBody (startRelistAdRequest). */
export type RelistAdBody = PayForAdBody;

/**
 * Stripe PaymentIntent — StripeManager.packagePaymentIntentParams.
 * Always: amount (cents), order_type, save_card, relist.
 */
export interface PaymentIntentBody {
  amount: number;
  /** StripeConstants: advert | buy_now */
  order_type: OrderType;
  save_card: boolean;
  relist: boolean;
  item_id?: number;
  bump_type?: UpsellType;
  payment_method_id?: string;
  payload?: PlaceAdBody;
}

/**
 * Buy credits — PayPal path in AdvertsBuyCreditsActivity.
 * Stripe credits use PaymentIntentBody instead.
 */
export interface BuyCreditsBody {
  price: number;
  payment_method: PaymentMethod;
}

/**
 * Notification settings PUT —
 * NotificationSettingsActivity.getNotificationSettingsAsJson.
 */
export interface NotificationSettingsBody {
  /** setting type → 1 | 0 */
  settings: Record<string, 0 | 1>;
}

/**
 * editProfile FieldMap — EditProfileFragment (partial update; empty map rejected).
 */
export interface EditProfileParams {
  email?: string;
  media_id?: number;
  county?: number;
  area?: number;
  /** Moshi JSON string of TermsConsentOptions */
  consent_options?: string;
}

/**
 * Buy-now FieldMap — BuyNowMainFragment.generateBasicBuyNowParams.
 * shipping is "collection" or ShippingAddress.regionId.
 */
export interface BuyNowParams {
  quantity: number;
  /** `collection` (BUY_NOW_COLLECTION) or ShippingAddress.regionId as string. */
  shipping: string;
  delivery_id?: number;
  payment_method?: PaymentMethod;
  /** PayPal pay path only (BuyNowConstants.ACCESS_TOKEN) */
  access_token?: string;
}

/**
 * OldApi offer / comment FieldMap — Comment.buildRequestParams.
 */
export interface OfferCommentParams {
  item_id: number;
  message?: string;
  offer?: string;
  comment_id?: number;
}

/**
 * Legacy search.json QueryMap — SearchParameters (Map&lt;String, String&gt;).
 * All keys optional. Android OldApiHelperImp injects include_pets="1", w, h
 * when calling through the helper; the TS client does not.
 *
 * Keys = SearchParameters.ParamKey (+ refine keys seller_type / condition / only_photos).
 */
export interface OldSearchParams {
  q?: string;
  search_cat?: string;
  pg?: string;
  /** App-hardcoded sort list — SearchSortBy. */
  sortby?: SearchSortBy;
  "countyID[]"?: string;
  "areaID[]"?: string;
  rs_min_price?: string;
  rs_max_price?: string;
  rs_min_year?: string;
  rs_max_year?: string;
  nearby_lat?: string;
  nearby_lon?: string;
  /** km string from nearby refine (`2` … `75`). */
  nearby_range?: NearbyRangeKm | string;
  w?: string;
  h?: string;
  watchlist?: string;
  notification?: string;
  price_facets_only?: string;
  cat_facets_only?: string;
  include_pets?: string;
  cache_version?: string;
  searchurl?: string;
  category_name?: string;
  category_children?: string;
  make_name?: string;
  model_name?: string;
  bodytype?: string;
  fueltype?: string;
  price_facet_label?: string;
  userID?: string;
  status?: string;
  /** Refine type: all | 0 (For sale) | wanted | swap. */
  type?: SearchAdType;
  /** Refine seller_type: 0 All | 1 Private | 2 Shop. */
  seller_type?: SearchSellerType;
  /** Refine condition: 0 All | excellent (Used) | brandnew. */
  condition?: SearchCondition;
  /** Refine checkbox — typically "1" when on. */
  only_photos?: string;
  /** Legacy ParamKey aliases still present on Android SearchParameters. */
  swap?: string;
  wanted?: string;
  all?: string;
}
