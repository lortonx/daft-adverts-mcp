/**
 * Generated from Android Gson response models (AdvertsFieldNamingStrategy).
 * Optionality: primitive | Kotlin m.f non-null | forceRequired → required.
 * Do not edit — run: bun research/regenerate.mjs
 */

export type { Account, AppConfig, DiscoverAd, DiscoverSection, OldSearchResponse } from "../types";

/** Primitive JSON scalar used when Gson field type is unresolved. */
export type JsonPrimitive = string | number | boolean | null;

/** Opaque autoform option (Android autoform.* — not under api/responses). */
export interface AdPlacementFormOption {
  key: string;
  label?: string;
  type?: string;
  value?: JsonPrimitive;
  required?: boolean;
}

/** From api/responses/ads/AcceptedOffer.java */
export interface AcceptedOffer {
  buyer_avatar?: string;
  buyer_handle: string;
  buyer_id: number;
  offered_amount: string;
  offered_at: string;
}

/** From api/responses/ads/AdCounts.java */
export interface AdCounts {
  active: number;
  pending: number;
  sold: number;
  withdrawn: number;
}

/** From api/responses/ads/AdImage.java */
export interface AdImage {
  large?: string;
  thumb?: string;
  xlarge?: string;
  cache_large?: string;
  cache_xlarge?: string;
  cache_thumb?: string;
  width?: string;
  height?: string;
}

/** From api/responses/ads/AdResponse.java */
export interface AdResponse {
  response?: Advert & { message?: string; data?: Comment[]; pagination?: Pagination; advert?: Advert };
  status: number;
}

/** From api/responses/ads/AdTypeUpsellOption.java */
export interface AdTypeUpsellOption {
  cost: number;
}

/** From api/responses/ads/AdTypeUpsellOptions.java */
export interface AdTypeUpsellOptions {
  preferred_payment_method: string;
  basic?: AdTypeUpsellOption;
  premium?: AdTypeUpsellOption;
  priority?: AdTypeUpsellOption;
  promo?: DiscountBannerModel;
  subtype?: import("./enums").AdSubType | string;
}

/** From api/responses/ads/Advert.java */
export interface Advert {
  href?: string;
  accept_cash?: number | boolean;
  accept_paypal?: number | boolean;
  accept_stripe?: number | boolean;
  accepted_offer?: AcceptedOffer;
  active_ads?: number | string;
  ad_condition?: string;
  ad_num_in_category?: number;
  ad_status?: import("./enums").AdStatus | string;
  ad_subtype?: import("./enums").AdSubType | string;
  ad_type?: import("./enums").PlaceAdType | string;
  allow_swaps?: number;
  analytics_link?: string;
  area_name?: string;
  avatar_url?: string | null;
  bump_costs?: BumpInformation[];
  category_branch?: string[];
  category_id?: number | string;
  category_name?: string;
  comments_disabled?: number | boolean;
  contact_email?: string;
  contact_phone?: string;
  county_id?: number | string;
  county_name?: string;
  credits_cost?: number;
  description?: string;
  eligible_for_withdrawal?: number | boolean;
  feedback_negative?: number;
  feedback_neutral?: number;
  feedback_positive?: number | string;
  id?: number | string;
  priImageUrl?: string;
  images?: AdImage[];
  is_dealer?: number | boolean;
  is_free_offer_allowed?: number | boolean;
  is_merchant?: number | boolean;
  is_simi?: number | boolean;
  is_top_seller?: number | boolean;
  location?: string;
  num_views?: number | string;
  payment_options?: Record<string, string>;
  phone1?: string;
  price?: number | string;
  price_string?: string;
  priority_label?: string;
  quantity?: number | string;
  quick_sale?: number | boolean;
  region_id?: number | string;
  renewed_ago?: string;
  reserve_price?: number;
  root_category_name?: string;
  second_level_category_id?: number;
  second_level_category_name?: string;
  shipping_options?: Record<string, string>;
  shop_shipping_options?: JsonPrimitive;
  start_date?: string;
  title?: string;
  user?: string;
  user_id?: number | string;
  user_type?: string;
  watch?: number | boolean;
  watcher_count?: number;
  area_id?: number | string;
  edit_date?: string;
  refresh_date?: string;
  comment_date?: string | null;
  comment_count?: number | string;
  sold_date?: string | null;
  offer_accepted?: JsonPrimitive;
  priority?: number | string;
  cacheImageUrl?: string;
  is_trader?: number | boolean;
  sms_verified?: number | boolean;
  address_verified?: number | boolean;
  no_offer?: boolean;
  price_label?: string;
  shipping?: Record<string, string>;
  payment_method?: Record<string, string>;
  feedback_percentage?: number;
  total_ads?: number | string;
  canpm?: number | boolean;
  size?: number;
  offer_allowed?: boolean;
  highest_offer?: JsonPrimitive;
  has_premium_display?: number | boolean;
  pet_type?: string;
  sold_label?: string;
  is_free_stuff?: number | boolean;
}

