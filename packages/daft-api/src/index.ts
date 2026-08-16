/**
 * @daft-ie/api - Unofficial TypeScript API client for Daft.ie
 *
 * @example
 * ```typescript
 * import { DaftApi } from "@daft-ie/api";
 *
 * const daft = new DaftApi();
 *
 * // Search rooms to rent in Dublin under €600
 * const rooms = await daft.searchForSharing({
 *   county: "dublin",
 *   maxPrice: 600,
 * });
 *
 * for (const { listing } of rooms.listings) {
 *   console.log(`${listing.title} — ${listing.price}`);
 * }
 * ```
 *
 * @packageDocumentation
 */

export { ApiError, DaftApi, CLIENT_ID } from "./daft";
export {
  DEFAULT_RECAPTCHA_ACTION,
  DEFAULT_RECAPTCHA_TCP_PORT,
  fetchRecaptchaToken,
  recaptchaTcpConfigured,
  resolveRecaptchaTcpOptions,
} from "./recaptcha-tcp";
export type { RecaptchaMintResult, RecaptchaTcpOptions } from "./recaptcha-tcp";
export type {
  // Client options
  DaftApiOptions,
  DaftTokensSnapshot,
  SearchOptions,
  // Search
  SearchPayload,
  SearchResponse,
  SearchListingItem,
  Section,
  PropertyType,
  Facility,
  Sort,
  GeoSearchType,
  GeoFilter,
  Range,
  NamedFilter,
  RoomType,
  ROOM_TYPES,
  BedroomCount,
  FilterName,
  AndFilterName,
  RangeName,
  Paging,
  // Listing types
  Listing,
  Seller,
  SellerType,
  Ber,
  Point,
  ListingMedia,
  ResponsePaging,
  PropertyDetailsResponse,
  // Areas / locations
  Area,
  ClassifiedAreasResponse,
  Location,
  LocationArea,
  // Filters
  FilterResponse,
  FilterOption,
  FilterValue,
  // Misc public
  ReportReason,
  AreaMapping,
  AdConvertResponse,
  ReportAdRequest,
  AnalyticsEventBody,
  AdReplyMessageBody,
  PropertyLocation,
  TenantsDto,
  PropertyToSellDetails,
  SavedReply,
  MortgageComparisonBody,
  MortgageComparisonResult,
  Lender,
  // Auth
  TokenResponse,
  LogoutResponse,
  UserInfo,
  Consent,
  ContactInfo,
  UserAttributes,
  // Saved ads / searches
  SaveAdBody,
  SavedAdsAlerts,
  SavedAdListing,
  SavedAdsResponse,
  SavedSearchParamsBody,
  UpdateSearchParamsBody,
  SavedSearchListing,
  SavedSearchResponse,
  SavedSearchCreateResponse,
  // My ads
  MyAdsResponse,
  MyAd,
  MyAdMedia,
  MyAdType,
  MyAdFeaturedLevel,
  PropertyBedrooms,
  PropertyPrice,
  PropertyPayment,
  PropertyBundle,
  ParkingAccessType,
  AdStateCommand,
  AdStateBody,
  AdRelistBody,
  AdRelistResponse,
  // Inbox
  InboxEnquiriesResponse,
  InboxPagination,
  InboxReply,
  MarkReadRequest,
  // Offers
  AdOffers,
  Offer,
  Bidder,
  BuyerType,
  PurchaseType,
  MakeOfferBody,
  CreateBidderBody,
  // My property
  CreatePropertyDto,
  CreatePropertyLocation,
  MyPropertiesResponseDto,
  PropertyDto,
  PropertyImageDto,
  PropertyEstimateDto,
  ValuationAgentDto,
  // Push tokens
  PushTokenBody,
  // Legacy filter types
  AdState,
  Furnishing,
  MediaType,
  SaleType,
} from "./types";
