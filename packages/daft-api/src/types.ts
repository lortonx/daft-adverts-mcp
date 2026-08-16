/**
 * Daft.ie API Types
 * Verified against the real production API (gateway.daft.ie).
 * @module @daft-ie/api
 */

// ============================================================
// Search
// ============================================================

/** Search section types */
export type Section =
  | "residential-for-sale"
  | "residential-to-rent"
  | "commercial-for-sale"
  | "commercial-to-rent"
  | "sharing"
  | "student-accommodation-to-share"
  | "new-homes";

/** Property type filters */
export type PropertyType =
  | "houses"
  | "detached-houses"
  | "semi-detached-houses"
  | "terraced-houses"
  | "end-of-terrace-houses"
  | "townhouses"
  | "apartments"
  | "studio-apartments"
  | "duplexes"
  | "bungalows"
  | "sites"
  | "office-spaces"
  | "retail-units"
  | "industrial-units"
  | "restaurants-bars-hotels"
  | "commercial-sites"
  | "agricultural-land"
  | "development-land"
  | "industrial-sites"
  | "investment-properties";

/** Facility filters (accepted by the `facilities` andFilter) */
export type Facility =
  | "alarm"
  | "parking"
  | "wheelchair-access"
  | "ensuite"
  | "double-glazing"
  | "central-heating"
  | "gas-fired-central-heating"
  | "oil-fired-central-heating"
  | "furnished"
  | "part-furnished"
  | "unfurnished"
  | "garden"
  | "balcony"
  | "garage"
  | "broadband"
  | "pet-friendly"
  | "smart-home"
  | "swimming-pool"
  | "storage"
  | "on-street-parking";

/** Ad state filters */
export type AdState = "published" | "sale-agreed";

/** Furnishing type */
export type Furnishing = "unfurnished" | "furnished" | "part-furnished";

/** Media type filters */
export type MediaType = "virtual-tour" | "video";

/** Sale type filters */
export type SaleType = "auction";