/** From api/responses/AdvertInterface.java */
export interface AdvertInterface {
}

/** From api/responses/AdvertsBaseError.java */
export interface AdvertsBaseError {
  message?: string;
}

/** From api/responses/notification/AdvertsNotification.java */
export interface AdvertsNotification {
  ad_title: string;
  additional_data?: NotificationAdditionalData;
  conversation_id: string;
  date_created: string;
  extra_id: number;
  feedback_type: string;
  for_user_handle: string;
  image?: string;
  feedback_recipient_name?: JsonPrimitive;
  is_unread: boolean;
  item_id: number;
  link: string;
  location?: string;
  message: string;
  message_history: NotificationMessage[];
  message_id?: JsonPrimitive;
  name: string;
  notification_id?: JsonPrimitive;
  notification_tag: string;
  offer_amount?: string;
  other_user_avatar?: string;
  title: string;
  type: string;
  user_id: number;
}

/** From api/responses/ads/AdvertSR.java */
export interface AdvertSR {
  ad_id?: number;
  ad_type?: string;
  additional_data?: SRAdditionalData;
  comment_count?: number | null;
  free_bump_available?: boolean;
  is_dealer?: boolean;
  is_merchant?: boolean;
  is_simi?: boolean;
  is_top_seller?: number | boolean;
  is_watched?: boolean;
  last_renewed_at?: string;
  location?: string;
  main_image?: string;
  is_premium?: boolean;
  price?: string;
  priority_expiry_info?: string;
  status?: string;
  subtype?: import("./enums").AdSubType | string;
  title?: string | null;
  user_id?: number | null;
  view_count?: number | null;
  watcher_count?: number;
  formatted_last_renewed_date?: string;
  username?: string | null;
  type?: string | null;
}

/** From api/responses/comments/AllowSwapCommentResponse.java */
export interface AllowSwapCommentResponse {
  message: string;
}

/** From api/responses/AppStatusResponse.java */
export interface AppStatusResponse {
  latest_version: string;
  minimum_version: string;
}

/** From api/responses/ads/Avatar.java */
export interface Avatar {
  image?: string;
}

/** From api/responses/ads/BasicAdvert.java */
export interface BasicAdvert {
  ad_id: number;
  ad_status: import("./enums").AdStatus | string;
  can_leave_feedback?: boolean;
  category: Category;
  media: Media[];
  title: string;
}

/** From api/responses/user/BasicUser.java */
export interface BasicUser {
  avatar_url?: string;
  user_id: number;
  username?: string;
  id?: number;
  is_top_seller?: number | boolean;
  location?: string;
  registered_at?: string;
  can_pm?: boolean;
  can_leave_feedback?: boolean;
}

/** From api/responses/pms/BatchDeleteConversationResponse.java */
export interface BatchDeleteConversationResponse {
  failed: string[];
  success: string[];
}

/** From api/responses/BatchDeleteResponse.java */
export interface BatchDeleteResponse {
  failed: number[];
  success: number[];
}

/** From api/responses/ads/BumpAdOptionsResponse.java */
export interface BumpAdOptionsResponse {
  options: BumpInformation[];
  promo?: DiscountBannerModel;
}

/** From api/responses/ads/BumpColour.java */
export interface BumpColour {
  b: number;
  g: number;
  r: number;
}

/** From api/responses/ads/BumpInformation.java */
export interface BumpInformation {
  allowed: boolean;
  bump_type?: import("./enums").UpsellType | string;
  colour?: BumpColour;
  cost: number;
  cost_label?: string;
  description?: string;
}

