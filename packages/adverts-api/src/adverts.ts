/**
 * Adverts.ie API Client
 * Primary host: https://new.api.adverts.ie/ (fresh / Retrofit "new" + "moshi_new")
 * Legacy host:  https://api.adverts.ie/      (OldApi *.json — still used by app for browse search)
 *
 * Auth (NEW): Authorization Basic base64("adverts:" + accessToken) + X-Adverts-Api-Key
 * Auth (OLD): Authorization Basic base64("adverts_access_token:" + accessToken) + api_key query
 *
 * Generated methods: bun research/regenerate.mjs (Android v1.91.3 inventory).
 * Paths use template literals + enc(); see research/INVENTORY.md.
 * @module @adverts-ie/api
 */

import type {
  Account,
  AdAction,
  AdLeadType,
  AdPlacementFormOption,
  AdResponse,
  AdStatus,
  AdTypeUpsellOptions,
  AdvertsApiOptions,
  AdvertsTokensSnapshot,
  AllowSwapCommentResponse,
  AppConfig,
  AppStatusResponse,
  BasicAdvert,
  BasicUser,
  BatchDeleteConversationResponse,
  BatchDeleteResponse,
  BumpAdBody,
  BumpAdOptionsResponse,
  BuyCreditsBody,
  BuyNowOptions,
  BuyNowParams,
  Category,
  CategoryResponse,
  CategorySearchResponse,
  ChangeAdStatusResponse,
  Conversation,
  CreditCard,
  CreditOptions,
  DiscoverAd,
  DiscoverSection,
  EditProfileParams,
  Feedback,
  FeedbackApiValue,
  FeedbackResponse,
  FeedbackType,
  FollowedUsersResponse,
  LeadResponse,
  LocationAction,
  LocationResponse,
  MarkAsReadResponse,
  Media,
  Message,
  MyAdsResponse,
  NotificationDeleteResponse,
  NotificationSettingsBody,
  NotificationSettingsSavedResponse,
  NotificationsResponse,
  OfferCommentParams,
  OldSearchParams,
  OldSearchResponse,
  PayForAdBody,
  Payment,
  PaymentIntentBody,
  PaymentIntentOrderStatusResponse,
  PaymentIntentResponse,
  PlaceAdBody,
  PlaceAdResponse,
  PlaceAdType,
  Platform,
  PostCommentResponse,
  PreviewAdsResponse,
  PriceFacetsResponse,
  PrivateProfile,
  PublicProfile,
  PushNotificationSettingGroup,
  RefineGroup,
  RegisterPushResponse,
  RelistAdBody,
  RelistAdOptionsResponse,
  ReportAdReason,
  ReportConversationResponse,
  ReportResponse,
  SavedSearch,
  SavedSearchResponse,
  SearchResponse,
  ShippingAddress,
  SubCategoryResponse,
  SubmitFeedback,
  TermsConsentOptions,
  Transaction,
  UnregisterDeviceTokenResponse,
  UpfrontPaymentOptions,
  UserComments,
  UserInteractions,
  VehicleDetails,
  VerifyChangeNumberResponse,
  WatchAdAction,
  WithdrawOfferResponse,
} from "./types";

export type QueryValue =
  | string
  | number
  | boolean
  | Array<string | number>
  | undefined
  | null;

/** JSON values accepted on @Body endpoints / error bodies. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly method: string,
    public readonly body: JsonValue | string | null,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fresh API key from env (`ADVERTS_NEW_API_KEY`).
 * Prefer passing `newApiKey` on {@link AdvertsApiOptions} in tests.
 */
export const NEW_API_KEY = process.env.ADVERTS_NEW_API_KEY ?? "";

/**
 * Legacy API key from env (`ADVERTS_OLD_API_KEY`).
 * Prefer passing `oldApiKey` on {@link AdvertsApiOptions} in tests.
 */
export const OLD_API_KEY = process.env.ADVERTS_OLD_API_KEY ?? "";

const DEFAULT_NEW_BASE = "https://new.api.adverts.ie/";
const DEFAULT_OLD_BASE = "https://api.adverts.ie/";
const DEFAULT_TOUCH_BASE = "https://touch.adverts.ie/";

function resolveApiKey(
  override: string | undefined,
  envName: "ADVERTS_NEW_API_KEY" | "ADVERTS_OLD_API_KEY"
): string {
  const value = override ?? process.env[envName] ?? "";
  if (!value) {
    throw new Error(
      `${envName} is not set (pass AdvertsApiOptions.${
        envName === "ADVERTS_NEW_API_KEY" ? "newApiKey" : "oldApiKey"
      } or set the env var)`
    );
  }
  return value;
}

type FormFields = {
  readonly [key: string]: string | number | boolean | undefined;
};

type RequestOpts = {
  method?: string;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  form?:
    | FormFields
    | EditProfileParams
    | BuyNowParams
    | OfferCommentParams;
  json?: JsonValue | object;
  body?: BodyInit | null;
};

/**
 * Multipart photo body (Android: okhttp3.RequestBody from File,
 * MediaType application/octet-stream, Part name photo / filename image.jpg).
 */
export type ImageUpload = Blob | ArrayBuffer | Uint8Array | Buffer;

function toUploadBlob(
  photo: ImageUpload,
  contentType = "application/octet-stream"
): Blob {
  if (photo instanceof Blob) {
    return photo.type ? photo : new Blob([photo], { type: contentType });
  }
  const view =
    photo instanceof ArrayBuffer
      ? new Uint8Array(photo)
      : new Uint8Array(photo.buffer, photo.byteOffset, photo.byteLength);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return new Blob([copy], { type: contentType });
}

/** Encode a single path segment. */
function enc(v: string | number | boolean): string {
  return encodeURIComponent(`${v}`);
}

function formScalarToString(v: string | number | boolean): string {
  return `${v}`;
}

function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return "";
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) sp.append(key, formScalarToString(item));
    } else {
      sp.append(key, formScalarToString(value));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function errorMessageFromBody(parsed: JsonValue | string | null, status: number): string {
  if (typeof parsed === "object" && parsed && !Array.isArray(parsed)) {
    const msg = parsed.message;
    if (typeof msg === "string" || typeof msg === "number" || typeof msg === "boolean") {
      return `${msg}`;
    }
  }
  return `HTTP ${status}`;
}

function isJsonValue(v: unknown): v is JsonValue {
  if (v === null) return true;
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (Array.isArray(v)) return v.every(isJsonValue);
  if (t === "object" && v) {
    return Object.values(v).every((x) => isJsonValue(x));
  }
  return false;
}

function parseResponseBody(text: string): JsonValue | string | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    return isJsonValue(raw) ? raw : text;
  } catch {
    return text;
  }
}