/** Room types for the sharing section (verified: `filters.roomType` values) */
export const ROOM_TYPES = ["single", "double", "twin", "shared"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

/**
 * Bedroom count values accepted by the `numBeds` range filter
 * (verified: `v3/filters/search/{section}` DropDownRange, 0..15).
 */
export type BedroomCount =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15;

/**
 * Sort order. Real values from `SortBy` in the Android app:
 * bestMatch, publishDateDesc, publishDateAsc, priceDesc, priceAsc, distance.
 * Legacy aliases (dateAsc/dateDesc/priorityDate) are mapped automatically.
 */
export type Sort =
  | "bestMatch"
  | "publishDateDesc"
  | "publishDateAsc"
  | "priceDesc"
  | "priceAsc"
  | "distance"
  | "dateAsc"
  | "dateDesc"
  | "priorityDate";

/** Geo search type (from GeoSearchType enum in the Android app) */
export type GeoSearchType =
  | "STORED_SHAPES"
  | "POINT_AND_RADIUS"
  | "CUSTOM_SHAPES"
  | "MAP_SEARCH";

/**
 * Geographic filter for search. Mirrors the Android `GeoFilter` model:
 *  - STORED_SHAPES:  `storedShapeIds` (+ optional `name`)
 *  - POINT_AND_RADIUS: `lat`, `lon`, `rad`
 *  - MAP_SEARCH: `top`, `left`, `right`, `bottom` (+ `mapView: true`)
 *  - CUSTOM_SHAPES: `storedShapeIds`
 */
export interface GeoFilter {
  lat?: number;
  lon?: number;
  rad?: number;
  storedShapeIds?: string[];
  name?: string;
  geoSearchType?: GeoSearchType;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  mapView?: boolean;
}

/** Search filter names accepted by `POST /old/v1/listings` `filters` (verified live) */
export type FilterName =
  | "propertyType"
  | "roomType"
  | "mediaType"
  | "saleType"
  | "adState"
  | "furnishing";

/** Search filter names accepted in `andFilters` (verified live) */
export type AndFilterName = "facilities";

/** Range filter names accepted by `POST /old/v1/listings` `ranges` (verified live) */
export type RangeName = "salePrice" | "rentalPrice" | "numBeds";

/** Range filter (e.g. salePrice, rentalPrice, numBeds) */
export interface Range {
  name: RangeName | (string & {});
  from: string | number;
  to: string | number;
}

/** Named filter (e.g. propertyType) */
export interface NamedFilter {
  name: FilterName | AndFilterName | (string & {});
  values: string[];
}

/** Paging options (sent as strings by the app) */
export interface Paging {
  from: string;
  pageSize: string;
}

/** Search payload body for `POST /old/v1/listings` */
export interface SearchPayload {
  section?: Section;
  filters?: NamedFilter[];
  andFilters?: NamedFilter[];
  ranges?: Range[];
  paging?: Paging;
  geoFilter?: GeoFilter;
  terms?: string;
  sort?: Sort;
}

/** Friendly options accepted by the search helper methods. */
export interface SearchOptions {
  /** County name (auto-resolved to a stored shape id, e.g. "dublin"). */
  county?: string;
  /** Area/city name (auto-resolved to a stored shape id). */
  area?: string;
  /** Minimum price in EUR */
  minPrice?: number;
  /** Maximum price in EUR */
  maxPrice?: number;
  /** Minimum bedrooms */
  minBeds?: BedroomCount;
  /** Maximum bedrooms */
  maxBeds?: BedroomCount;
  /** Property types */
  propertyTypes?: PropertyType[];
  /** Facilities (AND filter) */
  facilities?: Facility[];
  /** Room types (sharing section only) */
  roomTypes?: RoomType[];
  /** Search terms */
  terms?: string;
  /** Sort order */
  sort?: Sort;
  /** Page number (1-based) */
  page?: number;
  /** Results per page (max 50) */
  pageSize?: number;
  /** Explicit geo filter (takes precedence over county/area) */
  geoFilter?: GeoFilter;
}

// ============================================================
// Search response
// ============================================================

/** Seller / agent information */
export type SellerType = "BRANDED_AGENT" | "UNBRANDED_AGENT" | "PRIVATE_USER";

export interface Seller {
  sellerId: number;
  name: string;
  phone?: string;
  branch?: string;
  profileImage?: string;
  profileRoundedImage?: string;
  standardLogo?: string;
  squareLogo?: string;
  backgroundColour?: string;
  /** Raw Daft seller type: BRANDED_AGENT | UNBRANDED_AGENT | PRIVATE_USER */
  sellerType?: SellerType | string;
  /** PSRA licence number when present (agents). */
  licenceNumber?: string;
  showContactForm?: boolean;
  premierPartnerSeller?: boolean;
  sellerAvailable?: boolean;
}

/** BER (Building Energy Rating) */
export interface Ber {
  rating: string;
}

/** Media object on a listing */
export interface ListingMedia {
  images: Record<string, string>[];
  totalImages?: number;
}

/** Geo point on a listing (GeoJSON). `coordinates` is [lon, lat]. */
export interface Point {
  type?: string;
  coordinates: [number, number];
}

/**
 * A listing as returned by the API. All price/bedroom fields are strings
 * (e.g. "€350,000", "3 Bed", "1 & 2 bed"). `publishDate` is epoch millis in
 * search results but an ISO date string ("2026-08-08") in the details
 * response. `numBathrooms` only appears in the full property-details response
 * for for-sale listings (rentals omit it).
 */
export interface Listing {
  id: number;
  title: string;
  seoTitle: string;
  sections?: string[];
  saleType?: string[];
  featuredLevel?: string;
  featuredLevelFull?: string;
  sticker?: string;
  publishDate?: number | string;
  firstPublishDate?: number;
  lastUpdateDate?: number;
  category?: string;
  price?: string;
  abbreviatedPrice?: string;
  numBedrooms?: string;
  numBathrooms?: string;
  propertyType?: string;
  daftShortcode?: string;
  seller: Seller;
  dateOfConstruction?: string;
  primaryAreaId?: number;
  isInRepublicOfIreland?: boolean;
  media?: ListingMedia;
  ber?: Ber;
  platform?: string;
  point?: Point;
  seoFriendlyPath?: string;
  prs?: boolean;
  pageBranding?: Record<string, unknown>;
  state?: string;
  premierPartner?: boolean;
  betterBest?: string | Record<string, unknown>;
  facilities?: { key: string; name: string }[];
  /** Bullet features on the full details response (often absent from search). */
  features?: string[];
  sellingType?: string;
  description?: string;
  areaName?: string;
  addressDetails?: Record<string, unknown>;
  listingViews?: number;
  /** Raw numeric fields on details (e.g. price, section). */
  nonFormatted?: Record<string, unknown>;
}

/** A single item in `searchResponse.listings` (nested under `.listing`) */
export interface SearchListingItem {
  listing: Listing;
  savedAd?: unknown;
  imageRestricted?: boolean;
}

/** Paging object returned by the search endpoint */
export interface ResponsePaging {
  totalPages: number;
  currentPage: number;
  nextFrom?: number;
  previousFrom?: number;
  displayingFrom: number;
  displayingTo: number;
  totalResults: number;
  pageSize?: number;
}

/** Search response body */
export interface SearchResponse {
  listings: SearchListingItem[];
  paging: ResponsePaging;
}

// ============================================================
// Property details
// ============================================================

/** Response of `GET /api/v3/ads/listing/{id}` */
export interface PropertyDetailsResponse {
  listing: Listing;
  dfpTargetingValues?: unknown;
  breadcrumbs?: unknown;
  srpLinking?: unknown;
  listingViews?: number;
  canonicalUrl?: string;
  savedAd?: unknown;
  buyingBudgetDetail?: unknown;
  relevantAds?: unknown;
  amenities?: unknown;
  developerSponsor?: unknown;
}

// ============================================================
// Areas / autocomplete
// ============================================================

/** A location area (id is a string, usable as a storedShapeId) */
export interface Area {
  id: string;
  displayName: string;
  displayValue: string;
  propertyCount?: Record<string, number>;
}

/** Response of `GET /old/v1/location/classifiedAreas` */
export interface ClassifiedAreasResponse {
  counties: Area[];
  cities: Area[];
  colleges: Area[];
  areas: Area[];
}

/** A sub-area reference inside a Location autocomplete result */
export interface LocationArea {
  areaId: number;
  name: string;
  countyId: number;
  areaType: string;
}

/** A location from `GET /api/v1/locations/autocomplete?query=` */
export interface Location {
  latitude: number;
  longitude: number;
  address: string[];
  eircode?: string;
  matchLevel?: string;
  areas?: LocationArea[];
}

// ============================================================
// Filters
// ============================================================

export interface FilterValue {
  valueType?: string;
  initialLoad?: boolean;
  url?: string;
}

export interface FilterOption {
  id: number;
  name: string;
  displayName: string;
  variant?: string;
  searchQueryGroup?: string;
  filterType?: { id: number; name: string };
  values?: FilterValue[];
}

/** Response of `GET /old/v3/filters/search/{section}` */
export interface FilterResponse {
  name: string;
  showByDefault?: FilterOption[];
  filters?: FilterOption[];
}

// ============================================================
// Misc public endpoints
// ============================================================

/** Response of `GET /old/v1/report/reasons` */
export interface ReportReason {
  id: number;
  title: string;
  text: string;
}

/** Response of `GET /api/v1/locations/areas/{areaId}/mapping/allianz` */
export interface AreaMapping {
  daftAreaId: string;
  allianzAreaId: string;
}

// ============================================================
// Auth (Keycloak)
// ============================================================

/** Response of `POST /auth/realms/daft/protocol/openid-connect/token` */
export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in?: number;
  refresh_token?: string;
  token_type: string;
  id_token?: string;
  scope?: string;
  "not-before-policy"?: number;
  session_state?: string;
}