/** From api/responses/buyNow/BuyNowOptions.java */
export interface BuyNowOptions {
  ad_id: number;
  ad_title: string;
  buyer_address: ShippingAddress[];
  collection: string;
  default_payment_option: string;
  merchant_address: string;
  merchant_id: number;
  merchant_name: string;
  payment_options: string[];
  pri_image_url?: string;
  price: number;
  shipping_options: ShippingRegion[];
  stock: number;
}

/** From api/responses/ads/CarAdvert.java */
export interface CarAdvert {
  body_type_name?: string;
  car_extras?: string[];
  car_year?: string;
  colour?: string;
  dealer?: Dealer;
  doors?: string;
  engine_size?: string;
  engine_size_desc?: string;
  fuel_type_name?: string;
  has_full_service_history: boolean;
  make?: string;
  make_name?: string;
  mileage_kms?: string;
  mileage_miles?: string;
  model_name?: string;
  nct: boolean;
  nct_display?: string;
  roadtax: number;
  tax: boolean;
  tax_display?: string;
  tracking_pixel?: string;
  transmission_type?: string;
  warranty: boolean;
}

/** From api/responses/categories/Category.java */
export interface Category {
  id: number;
  name: string;
  allowed_ad_types?: string[];
  children_count?: number;
  has_children?: boolean;
  properties?: JsonPrimitive[];
  make?: string | null;
}

/** From api/responses/categories/CategoryBranch.java */
export interface CategoryBranch {
  id: number;
  name: string;
}

/** From api/responses/search/CategoryFacet.java */
export interface CategoryFacet {
  categoryId: number;
  categoryName: string;
  count: number;
  hasChildren?: number | boolean;
}

/** From api/responses/categories/CategoryPhraseSuggestion.java */
export interface CategoryPhraseSuggestion {
  highlighted: string;
  text: string;
  highlight_wrapper: string;
}

/** From api/responses/categories/CategoryResponse.java */
export interface CategoryResponse {
  children: Category[];
  root: Category;
}

/** From api/responses/categories/CategorySearchResponse.java */
export interface CategorySearchResponse {
  category_suggestions: CategorySearchSuggestion[];
  phrase_suggestion?: CategoryPhraseSuggestion;
}

/** From api/responses/categories/CategorySearchSuggestion.java */
export interface CategorySearchSuggestion {
  tree: string[];
  category_tree: CategoryBranch[];
}

/** From api/responses/ads/ChangeAdStatusMessageResponse.java */
export interface ChangeAdStatusMessageResponse {
  message?: string;
}

/** From api/responses/ads/ChangeAdStatusResponse.java */
export interface ChangeAdStatusResponse {
  response?: ChangeAdStatusMessageResponse;
  status: number;
}

/** From api/responses/ads/Comment.java */
export interface Comment {
  ad_comment?: string;
  ad_id: string;
  ad_owner: string;
  avatar?: Avatar;
  comment_date: string;
  current_offer: boolean;
  handle: string;
  id: string;
  offer?: string;
  offer_accepted: boolean;
  user_id: string;
  accepted_offer?: AcceptedOffer;
}

/** From api/responses/pms/Conversation.java */
export interface Conversation {
  advert?: JsonPrimitive;
  advert_id: number;
  id: string;
  is_unread: boolean;
  message_count: number;
  subject: string;
  summary: string;
  updated_at: string;
  user: ConversationUser;
  with_user: ConversationUser;
}

/** From api/responses/pms/ConversationUser.java */
export interface ConversationUser {
  avatar_url?: string;
  id: string;
  last_online?: string;
  location: string;
  username: string;
}

/** From api/responses/credits/CreditAmount.java */
export interface CreditAmount {
  bonus: number;
  price: number;
}

/** From api/responses/user/CreditCard.java */
export interface CreditCard {
  card?: string;
}

/** From api/responses/credits/CreditOptions.java */
export interface CreditOptions {
  price_options: CreditAmount[];
}

/** From api/responses/ads/Dealer.java */
export interface Dealer {
  dealer_phone?: string;
}

/** From api/responses/ads/DiscountBannerModel.java */
export interface DiscountBannerModel {
  background_colour_end?: string;
  background_colour_start?: string;
  highlight_text_colour?: string;
  highlight_wrapper: string;
  highlighted_subtitle: string;
  icon_png?: string;
  subtitle: string;
  title: string;
}

/** From api/responses/discover/DiscoverAdResponse.java */
export interface DiscoverAdResponse {
  ads?: AdvertSR[];
  id?: string;
  search_path?: string;
  title?: string;
  type?: string;
  view_more: boolean;
}