export class AdvertsApi {
  private newBaseUrl: string;
  private oldBaseUrl: string;
  private touchBaseUrl: string;
  private newApiKey: string;
  private oldApiKey: string;
  private userAgent: string;
  private appVersionCode: string;
  private appTitle: string;
  private timeout: number;
  private fetchFn: typeof fetch;
  private accessToken?: string;
  private onTokensChange?: (tokens: AdvertsTokensSnapshot | null) => void;

  constructor(options: AdvertsApiOptions = {}) {
    this.newBaseUrl = options.newBaseUrl ?? DEFAULT_NEW_BASE;
    this.oldBaseUrl = options.oldBaseUrl ?? DEFAULT_OLD_BASE;
    this.touchBaseUrl = options.touchBaseUrl ?? DEFAULT_TOUCH_BASE;
    this.newApiKey = resolveApiKey(options.newApiKey, "ADVERTS_NEW_API_KEY");
    this.oldApiKey = resolveApiKey(options.oldApiKey, "ADVERTS_OLD_API_KEY");
    this.appVersionCode = options.appVersionCode ?? "1001176";
    this.appTitle = options.appTitle ?? "Adverts";
    const ver = options.appVersionName ?? "1.91.3";
    this.userAgent =
      options.userAgent ??
      `Adverts/${ver} (samsung SM-J730FM; android 9; Scale/2.0)`;
    this.timeout = options.timeout ?? 30_000;
    this.fetchFn = options.fetchFn ?? fetch;
    this.accessToken = options.accessToken;
    this.onTokensChange = options.onTokensChange;
  }

  getToken(): string | undefined {
    return this.accessToken;
  }

  setToken(token: string | undefined): void {
    this.accessToken = token;
    this.onTokensChange?.({ accessToken: token });
  }

  /** Clear access token and notify listeners (MCP logout / dead session). */
  clearTokens(): void {
    this.accessToken = undefined;
    this.onTokensChange?.(null);
  }

  private newAuthHeader(): string | undefined {
    if (!this.accessToken) return undefined;
    const raw = `adverts:${this.accessToken}`;
    return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
  }

  private oldAuthHeader(): string | undefined {
    if (!this.accessToken) return undefined;
    const raw = `adverts_access_token:${this.accessToken}`;
    return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
  }