// ============================================================
// Client options
// ============================================================

/** API client options */
export interface DaftApiOptions {
  /**
   * Common gateway base URL (default `https://gateway.daft.ie`).
   * The "old" search API is derived as `${baseUrl}/old`.
   */
  baseUrl?: string;
  /** Auth base URL (default `https://auth.daft.ie`). */
  authUrl?: string;
  /** Mapper base URL (default the Daft production mapper). */
  mapperUrl?: string;
  /** Custom user agent */
  userAgent?: string;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Request timeout in ms */
  timeout?: number;
  /** Custom fetch function (for testing or custom HTTP client) */
  fetchFn?: (
    input: string | URL | Request,
    init?: RequestInit
  ) => Promise<Response>;
  /** Platform: "web" or "android" (default: "web") */
  platform?: "web" | "android";
  /** App version (default: "9.8.1") */
  appVersion?: string;
  /** Android OS version used in the user-agent when platform is "android". */
  osVersion?: string;
  /** Bearer token used to authenticate requests (optional). */
  token?: string;
  /** Alias for `token`. */
  authToken?: string;
  /** Long-lived refresh token. Enables automatic rotation on 401. */
  refreshToken?: string;
  /**
   * Automatically refresh the access token once on 401 and retry the request.
   * Requires `refreshToken`. Default: true.
   */
  autoRefresh?: boolean;
  /**
   * Keycloak client id used by `login()` / `refreshToken()` / `logout()`.
   * Default: `process.env.DAFT_CLIENT_ID`.
   */
  clientId?: string;
  /**
   * Called whenever access/refresh tokens change (login, refresh rotation, clear).
   * Pass `null` when the session is cleared. Use to persist tokens across process restarts.
   */
  onTokensChange?: (tokens: DaftTokensSnapshot | null) => void;
  /**
   * Override reCAPTCHA mint used by {@link DaftApi.sendMessage} when no explicit
   * token is passed. Default: TCP mint via `DAFT_RECAPTCHA_TCP_HOST`.
   */
  mintRecaptchaToken?: () => Promise<{ token: string; action: string }>;
  /** TCP mint host (overrides `DAFT_RECAPTCHA_TCP_HOST`). */
  recaptchaTcpHost?: string;
  /** TCP mint port (default 17373 / `DAFT_RECAPTCHA_TCP_PORT`). */
  recaptchaTcpPort?: number;
  /** Recaptcha-Action for auto mint (default `enquiry_form_submit`). */
  recaptchaAction?: string;
}