/** From api/responses/discover/DiscoverThemeResponse.java */
export interface DiscoverThemeResponse {
  section_one: Theme;
  section_three: Theme;
  section_two: Theme;
  title: string;
  type: string;
}

/** From api/responses/account/DoneDealExportStatusDto.java */
export interface DoneDealExportStatusDto {
  consent_given?: JsonPrimitive;
  eligible_for_export?: JsonPrimitive;
  imported_to_dd?: JsonPrimitive;
}

/** From api/responses/feedback/Feedback.java */
export interface Feedback {
  ad_id: number;
  ad_title?: string;
  can_leave_feedback: boolean;
  comment: string;
  comment_posted_at: string;
  from_user: FeedbackUser;
  id: number;
  response?: string;
  response_posted_at?: string;
}

/** From api/responses/feedback/FeedbackResponse.java */
export interface FeedbackResponse {
  feedback?: Feedback[];
  for_user?: FeedbackUser;
  stats?: FeedbackStats;
}

/** From api/responses/feedback/FeedbackStats.java */
export interface FeedbackStats {
  negative: number;
  percentage: number;
  positive: number;
  score: number;
  total: number;
}

/** From api/responses/feedback/FeedbackUser.java */
export interface FeedbackUser {
  avatar_url?: string;
  id: number;
  username: string;
  user_id?: number;
  is_top_seller?: number | boolean;
}

/** From api/responses/user/FollowedUsersResponse.java */
export interface FollowedUsersResponse {
  followed_users?: PublicProfile[];
}

/** From api/responses/ads/HighestOffer.java */
export interface HighestOffer {
  handle?: string;
  id?: string;
  offer?: string;
  user_id?: string;
}

/** From api/responses/report/InnerResponse.java */
export interface InnerResponse {
  message?: string;
}

/** From api/responses/user/Interaction.java */
export interface Interaction {
  ads?: BasicAdvert[];
  allowed: boolean;
  rules?: string;
}

/** From api/responses/ads/JobAdvert.java */
export interface JobAdvert {
  employer_name?: string;
  employment_type_name?: string;
}

/** From api/responses/ads/LeadResponse.java */
export interface LeadResponse {
  message?: string;
}

/** From api/responses/location/Location.java */
export interface Location {
  id: number;
  name: string;
}

/** From api/responses/location/LocationResponse.java */
export interface LocationResponse {
  response: Location[];
  status: number;
}

/** From api/responses/MarkableForDeletion.java */
export interface MarkableForDeletion {
}

/** From api/responses/notification/MarkAsReadResponse.java */
export interface MarkAsReadResponse {
  status: number;
}

/** From api/responses/media/Media.java */
export interface Media {
  id: number;
  image_url_large?: string;
  image_url_thumbnail?: string;
  is_main: boolean;
}

/** From api/responses/pms/Message.java */
export interface Message {
  conversation_id: string;
  for_user: ConversationUser;
  from_user: ConversationUser;
  id: string;
  is_unread: boolean;
  message: string;
  sent_at: string;
  subject: string;
}

/** From api/responses/ads/MyAdsResponse.java */
export interface MyAdsResponse {
  ads: AdvertSR[];
  message?: string;
}

/** From api/responses/notification/NotificationAdditionalData.java */
export interface NotificationAdditionalData {
  ad_title: string;
  feedback_type: string;
  for_user_handle: string;
}

/** From api/responses/notification/NotificationDeleteResponse.java */
export interface NotificationDeleteResponse {
  failed: string[];
  success: string[];
}

/** From api/responses/notification/NotificationMessage.java */
export interface NotificationMessage {
  message: string;
  timestamp: string;
  username: string;
}

/** From api/responses/notification/NotificationSettingItem.java */
export interface NotificationSettingItem {
  is_enabled: boolean;
  setting: string;
  title?: string;
  type?: string;
}

/** From api/responses/notification/NotificationSettingsSavedResponse.java */
export interface NotificationSettingsSavedResponse {
  response: AdvertsBaseError;
}

/** From api/responses/notification/NotificationsResponse.java */
export interface NotificationsResponse {
  notifications: AdvertsNotification[];
  unread: number;
}