  private newHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      "x-app-version": this.appVersionCode,
      "x-app-title": this.appTitle,
      "X-App-Platform": "android",
      "X-Adverts-Api-Key": this.newApiKey,
      Accept: "application/json; version=9",
      "User-Agent": this.userAgent,
      ...extra,
    };
    const auth = this.newAuthHeader();
    if (auth && !headers.Authorization) headers.Authorization = auth;
    return headers;
  }

  private oldHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      "x-app-version": this.appVersionCode,
      "x-app-title": this.appTitle,
      "X-App-Platform": "android",
      Accept: "application/json; version=9",
      "User-Agent": this.userAgent,
      ...extra,
    };
    const auth = this.oldAuthHeader();
    if (auth && !headers.Authorization) headers.Authorization = auth;
    return headers;
  }

  /** Fresh API — https://new.api.adverts.ie/ */
  async requestNew<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
    return this.request<T>(this.newBaseUrl, path, opts, "new");
  }

  /** Legacy API — https://api.adverts.ie/ */
  async requestOld<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
    return this.request<T>(this.oldBaseUrl, path, opts, "old");
  }

  async requestUrl<T = unknown>(url: string, opts: RequestOpts = {}): Promise<T> {
    return this.doFetch<T>(url + buildQuery(opts.query), opts, this.newHeaders(opts.headers));
  }

  private async request<T = unknown>(
    base: string,
    path: string,
    opts: RequestOpts,
    kind: "new" | "old"
  ): Promise<T> {
    const query = { ...(opts.query ?? {}) };
    if (kind === "old") {
      query.api_key = this.oldApiKey;
      if (this.accessToken) query.auth = "1";
    }
    const url =
      new URL(path.replace(/^\//, ""), base).toString() + buildQuery(query);
    const headers =
      kind === "new"
        ? this.newHeaders(opts.headers)
        : this.oldHeaders(opts.headers);
    return this.doFetch<T>(url, opts, headers);
  }

  private async doFetch<T = unknown>(
    url: string,
    opts: RequestOpts,
    headers: Record<string, string>
  ): Promise<T> {
    const method = (opts.method ?? "GET").toUpperCase();
    let body: BodyInit | undefined | null = opts.body;
    if (opts.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.form)) {
        if (v === undefined) continue;
        sp.append(k, formScalarToString(v));
      }
      body = sp.toString();
    } else if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.json);
    } else if (body instanceof FormData) {
      // Let fetch set multipart boundary; do not force Content-Type.
      delete headers["Content-Type"];
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await this.fetchFn(url, {
        method,
        headers,
        body: method === "GET" || method === "HEAD" ? undefined : body,
        signal: controller.signal,
      });
      const text = await res.text();
      const parsed = parseResponseBody(text);
      if (!res.ok) {
        throw new ApiError(
          res.status,
          url,
          method,
          parsed,
          errorMessageFromBody(parsed, res.status)
        );
      }
      return parsed as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Email/password login on the fresh API.
   * May require X-Recaptcha-Token (Android login sends one).
   * On success stores access_token from the Account response.
   */
  async login(
    username: string,
    password: string,
    recaptchaToken?: string
  ): Promise<Account> {
    const account = (await this.authenticateAccount(
      username,
      password,
      recaptchaToken
    ));
    const token = account.access_token ?? account.accessToken;
    if (token) this.setToken(token);
    return account;
  }

  // --- BEGIN GENERATED METHODS ---

  /** POST new.api.adverts.ie/account/address (AccountApi) */
  async addDeliveryAddress(name: string, phoneNumber: string, address1: string, address2: string, address3: string, regionId: string): Promise<ShippingAddress> {
    const path = "account/address";
    return this.requestNew<ShippingAddress>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        name,
        phone_number: phoneNumber,
        address1,
        address2,
        address3,
        region_id: regionId,
      },
    });
  }

  /** POST new.api.adverts.ie/conversation/:id/messages (ConversationApi) */
  async addMessage(conversationId: string, message: string): Promise<Message> {
    const path = `conversation/${enc(conversationId)}/messages`;
    return this.requestNew<Message>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        message,
      },
    });
  }

  /** POST new.api.adverts.ie/account/secure-authenticate (AccountApi) */
  async authenticateAccount(username: string, password: string, recaptchaToken?: string): Promise<Account> {
    const path = "account/secure-authenticate";
    return this.requestNew<Account>(path, {
      method: "POST",
      query: {},
      headers: {
        ...(recaptchaToken !== undefined && recaptchaToken !== "" ? { "X-Recaptcha-Token": recaptchaToken } : {}),
      },
      form: {
        username,
        password,
      },
    });
  }

  /** POST new.api.adverts.ie/account/facebook/authenticate (AccountApi) */
  async authenticateWithFacebook(accessToken: string): Promise<Account> {
    const path = "account/facebook/authenticate";
    return this.requestNew<Account>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        access_token: accessToken,
      },
    });
  }

  /** POST new.api.adverts.ie/advert/:id/bump (AdvertApi) */
  async bumpAd(adId: number, body: BumpAdBody): Promise<PrivateProfile> {
    const path = `advert/${enc(adId)}/bump`;
    return this.requestNew<PrivateProfile>(path, {
      method: "POST",
      query: {},
      headers: {},
      json: body,
    });
  }

  /** POST new.api.adverts.ie/account/credits (AccountApi) */
  async buyCredits(body: BuyCreditsBody): Promise<PrivateProfile> {
    const path = "account/credits";
    return this.requestNew<PrivateProfile>(path, {
      method: "POST",
      query: {},
      headers: {},
      json: body,
    });
  }

  /** POST new.api.adverts.ie/buy/:ad_id (BuyApi) */
  async buyNow(adId: number, params: BuyNowParams): Promise<BasicAdvert> {
    const path = `buy/${enc(adId)}`;
    return this.requestNew<BasicAdvert>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: params,
    });
  }

  /** GET new.api.adverts.ie/app/version/:id (AppApi) */
  async checkForLatestUpdate(packageName: string): Promise<AppStatusResponse> {
    const path = `app/version/${enc(packageName)}`;
    return this.requestNew<AppStatusResponse>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** POST new.api.adverts.ie/payment/create-payment-intent (AdvertApi) */
  async createStripePaymentIntent(body: PaymentIntentBody): Promise<PaymentIntentResponse> {
    const path = "payment/create-payment-intent";
    return this.requestNew<PaymentIntentResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      json: body,
    });
  }

  /** DELETE new.api.adverts.ie/conversations (ConversationApi) */
  async deleteConversations(ids: string): Promise<BatchDeleteConversationResponse> {
    const path = "conversations";
    return this.requestNew<BatchDeleteConversationResponse>(path, {
      method: "DELETE",
      query: {},
      headers: {},
      form: {
        ids,
      },
    });
  }

  /** DELETE new.api.adverts.ie/feedback/:feedbackId (FeedbackApi) */
  async deleteFeedback(feedbackId: number): Promise<Feedback> {
    const path = `feedback/${enc(feedbackId)}`;
    return this.requestNew<Feedback>(path, {
      method: "DELETE",
      query: {},
      headers: {},
    });
  }

  /** DELETE new.api.adverts.ie/account/followed-users (AccountApi) */
  async deleteFollowedUsers(ids: string): Promise<BatchDeleteResponse> {
    const path = "account/followed-users";
    return this.requestNew<BatchDeleteResponse>(path, {
      method: "DELETE",
      query: {},
      headers: {},
      form: {
        ids,
      },
    });
  }

  /** DELETE new.api.adverts.ie/messages (ConversationApi) */
  async deleteMessages(ids: string): Promise<BatchDeleteConversationResponse> {
    const path = "messages";
    return this.requestNew<BatchDeleteConversationResponse>(path, {
      method: "DELETE",
      query: {},
      headers: {},
      form: {
        ids,
      },
    });
  }

  /** DELETE new.api.adverts.ie/notifications (NotificationApi) */
  async deleteNotifications(ids: string): Promise<NotificationDeleteResponse> {
    const path = "notifications";
    return this.requestNew<NotificationDeleteResponse>(path, {
      method: "DELETE",
      query: {},
      headers: {},
      form: {
        ids,
      },
    });
  }

  /** PATCH new.api.adverts.ie/account (AccountApi) */
  async editProfile(profileParams: EditProfileParams): Promise<Account> {
    const path = "account";
    return this.requestNew<Account>(path, {
      method: "PATCH",
      query: {},
      headers: {},
      form: profileParams,
    });
  }

  /** POST new.api.adverts.ie/user/:userId/follow (UserApi) */
  async followUser(userId: number): Promise<PublicProfile> {
    const path = `user/${enc(userId)}/follow`;
    return this.requestNew<PublicProfile>(path, {
      method: "POST",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/account (AccountApi) */
  async getAccount(): Promise<Account> {
    const path = "account";
    return this.requestNew<Account>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/advert/:id/feedback/:type (AdvertApi) */
  async getAdFeedback(adId: number, feedbackType: FeedbackType): Promise<FeedbackResponse> {
    const path = `advert/${enc(adId)}/feedback/${enc(feedbackType)}`;
    return this.requestNew<FeedbackResponse>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/account/ads/:adType (AccountApi) */
  async getAds(adType: AdStatus, page: number): Promise<MyAdsResponse> {
    const path = `account/ads/${enc(adType)}`;
    return this.requestNew<MyAdsResponse>(path, {
      method: "GET",
      query: {
        page,
      },
      headers: {},
    });
  }

  /** OPTIONS new.api.adverts.ie/advert/types (AdvertApi) */
  async getAdTypeUpsellOptions(categoryId: number, adType: string, askingPrice: number, countyId: number, isSharingToDonedeal: string): Promise<AdTypeUpsellOptions> {
    const path = "advert/types";
    return this.requestNew<AdTypeUpsellOptions>(path, {
      method: "OPTIONS",
      query: {
        category_id: categoryId,
        ad_type: adType,
        asking_price: askingPrice,
        county_id: countyId,
        is_sharing_to_donedeal: isSharingToDonedeal,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/advert/:id (AdvertApi) */
  async getAdvert(adId: number): Promise<BasicAdvert> {
    const path = `advert/${enc(adId)}`;
    return this.requestNew<BasicAdvert>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/app/config (AppApi) */
  async getAppConfig(): Promise<AppConfig> {
    const path = "app/config";
    return this.requestNew<AppConfig>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/blacklist (BlockApi) */
  async getBlockedUsers(pageNumber: number): Promise<PublicProfile[]> {
    const path = "blacklist";
    return this.requestNew<PublicProfile[]>(path, {
      method: "GET",
      query: {
        page: pageNumber,
      },
      headers: {},
    });
  }

  /** OPTIONS new.api.adverts.ie/advert/:id/bump (AdvertApi) */
  async getBumpOptions(adId: number): Promise<BumpAdOptionsResponse> {
    const path = `advert/${enc(adId)}/bump`;
    return this.requestNew<BumpAdOptionsResponse>(path, {
      method: "OPTIONS",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/account/credits (AccountApi) */
  async getBuyCreditOptions(): Promise<CreditOptions> {
    const path = "account/credits";
    return this.requestNew<CreditOptions>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/buy/:id (BuyApi) */
  async getBuyNowOptions(adId: number): Promise<BuyNowOptions> {
    const path = `buy/${enc(adId)}`;
    return this.requestNew<BuyNowOptions>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/account/card (AccountApi) */
  async getCard(): Promise<CreditCard> {
    const path = "account/card";
    return this.requestNew<CreditCard>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/category/:id/children/adentry/:adType (CategoryApi) */
  async getCategoryChildrenAdPlacement(categoryId: number, adType: string): Promise<CategoryResponse> {
    const path = `category/${enc(categoryId)}/children/adentry/${enc(adType)}`;
    return this.requestNew<CategoryResponse>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/message/:id/conversation (ConversationApi) */
  async getConversation(messageId: number): Promise<Conversation> {
    const path = `message/${enc(messageId)}/conversation`;
    return this.requestNew<Conversation>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/conversations (ConversationApi) */
  async getConversations(page: number): Promise<Conversation[]> {
    const path = "conversations";
    return this.requestNew<Conversation[]>(path, {
      method: "GET",
      query: {
        page,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/discover (DiscoverApi) */
  async getDiscoverSections(latitude: string, longitude: string): Promise<DiscoverSection[]> {
    const path = "discover";
    return this.requestNew<DiscoverSection[]>(path, {
      method: "GET",
      query: {
        lat: latitude,
        lng: longitude,
      },
      headers: {},
    });
  }

  /** OPTIONS new.api.adverts.ie/advert/:id (AdvertApi) */
  async getEditAdOptions(adId: number): Promise<AdPlacementFormOption[]> {
    const path = `advert/${enc(adId)}`;
    return this.requestNew<AdPlacementFormOption[]>(path, {
      method: "OPTIONS",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/user/:userId/feedback/:feedbackType (UserApi) */
  async getFeedback(userId: number, feedbackType: FeedbackType, page: number): Promise<FeedbackResponse> {
    const path = `user/${enc(userId)}/feedback/${enc(feedbackType)}`;
    return this.requestNew<FeedbackResponse>(path, {
      method: "GET",
      query: {
        page,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/account/followed-users (AccountApi) */
  async getFollowedUsers(pageNumber: number): Promise<FollowedUsersResponse> {
    const path = "account/followed-users";
    return this.requestNew<FollowedUsersResponse>(path, {
      method: "GET",
      query: {
        page: pageNumber,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/messages/received (ConversationApi) */
  async getMessages(page: number): Promise<Message[]> {
    const path = "messages/received";
    return this.requestNew<Message[]>(path, {
      method: "GET",
      query: {
        page,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/conversation/:id/messages (ConversationApi) */
  async getMessages2(conversationId: string, page: number): Promise<Message[]> {
    const path = `conversation/${enc(conversationId)}/messages`;
    return this.requestNew<Message[]>(path, {
      method: "GET",
      query: {
        page,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/notifications (NotificationApi) */
  async getNotifications(page: number): Promise<NotificationsResponse> {
    const path = "notifications";
    return this.requestNew<NotificationsResponse>(path, {
      method: "GET",
      query: {
        page,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/notification/settings (NotificationApi) */
  async getNotificationSettings(): Promise<PushNotificationSettingGroup[]> {
    const path = "notification/settings";
    return this.requestNew<PushNotificationSettingGroup[]>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** OPTIONS new.api.adverts.ie/advert (AdvertApi) */
  async getPlaceAdOptions(categoryId: number, adType: string, askingPrice: number): Promise<AdPlacementFormOption[]> {
    const path = "advert";
    return this.requestNew<AdPlacementFormOption[]>(path, {
      method: "OPTIONS",
      query: {
        category_id: categoryId,
        ad_type: adType,
        asking_price: askingPrice,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/account/preview/ads/:amount (AccountApi) */
  async getPreviewAds(amount: number): Promise<PreviewAdsResponse> {
    const path = `account/preview/ads/${enc(amount)}`;
    return this.requestNew<PreviewAdsResponse>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/user/:userId/ads/:adType/:amount (UserApi) */
  async getPreviewAds2(userId: number, adState: AdStatus, amount: number): Promise<MyAdsResponse> {
    const path = `user/${enc(userId)}/ads/${enc(adState)}/${enc(amount)}`;
    return this.requestNew<MyAdsResponse>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/account/profile (AccountApi) */
  async getPrivateProfile(): Promise<PrivateProfile> {
    const path = "account/profile";
    return this.requestNew<PrivateProfile>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/user/:id/profile (UserApi) */
  async getPublicUserProfile(userId: number): Promise<PublicProfile> {
    const path = `user/${enc(userId)}/profile`;
    return this.requestNew<PublicProfile>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/category/:id/refine (CategoryApi) */
  async getRefineOptions(categoryId: number): Promise<RefineGroup[]> {
    const path = `category/${enc(categoryId)}/refine`;
    return this.requestNew<RefineGroup[]>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** OPTIONS new.api.adverts.ie/advert/:id/relist (AdvertApi) */
  async getRelistAdOptions(adId: number): Promise<RelistAdOptionsResponse> {
    const path = `advert/${enc(adId)}/relist`;
    return this.requestNew<RelistAdOptionsResponse>(path, {
      method: "OPTIONS",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/saved-searches (SavedSearchApi) */
  async getSavedSearches(): Promise<SavedSearchResponse> {
    const path = "saved-searches";
    return this.requestNew<SavedSearchResponse>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/search/ads (SearchApi) */
  async getSearchResultAds(adIds: number[]): Promise<MyAdsResponse> {
    const path = "search/ads";
    return this.requestNew<MyAdsResponse>(path, {
      method: "GET",
      query: {
        "ids[]": adIds,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/advert/:id/similar (AdvertApi) */
  async getSimilarAds(adId: number): Promise<MyAdsResponse> {
    const path = `advert/${enc(adId)}/similar`;
    return this.requestNew<MyAdsResponse>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/category/suggest (CategoryApi) */
  async getSuggestedCategories(searchString: string): Promise<CategorySearchResponse> {
    const path = "category/suggest";
    return this.requestNew<CategorySearchResponse>(path, {
      method: "GET",
      query: {
        query: searchString,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/categories (CategoryApi) */
  async getTopLevelCategories(): Promise<Category[]> {
    const path = "categories";
    return this.requestNew<Category[]>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/payments (PaymentApi) */
  async getTransactionHistory(page: number): Promise<Payment[]> {
    const path = "payments";
    return this.requestNew<Payment[]>(path, {
      method: "GET",
      query: {
        page,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/advert/upfront-payment-methods (AdvertApi) */
  async getUpfrontPaymentOptions(adCost: number, priority: string, categoryId: number): Promise<UpfrontPaymentOptions> {
    const path = "advert/upfront-payment-methods";
    return this.requestNew<UpfrontPaymentOptions>(path, {
      method: "GET",
      query: {
        ad_cost: adCost,
        priority,
        category_id: categoryId,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/user/search (UserApi) */
  async getUser(username: string): Promise<BasicUser> {
    const path = "user/search";
    return this.requestNew<BasicUser>(path, {
      method: "GET",
      query: {
        username,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/user/:id/ads/:status (UserApi) */
  async getUserAds(userId: number, adType: AdStatus | PlaceAdType | string, page: number): Promise<MyAdsResponse> {
    const path = `user/${enc(userId)}/ads/${enc(adType)}`;
    return this.requestNew<MyAdsResponse>(path, {
      method: "GET",
      query: {
        page,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/user/:id/interactions (UserApi) */
  async getUserInteractions(userId: number): Promise<UserInteractions> {
    const path = `user/${enc(userId)}/interactions`;
    return this.requestNew<UserInteractions>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/advert/vehicle (AdvertApi) */
  async getVehicleDetails(vehicleRegistration: string): Promise<VehicleDetails> {
    const path = "advert/vehicle";
    return this.requestNew<VehicleDetails>(path, {
      method: "GET",
      query: {
        vehicle_registration_number: vehicleRegistration,
      },
      headers: {},
    });
  }

  /** POST new.api.adverts.ie/comment/is-swapcomment (CommentApi) */
  async isSwapComment(adId: number, message: string): Promise<AllowSwapCommentResponse> {
    const path = "comment/is-swapcomment";
    return this.requestNew<AllowSwapCommentResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        item_id: adId,
        message,
      },
    });
  }

  /** POST new.api.adverts.ie/account/facebook/link (AccountApi) */
  async linkFacebookAccount(facebookAccessToken: string): Promise<Account> {
    const path = "account/facebook/link";
    return this.requestNew<Account>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        access_token: facebookAccessToken,
      },
    });
  }

  /** POST new.api.adverts.ie/account/facebook/link (AccountApi) */
  async linkFacebookAccount2(facebookAccessToken: string, accessToken?: string): Promise<Account> {
    const path = "account/facebook/link";
    return this.requestNew<Account>(path, {
      method: "POST",
      query: {},
      headers: {
        ...(accessToken !== undefined && accessToken !== "" ? { "Authorization": accessToken } : {}),
      },
      form: {
        access_token: facebookAccessToken,
      },
    });
  }

  /** POST new.api.adverts.ie/conversation/:id (ConversationApi) */
  async markAsRead(conversationId: string, isUnread: number): Promise<Conversation> {
    const path = `conversation/${enc(conversationId)}`;
    return this.requestNew<Conversation>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        is_unread: isUnread,
      },
    });
  }

  /** PATCH new.api.adverts.ie/notification/read (NotificationApi) */
  async markNotificationsAsRead(notificationIds: string[]): Promise<MarkAsReadResponse> {
    const path = "notification/read";
    return this.requestNew<MarkAsReadResponse>(path, {
      method: "PATCH",
      query: {},
      headers: {},
      form: {
        name: notificationIds.join(","),
      },
    });
  }

  /** POST new.api.adverts.ie/advert/:id/pay (AdvertApi) */
  async payForAd(adId: number, body: PayForAdBody): Promise<Transaction> {
    const path = `advert/${enc(adId)}/pay`;
    return this.requestNew<Transaction>(path, {
      method: "POST",
      query: {},
      headers: {},
      json: body,
    });
  }

  /** POST new.api.adverts.ie/account/paymentdata/smsverify (AccountApi) */
  async paymentVerifySms(code: string, autoSmsVerify: boolean): Promise<VerifyChangeNumberResponse> {
    const path = "account/paymentdata/smsverify";
    return this.requestNew<VerifyChangeNumberResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        code,
        auto_sms_verify: autoSmsVerify,
      },
    });
  }

  /** POST new.api.adverts.ie/advert/:id/:action (AdvertApi) */
  async performActionAd(adId: number, action: AdAction): Promise<BasicAdvert> {
    const path = `advert/${enc(adId)}/${enc(action)}`;
    return this.requestNew<BasicAdvert>(path, {
      method: "POST",
      query: {},
      headers: {},
    });
  }

  /** POST new.api.adverts.ie/advert (AdvertApi) */
  async placeAd(body: PlaceAdBody): Promise<PlaceAdResponse> {
    const path = "advert";
    return this.requestNew<PlaceAdResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      json: body,
    });
  }

  /** POST new.api.adverts.ie/advert/:id/relist (AdvertApi) */
  async relistAd(adId: number, body: RelistAdBody): Promise<BasicAdvert> {
    const path = `advert/${enc(adId)}/relist`;
    return this.requestNew<BasicAdvert>(path, {
      method: "POST",
      query: {},
      headers: {},
      json: body,
    });
  }

  /** DELETE new.api.adverts.ie/account/addresses (AccountApi) */
  async removeDeliveryAddresses(addressIds: string): Promise<BatchDeleteResponse> {
    const path = "account/addresses";
    return this.requestNew<BatchDeleteResponse>(path, {
      method: "DELETE",
      query: {},
      headers: {},
      form: {
        ids: addressIds,
      },
    });
  }

  /** DELETE new.api.adverts.ie/saved-search/:id (SavedSearchApi) */
  async removeSavedSearch(savedSearchId: number): Promise<SavedSearch> {
    const path = `saved-search/${enc(savedSearchId)}`;
    return this.requestNew<SavedSearch>(path, {
      method: "DELETE",
      query: {},
      headers: {},
    });
  }

  /** DELETE new.api.adverts.ie/saved-searches (SavedSearchApi) */
  async removeSearchAlerts(ids: string): Promise<BatchDeleteResponse> {
    const path = "saved-searches";
    return this.requestNew<BatchDeleteResponse>(path, {
      method: "DELETE",
      query: {},
      headers: {},
      form: {
        ids,
      },
    });
  }

  /** POST new.api.adverts.ie/report/conversation (ReportApi) */
  async reportConversation(itemId: string, userId: string, reason: string, message: string, block: boolean): Promise<ReportConversationResponse> {
    const path = "report/conversation";
    return this.requestNew<ReportConversationResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        conversation_md5: itemId,
        reported_user_id: userId,
        reason,
        message,
        block,
      },
    });
  }

  /** POST new.api.adverts.ie/account/verification (AccountApi) */
  async resendVerificationEmail(): Promise<Account> {
    const path = "account/verification";
    return this.requestNew<Account>(path, {
      method: "POST",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/payment/order-fulfillment-status/:payment_intent_id (AdvertApi) */
  async retrievePaymentIntentStatus(paymentIntentId: string): Promise<PaymentIntentOrderStatusResponse> {
    const path = `payment/order-fulfillment-status/${enc(paymentIntentId)}`;
    return this.requestNew<PaymentIntentOrderStatusResponse>(path, {
      method: "GET",
      query: {},
      headers: {},
    });
  }

  /** POST new.api.adverts.ie/saved-search (SavedSearchApi) */
  async saveSearch(searchPath: string, alertsEnabled: boolean): Promise<SavedSearch> {
    const path = "saved-search";
    return this.requestNew<SavedSearch>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        search_path: searchPath,
        alerts_enabled: alertsEnabled,
      },
    });
  }

  /** POST new.api.adverts.ie/messages (ConversationApi) */
  async sendMessage(userId: number, subject: string, message: string, adId: number): Promise<Message> {
    const path = "messages";
    return this.requestNew<Message>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        user_id: userId,
        subject,
        message,
        advert_id: adId,
      },
    });
  }

  /** GET new.api.adverts.ie/account/paymentdata/smsverify (AccountApi) */
  async sendPaymentSmsCode(phoneNumber: string, autoSmsVerify: boolean): Promise<Account> {
    const path = "account/paymentdata/smsverify";
    return this.requestNew<Account>(path, {
      method: "GET",
      query: {
        phone_number: phoneNumber,
        auto_sms_verify: autoSmsVerify,
      },
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/account/smsverify (AccountApi) */
  async sendSmsCode(phoneNumber: string, autoSmsVerify: boolean): Promise<Account> {
    const path = "account/smsverify";
    return this.requestNew<Account>(path, {
      method: "GET",
      query: {
        phone_number: phoneNumber,
        auto_sms_verify: autoSmsVerify,
      },
      headers: {},
    });
  }

  /** POST new.api.adverts.ie/account/avatar (AccountApi) */
  async setAvatar(mediaId: number): Promise<Account> {
    const path = "account/avatar";
    return this.requestNew<Account>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        media_id: mediaId,
      },
    });
  }

  /** POST new.api.adverts.ie/account/avatar (AccountApi) */
  async setAvatar2(mediaId: number, auth?: string): Promise<Account> {
    const path = "account/avatar";
    return this.requestNew<Account>(path, {
      method: "POST",
      query: {},
      headers: {
        ...(auth !== undefined && auth !== "" ? { "Authorization": auth } : {}),
      },
      form: {
        media_id: mediaId,
      },
    });
  }

  /** PUT new.api.adverts.ie/notification/settings (NotificationApi) */
  async setNotificationSettings(settings: NotificationSettingsBody): Promise<NotificationSettingsSavedResponse> {
    const path = "notification/settings";
    return this.requestNew<NotificationSettingsSavedResponse>(path, {
      method: "PUT",
      query: {},
      headers: {},
      json: settings,
    });
  }

  /** PATCH new.api.adverts.ie/saved-search/:id (SavedSearchApi) */
  async setSearchAlert(savedSearchId: number, alertsEnabled: boolean): Promise<SavedSearch> {
    const path = `saved-search/${enc(savedSearchId)}`;
    return this.requestNew<SavedSearch>(path, {
      method: "PATCH",
      query: {},
      headers: {},
      form: {
        alerts_enabled: alertsEnabled,
      },
    });
  }

  /** POST new.api.adverts.ie/secure-account (AccountApi) */
  async signupWithEmail(email: string, username: string, password: string, consentOptions: string, recaptchaToken?: string): Promise<Account> {
    const path = "secure-account";
    return this.requestNew<Account>(path, {
      method: "POST",
      query: {},
      headers: {
        ...(recaptchaToken !== undefined && recaptchaToken !== "" ? { "X-Recaptcha-Token": recaptchaToken } : {}),
      },
      form: {
        email,
        username,
        password,
        consent_options: consentOptions,
      },
    });
  }

  /** POST new.api.adverts.ie/account/facebook (AccountApi) */
  async signupWithFacebook(accessToken: string, username: string, consentOptions: string): Promise<Account> {
    const path = "account/facebook";
    return this.requestNew<Account>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        access_token: accessToken,
        username,
        consent_options: consentOptions,
      },
    });
  }

  /** POST new.api.adverts.ie/account/consent (AccountApi) */
  async submitTerms(termsConsentOptions: string): Promise<TermsConsentOptions> {
    const path = "account/consent";
    return this.requestNew<TermsConsentOptions>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        consent_options: termsConsentOptions,
      },
    });
  }

  /** PUT new.api.adverts.ie/advert/:id/lead/:type (AdvertApi) */
  async trackLead(adId: number, type: AdLeadType): Promise<LeadResponse> {
    const path = `advert/${enc(adId)}/lead/${enc(type)}`;
    return this.requestNew<LeadResponse>(path, {
      method: "PUT",
      query: {},
      headers: {},
    });
  }

  /** GET new.api.adverts.ie/(absolute url) (SkupeNetApi) */
  async trackPixel(url: string): Promise<void> {
    await this.requestUrl<void>(url, {
      method: "GET",
      headers: {},
    });
  }

  /** DELETE new.api.adverts.ie/blacklist (BlockApi) */
  async unblockUsers(ids: string): Promise<BatchDeleteResponse> {
    const path = "blacklist";
    return this.requestNew<BatchDeleteResponse>(path, {
      method: "DELETE",
      query: {},
      headers: {},
      form: {
        ids,
      },
    });
  }

  /** DELETE new.api.adverts.ie/user/:userId/unfollow (UserApi) */
  async unfollowUser(userId: number): Promise<PublicProfile> {
    const path = `user/${enc(userId)}/unfollow`;
    return this.requestNew<PublicProfile>(path, {
      method: "DELETE",
      query: {},
      headers: {},
    });
  }

  /** DELETE new.api.adverts.ie/user/device/:deviceId (UserApi) */
  async unregisterDevicePushToken(deviceId: string): Promise<UnregisterDeviceTokenResponse> {
    const path = `user/device/${enc(deviceId)}`;
    return this.requestNew<UnregisterDeviceTokenResponse>(path, {
      method: "DELETE",
      query: {},
      headers: {},
    });
  }

  /** PATCH new.api.adverts.ie/advert/:id (AdvertApi) */
  async updateAd(adId: number, body: PlaceAdBody): Promise<PlaceAdResponse> {
    const path = `advert/${enc(adId)}`;
    return this.requestNew<PlaceAdResponse>(path, {
      method: "PATCH",
      query: {},
      headers: {},
      json: body,
    });
  }

  /** POST new.api.adverts.ie/account/email (AccountApi) */
  async updateEmail(email: string): Promise<Account> {
    const path = "account/email";
    return this.requestNew<Account>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        email,
      },
    });
  }

  /** POST new.api.adverts.ie/media (MediaApi) */
  async uploadImage(photo: ImageUpload, accessToken?: string): Promise<Media> {
    const path = "media";
    const formData = new FormData();
    formData.append("photo", toUploadBlob(photo), "image.jpg");
    return this.requestNew<Media>(path, {
      method: "POST",
      query: {},
      headers: {
        ...(accessToken !== undefined && accessToken !== "" ? { "Authorization": accessToken } : {}),
      },
      body: formData,
    });
  }

  /** POST new.api.adverts.ie/account/smsverify (AccountApi) */
  async verifySms(code: string, autoSmsVerify: boolean): Promise<Account> {
    const path = "account/smsverify";
    return this.requestNew<Account>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        code,
        auto_sms_verify: autoSmsVerify,
      },
    });
  }

  /** PUT new.api.adverts.ie/paypal/void-authorization/:authId (PayPalApi) */
  async voidAuthorization(authId: string): Promise<void> {
    const path = `paypal/void-authorization/${enc(authId)}`;
    await this.requestNew<void>(path, {
      method: "PUT",
      query: {},
      headers: {},
    });
  }

  /** POST new.api.adverts.ie/comment/withdraw-offer/:id (CommentApi) */
  async withdrawOffer(commentId: number): Promise<WithdrawOfferResponse> {
    const path = `comment/withdraw-offer/${enc(commentId)}`;
    return this.requestNew<WithdrawOfferResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
    });
  }

  /** POST api.adverts.ie/carquery.json (OldApi) */
  async carQuery(commentParams: OfferCommentParams): Promise<PostCommentResponse> {
    const path = "carquery.json";
    return this.requestOld<PostCommentResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: commentParams,
    });
  }

  /** GET api.adverts.ie/advert.json (OldApi) */
  async getAdComments(adId: number, showComments: number, showDetails: number, numberOfCommentsToShow: number, page: number, includePets: number): Promise<AdResponse> {
    const path = "advert.json";
    return this.requestOld<AdResponse>(path, {
      method: "GET",
      query: {
        id: adId,
        comments: showComments,
        details: showDetails,
        rpp: numberOfCommentsToShow,
        pg: page,
        include_pets: includePets,
      },
      headers: {},
    });
  }

  /** GET api.adverts.ie/advert.json (OldApi) */
  async getAdDetails(adId: number, showComments: number, showDetails: number, numberOfCommentsToShow: number, includePets: number, width: number, height: number): Promise<AdResponse> {
    const path = "advert.json";
    return this.requestOld<AdResponse>(path, {
      method: "GET",
      query: {
        id: adId,
        comments: showComments,
        details: showDetails,
        rpp: numberOfCommentsToShow,
        include_pets: includePets,
        w: width,
        h: height,
      },
      headers: {},
    });
  }

  /** GET api.adverts.ie/location.json (OldApi) */
  async getAreas(action: LocationAction, countyId: number): Promise<LocationResponse> {
    const path = "location.json";
    return this.requestOld<LocationResponse>(path, {
      method: "GET",
      query: {
        action,
        countyId,
      },
      headers: {},
    });
  }

  /** GET api.adverts.ie/location.json (OldApi) */
  async getCounties(action: LocationAction): Promise<LocationResponse> {
    const path = "location.json";
    return this.requestOld<LocationResponse>(path, {
      method: "GET",
      query: {
        action,
      },
      headers: {},
    });
  }

  /** GET api.adverts.ie/search.json (OldApi) */
  async getPriceFacets(searchFilters: OldSearchParams): Promise<PriceFacetsResponse> {
    const path = "search.json";
    return this.requestOld<PriceFacetsResponse>(path, {
      method: "GET",
      query: {
        ...searchFilters,
      },
      headers: {},
    });
  }

  /** GET api.adverts.ie/search.json (OldApi) */
  async getSubCategories(searchFilters: OldSearchParams): Promise<SubCategoryResponse> {
    const path = "search.json";
    return this.requestOld<SubCategoryResponse>(path, {
      method: "GET",
      query: {
        ...searchFilters,
      },
      headers: {},
    });
  }

  /** GET api.adverts.ie/member.json (OldApi) */
  async getUserComments(userId: number, comments: number, page: number): Promise<UserComments> {
    const path = "member.json";
    return this.requestOld<UserComments>(path, {
      method: "GET",
      query: {
        id: userId,
        comments,
        pg: page,
      },
      headers: {},
    });
  }

  /** GET api.adverts.ie/myadverts.json (OldApi) */
  async getWatchlist(watchlist: string, page: number, width: number, height: number): Promise<SearchResponse> {
    const path = "myadverts.json";
    return this.requestOld<SearchResponse>(path, {
      method: "GET",
      query: {
        fetch: watchlist,
        pg: page,
        w: width,
        h: height,
      },
      headers: {},
    });
  }

  /** POST api.adverts.ie/comment.json (OldApi) */
  async handleOffer(commentParams: OfferCommentParams, response: string, action: string): Promise<PostCommentResponse> {
    const path = "comment.json";
    return this.requestOld<PostCommentResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        response,
        action,
        ...commentParams,
      },
    });
  }

  /** POST api.adverts.ie/feedback.json (OldApi) */
  async leaveFeedback(userId: number, adId: number, feedbackValue: FeedbackApiValue, message: string): Promise<SubmitFeedback> {
    const path = "feedback.json";
    return this.requestOld<SubmitFeedback>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        userId,
        adId,
        feedback_value: feedbackValue,
        feedback_message: message,
      },
    });
  }

  /** POST api.adverts.ie/comment.json (OldApi) */
  async makeOffer(commentParams: OfferCommentParams): Promise<PostCommentResponse> {
    const path = "comment.json";
    return this.requestOld<PostCommentResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: commentParams,
    });
  }

  /** GET api.adverts.ie/registerpush.json (OldApi) */
  async registerDevice(userId: number, registrationId: string, platform: Platform): Promise<RegisterPushResponse> {
    const path = "registerpush.json";
    return this.requestOld<RegisterPushResponse>(path, {
      method: "GET",
      query: {
        user_id: userId,
        uuid: registrationId,
        platform,
      },
      headers: {},
    });
  }

  /** POST api.adverts.ie/reportadvert.json (OldApi) */
  async reportAd(itemId: string, reason: ReportAdReason | string, message: string): Promise<ReportResponse> {
    const path = "reportadvert.json";
    return this.requestOld<ReportResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        item_id: itemId,
        reason,
        message,
      },
    });
  }

  /** POST api.adverts.ie/reportcomment.json (OldApi) */
  async reportComment(itemId: string, reason: string, message: string): Promise<ReportResponse> {
    const path = "reportcomment.json";
    return this.requestOld<ReportResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        item_id: itemId,
        reason,
        message,
      },
    });
  }

  /** POST api.adverts.ie/reportcomment.json (OldApi) */
  async reportComment2(itemId: string, reason: string, message: string, block: string): Promise<ReportResponse> {
    const path = "reportcomment.json";
    return this.requestOld<ReportResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        item_id: itemId,
        reason,
        message,
        blacklist: block,
      },
    });
  }

  /** POST api.adverts.ie/reportfeedback.json (OldApi) */
  async reportFeedback(itemId: string, reason: string, message: string): Promise<ReportResponse> {
    const path = "reportfeedback.json";
    return this.requestOld<ReportResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        item_id: itemId,
        reason,
        message,
      },
    });
  }

  /** POST api.adverts.ie/reportpm.json (OldApi) */
  async reportPm(itemId: string, reason: string, message: string): Promise<ReportResponse> {
    const path = "reportpm.json";
    return this.requestOld<ReportResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        item_id: itemId,
        reason,
        message,
      },
    });
  }

  /** POST api.adverts.ie/reportuser.json (OldApi) */
  async reportUser(itemId: string, reason: string, message: string): Promise<ReportResponse> {
    const path = "reportuser.json";
    return this.requestOld<ReportResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        item_id: itemId,
        reason,
        message,
      },
    });
  }

  /** POST api.adverts.ie/reportuser.json (OldApi) */
  async reportUser2(itemId: string, reason: string, message: string, block: string): Promise<ReportResponse> {
    const path = "reportuser.json";
    return this.requestOld<ReportResponse>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        item_id: itemId,
        reason,
        message,
        blacklist: block,
      },
    });
  }

  /** POST api.adverts.ie/feedback.json (OldApi) */
  async respondToFeedback(feedbackId: number, response: string): Promise<SubmitFeedback> {
    const path = "feedback.json";
    return this.requestOld<SubmitFeedback>(path, {
      method: "POST",
      query: {},
      headers: {},
      form: {
        fbId: feedbackId,
        feedback_response: response,
      },
    });
  }

  /** GET api.adverts.ie/search.json (OldApi) */
  async search(filters: OldSearchParams): Promise<OldSearchResponse> {
    const path = "search.json";
    return this.requestOld<OldSearchResponse>(path, {
      method: "GET",
      query: {
        ...filters,
      },
      headers: {},
    });
  }

  /** GET api.adverts.ie/search.json (OldApi) */
  async searchWithMultipleAreas(filters: OldSearchParams, areas: number[]): Promise<OldSearchResponse> {
    const path = "search.json";
    return this.requestOld<OldSearchResponse>(path, {
      method: "GET",
      query: {
        "areaID[]": areas,
        ...filters,
      },
      headers: {},
    });
  }

  /** GET api.adverts.ie/search.json (OldApi) */
  async searchWithMultipleCounties(filters: OldSearchParams, counties: string[]): Promise<OldSearchResponse> {
    const path = "search.json";
    return this.requestOld<OldSearchResponse>(path, {
      method: "GET",
      query: {
        "countyID[]": counties,
        ...filters,
      },
      headers: {},
    });
  }

  /** POST api.adverts.ie/advert.json (OldApi) */
  async watchAd(includePets: number, adId: number, action: WatchAdAction): Promise<ChangeAdStatusResponse> {
    const path = "advert.json";
    return this.requestOld<ChangeAdStatusResponse>(path, {
      method: "POST",
      query: {
        include_pets: includePets,
      },
      headers: {},
      form: {
        id: adId,
        action,
      },
    });
  }

  // --- END GENERATED METHODS ---
}
