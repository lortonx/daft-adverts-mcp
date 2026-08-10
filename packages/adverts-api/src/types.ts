import type {
  Pagination,
  SearchAdvert,
  SearchResponse,
} from "./types/generated";
import type {
  AdSubType,
  DiscoverSectionType,
  PlaceAdType,
  UserType,
} from "./types/enums";

/** Options for {@link AdvertsApi}. */
export interface AdvertsApiOptions {
  /** Fresh API base (default https://new.api.adverts.ie/) */
  newBaseUrl?: string;
  /** Legacy API base (default https://api.adverts.ie/) */
  oldBaseUrl?: string;
  /** Touch / webviews (default https://touch.adverts.ie/) */
  touchBaseUrl?: string;
  /**
   * Fresh API key (`X-Adverts-Api-Key`).
   * Default: `process.env.ADVERTS_NEW_API_KEY`.
   */
  newApiKey?: string;
  /**
   * Legacy API key (`api_key` query).
   * Default: `process.env.ADVERTS_OLD_API_KEY`.
   */
  oldApiKey?: string;
  /** Access token from Account.access_token */
  accessToken?: string;
  /** Android versionCode string, e.g. "1001176" */
  appVersionCode?: string;
  /** Android versionName, e.g. "1.91.3" */
  appVersionName?: string;
  appTitle?: string;
  userAgent?: string;
  timeout?: number;
  fetchFn?: (
    input: string | URL | Request,
    init?: RequestInit
  ) => Promise<Response>;
  onTokensChange?: (tokens: AdvertsTokensSnapshot | null) => void;
}

export interface AdvertsTokensSnapshot {
  accessToken?: string;
}

/**
 * Account payload from NEW API (boxed Long/Integer/String with Java defaults).
 * Optionality: ANDROID.md — required = safe after successful deserialize.
 * access_token only present on authenticate → optional.
 * accessToken: camelCase seen on some payloads (see AdvertsApi.authenticate).
 */
export interface Account {
  user_id: number;
  username: string;
  status: string;
  sms_verified: number;
  user_type: UserType;
  /** Long default 0L in Account.java — always defined after Gson. */
  facebook_user_id: number;
  access_token?: string;
  accessToken?: string;
}

/** App config from GET app/config (verified live 2026-08-09). */
export interface AppConfig {
  skip_enabled: boolean;
  show_recently_viewed_ads: boolean;
  show_discover_content: boolean;
  show_category_search: boolean;
}

/**
 * Discover carousel ad card (live wire shape; not full AdvertSR).
 * ad_id + title always present in live samples; media/price/type flow-dependent.
 */
export interface DiscoverAd {
  ad_id: number;
  title: string;
  main_image?: string;
  price?: string;
  type?: PlaceAdType | string;
  /** Wire key `subtype` (AdvertSR @SerializedName). */
  subtype?: AdSubType | string;
}

/**
 * Discover carousel section (live + DiscoverAdResponse).
 * view_more is Java boolean primitive → required; id/type from live carousel rows.
 */
export interface DiscoverSection {
  id: string;
  type: DiscoverSectionType;
  view_more: boolean;
  title?: string;
  search_path?: string;
  ads?: DiscoverAd[];
}

/** Legacy search.json pagination — same fields as generated Pagination. */
export type OldSearchPagination = Pagination;

/** Legacy search.json row — same as generated SearchAdvert (search.Advert). */
export type OldSearchAdvert = SearchAdvert;

/**
 * Legacy search.json HTTP envelope (api.adverts.ie).
 * Inner body matches generated {@link SearchResponse} (`data`, facets, …).
 */
export interface OldSearchResponse {
  status: number;
  response: SearchResponse;
}

/** Request bodies / form maps */
export type {
  PlaceAdBody,
  UpdateAdBody,
  BumpAdBody,
  RelistAdBody,
  PayForAdBody,
  PaymentIntentBody,
  BuyCreditsBody,
  NotificationSettingsBody,
  EditProfileParams,
  BuyNowParams,
  OfferCommentParams,
  OldSearchParams,
} from "./types/requests";

/** @deprecated use OldSearchParams */
export type { OldSearchParams as OldSearchFilters } from "./types/requests";

/** Wire enums from Android defs + resource arrays. */
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
} from "./types/enums";
export type {
  SearchSortBy,
  SearchAdType,
  PlaceAdType,
  SearchSellerType,
  SearchCondition,
  PaymentMethod,
  AdAction,
  AdStatus,
  AdSubType,
  UpsellType,
  OrderType,
  DiscoverSectionType,
  AdLeadType,
  FeedbackApiValue,
  FeedbackType,
  Platform,
  LocationAction,
  UserType,
  NearbyRangeKm,
  ReportAdReason,
  WatchAdAction,
} from "./types/enums";

/** Generated Gson/Retrofit response models */
export * from "./types/generated";