/** From api/responses/search/Pagination.java */
export interface Pagination {
  current_page: number;
  first_on_page: number;
  last_on_page: number;
  results_per_page: number;
  root?: string;
  total_pages: number;
  total_results: number;
}

/** From api/responses/search/refine/ParentCategory.java */
export interface ParentCategory {
  categoryId: number;
  categoryName: string;
}

/** From api/responses/payments/Payment.java */
export interface Payment {
  amount: string;
  date: string;
  description: string;
  name: string;
}

/** From api/responses/payments/PaymentIntentOrderStatusResponse.java */
export interface PaymentIntentOrderStatusResponse {
  is_order_fulfilled?: string;
}

/** From api/responses/payments/PaymentIntentResponse.java */
export interface PaymentIntentResponse {
  payment_intent_client_secret?: string;
  payment_intent_id?: string;
}

/** From api/responses/ads/PetAdvert.java */
export interface PetAdvert {
  pet_type?: string;
}

/** From api/responses/ads/PlaceAdResponse.java */
export interface PlaceAdResponse {
  ad_id: number;
  ad_status?: import("./enums").AdStatus | string;
}

/** From api/responses/ads/PostCommentInnerResponse.java */
export interface PostCommentInnerResponse {
  message?: string;
}

/** From api/responses/ads/PostCommentResponse.java */
export interface PostCommentResponse {
  response?: PostCommentInnerResponse;
  status: number;
}

/** From api/responses/account/PreviewAd.java */
export interface PreviewAd {
  ad_expiry?: string;
  ad_id: number;
  lead_count: number;
  title?: string;
  view_count: number;
}

/** From api/responses/account/PreviewAdsResponse.java */
export interface PreviewAdsResponse {
  ads: PreviewAd[];
}

/** From api/responses/search/PriceFacet.java */
export interface PriceFacet {
  data?: PriceOption[];
  label?: string;
}

/** From api/responses/search/refine/PriceFacetsResponse.java */
export interface PriceFacetsResponse {
  status: number;
  price_facet?: PriceFacet;
  /** same envelope as search.json; deserializer unwraps price_facet */
  response?: SearchResponse;
}

/** From api/responses/search/PriceOption.java */
export interface PriceOption {
  count: number;
  label?: string;
  max?: string;
  min?: string;
}

/** From api/responses/account/PrivateProfile.java */
export interface PrivateProfile {
  ad_counts: AdCounts;
  address_verified: boolean;
  area_id: number;
  area_name?: string;
  avatar_url?: string;
  blacklist_user_count: number;
  comment_count: number;
  consent_options: TermsConsentOptions;
  county_id: number;
  county_name?: string;
  credit_balance: number;
  email_address: string;
  feedback_stats: FeedbackStats;
  followed_user_count: number;
  followers_count: number;
  id: number;
  is_merchant: boolean;
  is_stripe_customer: boolean;
  is_top_seller: boolean;
  phone_number: string;
  pm_count: number;
  registered_at: string;
  saved_search_count: number;
  sms_verified: boolean;
  status: string;
  unread_notification_count: number;
  unread_pm_count: number;
  user_type: import("./enums").UserType | string;
  username: string;
  watchlist_count: number;
  is_active: boolean;
  is_company: boolean;
  is_dealer: boolean;
  is_service: boolean;
  location?: string;
  member_since: string;
  terms_applicable: boolean;
}

/** From api/responses/user/Profile.java */
export interface Profile {
}

/** From api/responses/user/PublicProfile.java */
export interface PublicProfile {
  ad_counts: AdCounts;
  additional_data: PublicProfileAdditionalData;
  address_verified: boolean;
  avatar_url?: string;
  comment_count: number;
  feedback_stats: FeedbackStats;
  id: number;
  is_following: boolean;
  is_top_seller: boolean;
  last_login_at: string;
  location: string;
  registered_at: string;
  sms_verified: boolean;
  status: string;
  user_type: import("./enums").UserType | string;
  username: string;
  is_dealer?: boolean;
  is_email_verified?: boolean;
  is_service?: boolean;
  is_simi?: boolean;
  last_login_pretty?: string;
  marked_for_deletion?: JsonPrimitive;
  member_since?: string;
  is_feed_dealer?: number | boolean;
  is_trader?: number | boolean;
  business_name?: string | null;
  business_address?: string | null;
  vat_number?: string | null;
}