/** Snapshot passed to {@link DaftApiOptions.onTokensChange}. */
export interface DaftTokensSnapshot {
  accessToken?: string;
  refreshToken?: string;
}

// ============================================================
// User info / consents
// ============================================================

/** Consent flags for a Daft account (PATCH /users/{id}/consents) */
export interface Consent {
  receiveEmailAccepted: boolean;
  receiveNotificationAccepted: boolean;
  termsOfUseAccepted: boolean;
}

/** Contact information on a user */
export interface ContactInfo {
  email?: string;
  altEmail?: string;
  phoneInfo?: string;
}

/** A key/value user attribute */
export interface UserAttributes {
  key?: string;
  value?: string;
}

/** Response of `GET /api/v1/users/{userId}` */
export interface UserInfo {
  userId: number;
  legacyId?: number;
  username?: string;
  email?: string;
  name?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  verified?: boolean;
  phoneVerified?: boolean;
  verifiedPhone?: string;
  consent?: Consent;
  contactInfo?: ContactInfo;
  segments?: unknown[];
  userAttributes?: UserAttributes[];
  origin?: string;
  buying_budget?: unknown;
  hasBuyingBudget?: boolean;
}

// ============================================================
// Saved ads / saved searches
// ============================================================

/** Alert preferences attached to a saved ad */
export interface SavedAdsAlerts {
  developmentAlert: boolean;
  priceChangeAlert: boolean;
}

/** A single saved listing */
export interface SavedAdListing {
  listing: Listing;
  savedAd?: SavedAdsAlerts;
  alerts?: SavedAdsAlerts;
}

/** Response of `GET /api/v2/saved-ads/{userId}?pageSize=&from=` */
export interface SavedAdsResponse {
  savedListings: SavedAdListing[];
  paging: ResponsePaging;
}

/** Body of `POST /api/v1/saved-ads` and `PATCH /api/v1/saved-ads` */
export interface SaveAdBody {
  adId: number;
  openViewingAlert?: boolean;
  priceChangeAlert?: boolean;
  statusAlert?: boolean;
}

/** Body of `POST /api/v1/saved-searches` */
export interface SavedSearchParamsBody {
  title?: string;
  notificationFrequency?: string;
  channels?: string[];
  searchRequest: SearchPayload;
}

/** Body of `PATCH /api/v1/users/{userId}/saved/searches/{id}/alerts` */
export interface UpdateSearchParamsBody {
  notificationFrequency?: string;
  channels?: string[];
}

/** A saved search as returned by the API */
export interface SavedSearchListing {
  id: string;
  title?: string;
  notificationFrequency?: string;
  notificationChannels?: string[];
  channels?: string[];
  details?: unknown;
  filters?: unknown;
  numberOfFilters?: number;
  request?: SearchPayload;
  fromLegacy?: boolean;
}

/** Response of `GET /api/v1/users/{userId}/saved/searches` */
export interface SavedSearchResponse {
  savedSearches: SavedSearchListing[];
}

/** Response of `POST /api/v1/saved-searches` */
export interface SavedSearchCreateResponse {
  status?: string;
  message?: string;
  savedSearchID?: string;
}

// ============================================================
// My ads
// ============================================================

/** Ad state commands accepted by `PUT /api/v1/properties/{adId}/state` */
export type AdStateCommand =
  | "PAUSE"
  | "REACTIVATE"
  | "RENEW"
  | "DELETE"
  | "UNDELETE";