/** From api/responses/user/PublicProfileAdditionalData.java */
export interface PublicProfileAdditionalData {
  contact_email?: string;
  contact_phone?: string;
  description?: string;
  latitude?: number;
  logo?: string;
  longitude?: number;
  opening_hours?: string;
}

/** From api/responses/notification/PushNotificationSettingGroup.java */
export interface PushNotificationSettingGroup {
  group: string;
  items: NotificationSettingItem[];
  title: string;
}

/** From api/responses/search/refine/RefineGroup.java */
export interface RefineGroup {
  group?: string;
  items?: RefineOption[];
  order?: number;
}

/** From api/responses/search/refine/RefineOption.java */
export interface RefineOption {
  label?: string;
  key?: string;
  type?: string;
  default?: string | boolean;
  order?: number;
  select?: SelectOption[];
}

/** From api/responses/search/refine/RefineOptionCheckbox.java */
export interface RefineOptionCheckbox {
  default: boolean;
  key: string;
  label: string;
  order: number;
  type: string;
}

/** From api/responses/search/refine/RefineOptionSelect.java */
export interface RefineOptionSelect {
  default: string;
  key: string;
  label: string;
  order: number;
  select: SelectOption[];
  type: string;
}

/** From api/responses/notification/RegisterPushResponse.java */
export interface RegisterPushResponse {
  status?: number;
}

/** From api/responses/ads/RelistAdOptionsResponse.java */
export interface RelistAdOptionsResponse {
  basic?: RelistOption;
  need_payment: boolean;
  premium?: RelistOption;
  priority?: RelistOption;
  promo?: DiscountBannerModel;
}

/** From api/responses/ads/RelistOption.java */
export interface RelistOption {
  cost: number;
  description?: string;
  label?: string;
  relist_type?: string;
  cost_label?: string;
  value?: string;
  colour?: BumpColour | Record<string, JsonPrimitive>;
}

/** From api/responses/report/ReportConversationResponse.java */
export interface ReportConversationResponse {
  message: string;
  report_id: number;
}

/** From api/responses/report/ReportResponse.java */
export interface ReportResponse {
  response?: InnerResponse;
  status: number;
}

/** From api/responses/ads/Response.java */
export interface Response {
  advert?: Advert;
  data?: Comment[];
  pagination?: Pagination;
  message?: string;
}

/** From api/responses/savedSearches/SavedSearch.java */
export interface SavedSearch {
  alerts_enabled: boolean;
  category?: string;
  filter_values?: string[];
  id: number;
  search_path?: string;
  search_term?: string;
}

/** From api/responses/savedSearches/SavedSearchResponse.java */
export interface SavedSearchResponse {
  saved_searches: SavedSearch[];
}

/** From api/responses/search/Advert.java */
export interface SearchAdvert {
  ad_id: number;
  ad_status?: import("./enums").AdStatus | string;
  ad_subtype?: string;
  ad_type?: string;
  employer_name?: string;
  engine_size_string?: string;
  fuel_type_string?: string;
  has_premium_badge: number | boolean;
  is_dealer?: number | boolean;
  is_merchant?: number | boolean;
  is_simi?: number | boolean;
  is_top_seller?: number | boolean;
  is_watched: number | boolean;
  location?: string;
  nct_expiry_string?: string;
  pet_type?: string;
  priImageUrl?: string;
  price_string?: string;
  renewed?: string;
  title?: string;
  tracking_pixel?: string;
  user_id?: number;
  category_id?: number;
  price?: number;
  ad_condition?: string;
  priority?: number;
  start_date?: string;
  refresh_date?: string;
  comment_date?: string;
  comment_count?: number;
  num_views?: number;
  region_id?: number;
  county_id?: number;
  area_id?: number;
  user?: string;
  cacheImageUrl?: string;
  href?: string;
  quick_sale?: number;
  sold_label?: string;
}

/** From api/responses/search/SearchResponse.java */
export interface SearchResponse {
  data?: SearchAdvert[];
  cat_facet?: CategoryFacet[];
  pagination?: Pagination;
  parent?: ParentCategory[];
  saved_search?: SavedSearch;
  search_parameters?: JsonPrimitive;
  sentence?: string;
  status?: number;
  /** present on search.json wire; not on SearchResponse.java */
  price_facet?: PriceFacet;
  /** error / empty-result message on some search.json calls */
  message?: string;
}

/** From api/responses/search/refine/SelectOption.java */
export interface SelectOption {
  id: string;
  value: string;
}

/** From api/responses/buyNow/ShippingAddress.java */
export interface ShippingAddress {
  address1?: string;
  address2?: string;
  address3?: string;
  id: number;
  name: string;
  phone_number: string;
  region_id: string;
}

/** From api/responses/buyNow/ShippingRegion.java */
export interface ShippingRegion {
  cost: number;
  id: string;
  name: string;
}

/** From api/responses/ads/SRAdditionalData.java */
export interface SRAdditionalData {
  employer_name?: string;
  engine_size?: string;
  fuel_type?: string;
  nct_expiry?: string;
  pet_ad_type?: string;
  tracking_pixel?: string;
}

/** From api/responses/search/refine/SubCategoryResponse.java */
export interface SubCategoryResponse {
  category_facets?: CategoryFacet[];
  status: number;
  /** live wire nests cat_facet under response (not category_facets) */
  response?: SearchResponse;
}

/** From api/responses/feedback/SubmitFeedback.java */
export interface SubmitFeedback {
  response?: SubmitFeedbackInnerResponse;
  status: number;
}

/** From api/responses/feedback/SubmitFeedbackInnerResponse.java */
export interface SubmitFeedbackInnerResponse {
  data?: SubmitFeedbackResponseData;
  message?: string;
}

/** From api/responses/feedback/SubmitFeedbackResponseData.java */
export interface SubmitFeedbackResponseData {
  ad_owner: number;
  ad_status?: import("./enums").AdStatus | string;
  subtype?: import("./enums").AdSubType | string;
  pet_type?: string;
}

/** From api/responses/account/SuggestedUsernameResponse.java */
export interface SuggestedUsernameResponse {
  username?: string;
}

/** From terms/TermsConsentOptions.java */
export interface TermsConsentOptions {
  accepted_terms_of_use: boolean;
  marketing_permission: TermsContactOptions;
}

/** From terms/TermsContactOptions.java */
export interface TermsContactOptions {
  email: boolean;
  none: boolean;
  notification: boolean;
}

/** From api/responses/discover/Theme.java */
export interface Theme {
  image_urls: Record<string, string>;
  search_path: string;
  section_id: number;
  tag_line: string;
  theme_id: number;
}

/** From api/responses/ads/TicketAdvert.java */
export interface TicketAdvert {
  event_date?: string;
  event_time?: string;
  face_value?: string;
  num_tickets?: string;
  seat?: string;
  travel_date?: string;
  venue?: string;
}

/** From api/responses/payments/Transaction.java */
export interface Transaction {
  transaction_id?: string;
}

/** From api/responses/UnregisterDeviceTokenResponse.java */
export interface UnregisterDeviceTokenResponse {
  message?: string;
}

/** From api/responses/ads/UpfrontPaymentOptions.java */
export interface UpfrontPaymentOptions {
  upfront_payment_methods?: string[];
}

/** From api/responses/ads/UserComments.java */
export interface UserComments {
  status: number;
  response?: UserCommentsResponse;
}

/** From api/responses/ads/UserCommentsResponse.java */
export interface UserCommentsResponse {
  data?: Comment[];
  pagination?: Pagination;
  message?: string;
}

/** From api/responses/user/UserInteractions.java */
export interface UserInteractions {
  feedback?: Interaction;
  pm?: Interaction;
}

/** From api/responses/VehicleDetails.java */
export interface VehicleDetails {
  body_type: number;
  car_year?: string;
  colour?: string;
  doors?: string;
  engine_size: number;
  fuel_type: number;
  make?: string;
  model?: string;
  nct_expiry?: string;
  tax_expiry?: string;
  transmission_type?: string;
}

/** From api/responses/account/VerifyChangeNumberResponse.java */
export interface VerifyChangeNumberResponse {
  phone_number?: string;
}

/** From api/responses/conversations/WithdrawOfferResponse.java */
export interface WithdrawOfferResponse {
  id: number;
  dateMade: string;
}

/** Alias: AppConfigResponse JSON matches AppConfig (live verified). */
export type AppConfigResponse = import("../types").AppConfig;

/** Discover API returns DiscoverSection[] (live verified). */
export type DiscoverSectionsResponse = import("../types").DiscoverSection[];

/** Wire alias used by getDiscoverSections */
export type DiscoverResponse = import("../types").DiscoverSection;