/** Body of `PUT /api/v1/properties/{adId}/state` */
export interface AdStateBody {
  state: AdStateCommand;
}

/** Body of relisting a property (also `PUT /api/v1/properties/{adId}/state`) */
export interface AdRelistBody {
  state: "REACTIVATE";
}

/** Response of relisting an archived ad */
export interface AdRelistResponse {
  newAdId?: string;
  redirectURL?: string;
}

/** Response of `GET /api/v1/ads/sites/daft/convert/{legacyAdId}` */
export interface AdConvertResponse {
  id: number;
  newAdId: number;
  redirectURL?: string;
  state?: string;
}

export type MyAdType =
  | "sale"
  | "rental"
  | "sharing"
  | "commercial"
  | "new_development"
  | "parking"
  | "unknown";

export type MyAdFeaturedLevel =
  | "BASIC"
  | "LITE"
  | "STANDARD"
  | "FEATURED"
  | "PREMIUM";

export type ParkingAccessType =
  | "parking_access_24hour"
  | "parking_access_business_hours";

export interface MyAdMedia {
  url: string;
}

export interface PropertyBedrooms {
  totalBeds: number;
  singleBeds: number;
  doubleBeds: number;
  twinBeds: number;
}

export interface PropertyPriceBedroom {
  bedrooms: PropertyBedrooms;
  price: number;
}

export interface PropertyPrice {
  saleValue?: number;
  rentalValue?: number;
  onApplication?: boolean;
  currency?: string;
  collectionPeriod?: string;
  bedrooms?: PropertyPriceBedroom[];
}

export interface PropertyPayment {
  status?: string;
}

export interface PropertyBundle {
  featuredLevel?: MyAdFeaturedLevel;
  productIds?: string[];
}

/** A single ad in the user's "my ads" list */
export interface MyAd {
  adId: string;
  title: string;
  state?: string;
  type?: MyAdType;
  propertyType?: string;
  price?: PropertyPrice;
  bedrooms?: PropertyBedrooms;
  bathrooms?: number;
  capacity?: number;
  publishDate?: string;
  firstPublishDate?: string;
  renewedDate?: string;
  endDate?: string;
  bestMatchSortDate?: string;
  parkingAccess?: ParkingAccessType;
  payment?: PropertyPayment;
  photos?: MyAdMedia[];
  videos?: MyAdMedia[];
  propertyBundle?: PropertyBundle;
  legacyId?: string;
}

/** Response of `GET /api/v1/users/{userId}/properties?order=desc&sort=_id` */
export interface MyAdsResponse {
  data: MyAd[];
}

// ============================================================
// Inbox
// ============================================================

/** Pagination object returned by the inbox endpoint */
export interface InboxPagination {
  totalResults: number;
  totalPages: number;
  pageNumber: number;
  pageSize: number;
  resultsOnCurrentPage: number;
  firstPage?: boolean;
  lastPage?: boolean;
  empty?: boolean;
}

/** A single enquiry reply in the inbox */
export interface InboxReply {
  replyId: string;
  adId: string;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  read?: boolean;
  createdDate?: string;
}

/** Response of `GET /api/v3/enquiries?adId=&pageNumber=` */
export interface InboxEnquiriesResponse {
  adTitle: string;
  replies: InboxReply[];
  pagination: InboxPagination;
}

/** Body item of `PATCH /api/v3/replies` */
export interface MarkReadRequest {
  replyId: string;
  read: boolean;
}

// ============================================================
// Offers
// ============================================================

export interface BuyerType {
  firstTimeBuyer: boolean;
  mover: boolean;
}

export interface PurchaseType {
  cashBuyer: boolean;
  mortgageApproved: boolean;
}

/** A single offer on a property */
export interface Offer {
  amount: number;
  bidderId: string;
  createDate: string;
  flags?: unknown;
  status?: string;
}

/** A bidder on a property */
export interface Bidder {
  bidderId: string;
  alias?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  createDate?: string;
  buyerType?: BuyerType;
  purchaseType?: PurchaseType;
  mortgageApproved?: boolean;
  cashBuyer?: boolean;
  firstTimeBuyer?: boolean;
  mover?: boolean;
  isMe?: boolean;
  makeOfferPrivate?: boolean;
  conditions?: string;
  status?: string;
}

/** Response of `GET /api/v1/properties/{ad_id}/offers` */
export interface AdOffers {
  status?: string;
  minimumIncrement?: number;
  bidders?: Bidder[];
  offers?: Offer[];
  showOfferHistorySaleAgreed?: boolean;
  makeOfferPrivate?: boolean;
  awaitingBidders?: boolean;
  bookingDeposit?: number;
  highestOffer?: number;
  minimumOfferAmount?: number;
  offersCount?: number;
}

/** Body of `POST /api/v1/properties/{ad_id}/offers/submissions` */
export interface MakeOfferBody {
  amount: number;
  conditions: string;
}

/** Body of `POST /api/v1/properties/{ad_id}/offers/bidders` */
export interface CreateBidderBody {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  buyerType: BuyerType;
  purchaseType: PurchaseType;
}

// ============================================================
// Mortgage comparison
// ============================================================

/** Body of `POST /old/v1/daft-mortgages/comparison` */
export interface MortgageComparisonBody {
  propertyValue: number;
  mortgageAmount: number;
  term: number;
}

export interface Lender {
  lender: string;
  rate: string;
  rateType?: string;
  aprc?: string;
  bestFor?: string[];
  accessViaBrokerOnly?: boolean;
  fixedRateTerm?: string;
  monthlyRepayments?: number;
}

/** Response of `POST /old/v1/daft-mortgages/comparison` */
export interface MortgageComparisonResult {
  propertyValue?: number;
  mortgageAmount?: number;
  term?: number;
  rate?: string;
  rateType?: string;
  resultsSummary?: string[];
  results?: Lender[];
  paging?: ResponsePaging;
}

// ============================================================
// Reply / enquiry forms
// ============================================================

/** Location used when selling a property (address + eircode) */
export interface PropertyLocation {
  address: string;
  eircode?: string;
}

/** Tenants count for a rental enquiry */
export interface TenantsDto {
  adultTenants: number;
}

/** Property-to-sell details on an enquiry reply */
export interface PropertyToSellDetails {
  location?: PropertyLocation;
  propertyToSellStatus?: string;
  sellingTimeline?: string;
  validationRequest?: string;
}

/** Body of `POST /old/v4/reply` */
export interface AdReplyMessageBody {
  id?: number;
  adId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  message: string;
  replyDate?: string;
  moveInDate?: string;
  saveReply?: boolean;
  mortgageApproved?: boolean;
  buyerType?: BuyerType;
  pets?: boolean;
  tenants?: TenantsDto;
  propertyToSellDetails?: PropertyToSellDetails;
}

/** Saved reply returned by `GET /api/v1/forms/enquiry/{listingId}` */
export interface SavedReply {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  message: string;
  enquired?: boolean;
  mortgageApproved?: boolean;
  buyerType?: BuyerType;
  propertyToSellDetails?: PropertyToSellDetails;
}

/** Body of `POST /old/v1/report` */
export interface ReportAdRequest {
  site: string;
  adId: number;
  reason: number;
  message?: string;
}

/** Body of `POST /old/v1/tracking` */
export interface AnalyticsEventBody {
  type: string;
  adId: number;
  featuredLevel?: string;
}

// ============================================================
// My property
// ============================================================

/** A location for creating a "my property" */
export interface CreatePropertyLocation {
  address: string;
  eircode?: string;
}

/** Body of `POST /api/v1/users/my-properties` */
export interface CreatePropertyDto {
  location: CreatePropertyLocation;
}

export interface PropertyImageDto {
  size300x200?: string;
  size360x240?: string;
  size400x300?: string;
  size600x600?: string;
  size720x480?: string;
}

export interface PropertyEstimateDto {
  prediction: number;
  lowerEstimate: number;
  upperEstimate: number;
  confidence?: number;
  createDate?: string;
}

export interface ValuationAgentDto {
  agentId: string;
  name: string;
  address?: string;
  logo?: string;
  backgroundColour?: string;
}

/** A single "my property" */
export interface PropertyDto {
  propertyId: string;
  address: string;
  eircode?: string;
  images?: PropertyImageDto[];
  latestPropertyPriceEstimate?: PropertyEstimateDto;
  valuationAgents?: ValuationAgentDto[];
}

/** Response of `GET /api/v1/users/my-properties` */
export interface MyPropertiesResponseDto {
  properties: PropertyDto[];
  valuationAgents?: ValuationAgentDto[];
}

// ============================================================
// Push tokens
// ============================================================

/** Body of `POST /old/v1/users/{userId}/tokens/push` (raw token string) */
export interface PushTokenBody {
  token: string;
}

/** Response of the Keycloak logout endpoint. */
export interface LogoutResponse {
  status?: string;
  [key: string]: unknown;
}
