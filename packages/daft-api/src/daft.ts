/**
 * Daft.ie API Client
 * Unofficial TypeScript API client for Daft.ie
 * All endpoints verified against the real production API.
 * @module @daft-ie/api
 */

import {
  DEFAULT_RECAPTCHA_ACTION,
  fetchRecaptchaToken,
  recaptchaTcpConfigured,
} from "./recaptcha-tcp";
import type {
  AdConvertResponse,
  AdOffers,
  AdRelistBody,
  AdRelistResponse,
  AdReplyMessageBody,
  AdStateBody,
  AnalyticsEventBody,
  Area,
  AreaMapping,
  ClassifiedAreasResponse,
  Consent,
  CreateBidderBody,
  CreatePropertyDto,
  DaftApiOptions,
  DaftTokensSnapshot,
  Facility,
  FilterResponse,
  GeoFilter,
  InboxEnquiriesResponse,
  Location,
  LogoutResponse,
  MakeOfferBody,
  MarkReadRequest,
  MortgageComparisonBody,
  MortgageComparisonResult,
  MyAdsResponse,
  NamedFilter,
  Paging,
  PropertyDetailsResponse,
  PropertyDto,
  PushTokenBody,
  Range,
  ReportAdRequest,
  ReportReason,
  SavedAdsResponse,
  SavedReply,
  SavedSearchCreateResponse,
  SavedSearchParamsBody,
  SavedSearchResponse,
  SaveAdBody,
  SearchOptions,
  SearchPayload,
  SearchResponse,
  Section,
  Sort,
  TokenResponse,
  UpdateSearchParamsBody,
  UserInfo,
} from "./types";

/** Base URL factory for the four API hosts used by the app. */
type BaseKey = "old" | "common" | "auth" | "mapper";

/** Error thrown for non-2xx responses. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly method: string,
    public readonly body: unknown,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Keycloak client id from env (`DAFT_CLIENT_ID`).
 * Prefer passing `clientId` on {@link DaftApiOptions} in tests.
 */
export const CLIENT_ID = process.env.DAFT_CLIENT_ID ?? "";

function resolveClientId(override?: string): string {
  const value = override ?? process.env.DAFT_CLIENT_ID ?? "";
  if (!value) {
    throw new Error(
      "DAFT_CLIENT_ID is not set (pass DaftApiOptions.clientId or set the env var)"
    );
  }
  return value;
}

/**
 * Daft.ie API Client
 * @example
 * ```typescript
 * import { DaftApi } from "@daft-ie/api";
 *
 * const daft = new DaftApi();
 * const results = await daft.searchForRent({
 *   county: "dublin",
 *   maxPrice: 600,
 * });
 * ```
 */
export class DaftApi {
  private baseUrl: string;
  private authUrl: string;
  private mapperUrl: string;
  private userAgent: string;
  private headers: Record<string, string>;
  private timeout: number;
  private fetchFn: (
    input: string | URL | Request,
    init?: RequestInit
  ) => Promise<Response>;
  private appVersion: string;
  private token?: string;
  private refreshTokenValue?: string;
  private autoRefresh: boolean;
  private refreshPromise: Promise<void> | null = null;
  private clientId: string;
  private onTokensChange?: (tokens: DaftTokensSnapshot | null) => void;
  private mintRecaptchaToken?: () => Promise<{ token: string; action: string }>;
  private recaptchaTcpHost?: string;
  private recaptchaTcpPort?: number;
  private areaCache: Map<string, Area> | null = null;

  /** Endpoint paths extracted from the decompiled Android app. */
  private static readonly ENDPOINTS = {
    // Search API (old base: {baseUrl}/old)
    SEARCH: "/v1/listings",
    AUTOCOMPLETE_AREAS: "/v1/filters/autocomplete/areas",
    FILTERS: "/v3/filters/search/{section}",
    SUB_AREAS: "/v1/area/{id}/within",
    CLASSIFIED_AREAS: "/v1/location/classifiedAreas",
    AUTOCOMPLETE: "/v1/autocomplete",
    AUTOCOMPLETE_COLLEGES: "/v1/autocomplete/colleges",
    // Ad details API (common base)
    AD_DETAILS: "/api/v3/ads/listing/{id}",
    AD_DETAILS_LEGACY: "/old/v1/legacy/listing/{siteAdId}",
    REPORT_REASONS: "/old/v1/report/reasons",
    POST_REPORT_AD: "/old/v1/report",
    POST_AD_MESSAGE: "/old/v4/reply",
    POST_TRACK_EVENT: "/old/v1/tracking",
    // Location API (common base)
    LOCATIONS_AUTOCOMPLETE: "/api/v1/locations/autocomplete",
    AREA_MAPPING: "/api/v1/locations/areas/{areaId}/mapping/allianz",
    // Place ad / convert (old base)
    CONVERT_AD_ID: "/api/v1/ads/sites/daft/convert/{legacyAdId}",
    // Auth (Keycloak)
    TOKEN: "/auth/realms/daft/protocol/openid-connect/token",
    LOGOUT: "/auth/realms/daft/protocol/openid-connect/logout",
    // Account API (common base)
    SAVED_ADS_FETCH: "/api/v2/saved-ads/{userId}",
    SAVED_ADS_CREATE: "/api/v1/saved-ads",
    SAVED_ADS_DELETE: "/api/v1/saved-ads/{userId}/{id}",
    SAVED_SEARCHES_FETCH: "/api/v1/users/{userId}/saved/searches",
    SAVED_SEARCHES_CREATE: "/api/v1/saved-searches",
    SAVED_SEARCHES_DELETE: "/api/v1/users/{userId}/saved/searches/{id}",
    SAVED_SEARCHES_UPDATE: "/api/v1/users/{userId}/saved/searches/{id}/alerts",
    // User API
    USER_INFO: "/api/v1/users/{userId}",
    USER_CONSENTS: "/api/v1/users/{userId}/consents",
    FORMS_ENQUIRY: "/api/v1/forms/enquiry/{listingId}",
    // My Property API
    MY_PROPERTIES: "/api/v1/users/my-properties",
    MY_PROPERTIES_DELETE: "/api/v1/users/my-properties/{propertyId}",
    // My Ads API
    MY_ADS: "/api/v1/users/{userId}/properties?order=desc&sort=_id",
    AD_STATE: "/api/v1/properties/{adId}/state",
    // Inbox API
    ENQUIRIES: "/api/v3/enquiries",
    REPLIES: "/api/v3/replies",
    // Offers API
    OFFERS: "/api/v1/properties/{ad_id}/offers",
    OFFERS_SUBMISSIONS: "/api/v1/properties/{ad_id}/offers/submissions",
    OFFERS_BIDDERS: "/api/v1/properties/{ad_id}/offers/bidders",
    // Daft accounts / push tokens (old base)
    PUSH_TOKENS: "/v1/users/{userId}/tokens/push",
    // Mortgage comparison (old base via common host)
    MORTGAGE_COMPARISON: "/old/v1/daft-mortgages/comparison",
  } as const;

  /** Map a logical host to its URL. */
  private base(key: BaseKey): string {
    switch (key) {
      case "old":
        return `${this.baseUrl}/old`;
      case "auth":
        return this.authUrl;
      case "mapper":
        return this.mapperUrl;
      case "common":
      default:
        return this.baseUrl;
    }
  }

  /** Insert path parameters into an endpoint template. */
  private static path(
    template: string,
    params: Record<string, string | number>
  ): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ""));
  }

  /**
   * Create a new DaftApi instance
   * @param options - Configuration options
   * @example
   * ```typescript
   * // Android-style (mimics real app)
   * const daft = new DaftApi({ platform: "android", appVersion: "9.8.1" });
   *
   * // Authenticated
   * const daft = new DaftApi({ authToken: "eyJ..." });
   * ```
   */
  constructor(options: DaftApiOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://gateway.daft.ie";
    this.authUrl = options.authUrl ?? "https://auth.daft.ie";
    this.mapperUrl =
      options.mapperUrl ?? "https://dsch-ad-mapper-sp-prod.apps.dsch.ninja";
    this.appVersion = options.appVersion ?? "9.8.1";
    this.timeout = options.timeout ?? 10000;
    const proxy = process.env.HTTP_PROXY?.trim();
    this.fetchFn =
      options.fetchFn ??
      (proxy
        ? ((input, init) =>
            fetch(input, { ...init, proxy } as RequestInit))
        : fetch);
    this.token = options.authToken ?? options.token;
    this.refreshTokenValue = options.refreshToken;
    this.autoRefresh = options.autoRefresh ?? true;
    this.clientId = resolveClientId(options.clientId);
    this.onTokensChange = options.onTokensChange;
    this.mintRecaptchaToken = options.mintRecaptchaToken;
    this.recaptchaTcpHost = options.recaptchaTcpHost;
    this.recaptchaTcpPort = options.recaptchaTcpPort;

    const platform = options.platform ?? "web";

    this.userAgent =
      platform === "android"
        ? `daft/${this.appVersion}/AndroidVersion/${options.osVersion ?? "11"}`
        : options.userAgent ??
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

    this.headers = {
      "Content-Type": "application/json",
      accept: "application/json",
      brand: "daft",
      platform,
      version: this.appVersion,
      app_version: this.appVersion,
      "User-Agent": this.userAgent,
      ...options.headers,
    };
  }

  /** Set (or clear) the bearer token used for authenticated requests. */
  setToken(token?: string): void {
    this.token = token;
  }

  /** Current bearer token (if any). */
  getToken(): string | undefined {
    return this.token;
  }

  /** Set (or clear) the long-lived refresh token used for auto-rotation. */
  setRefreshToken(refreshToken?: string): void {
    this.refreshTokenValue = refreshToken;
  }

  /** Current refresh token (if any). */
  getRefreshToken(): string | undefined {
    return this.refreshTokenValue;
  }

  /** Clear access + refresh tokens locally (does not call Keycloak). */
  clearTokens(): void {
    this.token = undefined;
    this.refreshTokenValue = undefined;
    this.emitTokensChange(null);
  }

  /** Notify {@link DaftApiOptions.onTokensChange} of the current session. */
  private emitTokensChange(cleared: null | "current"): void {
    if (!this.onTokensChange) return;
    if (cleared === null) {
      this.onTokensChange(null);
      return;
    }
    this.onTokensChange({
      accessToken: this.token,
      refreshToken: this.refreshTokenValue,
    });
  }

  /** Enable/disable automatic token refresh on 401 (default: enabled). */
  setAutoRefresh(enabled: boolean): void {
    this.autoRefresh = enabled;
  }

  /**
   * Common JSON fetch with timeout, auth header and error handling.
   * On 401: try refresh once; if refresh fails or is unavailable, clear the
   * session and retry once without Authorization (public endpoints keep working
   * when `.env` holds a stale refresh/access token).
   */
  private async fetchJson<T>(
    url: string,
    method: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
    retried = false
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const sentAuth = Boolean(this.token);
      const headers: Record<string, string> = {
        ...this.headers,
        ...(sentAuth ? { Authorization: `Bearer ${this.token}` } : {}),
        ...extraHeaders,
      };
      const response = await this.fetchFn(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        if (response.status === 401 && !retried) {
          if (await this.tryAutoRefresh()) {
            return this.fetchJson<T>(url, method, body, extraHeaders, true);
          }
          // Stale/invalid session: drop tokens and retry anonymously once.
          if (sentAuth) {
            this.clearTokens();
            return this.fetchJson<T>(url, method, body, extraHeaders, true);
          }
        }
        throw new ApiError(
          response.status,
          url,
          method,
          text,
          `HTTP ${response.status}: ${response.statusText}${
            text ? ` — ${text.slice(0, 300)}` : ""
          }`
        );
      }
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Refresh the access token once if possible.
   * Returns true only when a new access token was stored.
   * On failure, clears local tokens so callers can fall back to anonymous.
   */
  private async tryAutoRefresh(): Promise<boolean> {
    if (!this.refreshTokenValue || !this.autoRefresh) return false;
    try {
      await this.rotateToken();
      return Boolean(this.token);
    } catch {
      this.clearTokens();
      return false;
    }
  }

  /** Single-flight access-token refresh. Callers share one in-flight request. */
  private async rotateToken(): Promise<void> {
    if (!this.refreshTokenValue) return;
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }
    this.refreshPromise = this.requestToken({
      grant_type: "refresh_token",
      client_id: this.clientId,
      refresh_token: this.refreshTokenValue,
    })
      .then((token) => {
        this.token = token.access_token;
        if (token.refresh_token) this.refreshTokenValue = token.refresh_token;
        this.emitTokensChange("current");
      })
      .finally(() => {
        this.refreshPromise = null;
      });
    await this.refreshPromise;
  }

  // ============================================================
  // Search
  // ============================================================

  /**
   * Search for properties using a raw payload.
   * @param payload - Search payload
   * @returns Search results
   * @example
   * ```typescript
   * const results = await daft.search({
   *   section: "residential-to-rent",
   *   ranges: [{ name: "numBeds", from: 2, to: 3 }],
   *   paging: { from: "0", pageSize: "20" }
   * });
   * ```
   */
  async search(payload: SearchPayload): Promise<SearchResponse> {
    return this.fetchJson<SearchResponse>(
      `${this.base("old")}${DaftApi.ENDPOINTS.SEARCH}`,
      "POST",
      payload
    );
  }

  /** Search for properties for sale. */
  async searchForSale(options: SearchOptions = {}): Promise<SearchResponse> {
    return this.buildAndSearch("residential-for-sale", options);
  }

  /** Search for rental properties. */
  async searchForRent(options: SearchOptions = {}): Promise<SearchResponse> {
    return this.buildAndSearch("residential-to-rent", options);
  }

  /** Search for shared accommodation / rooms. */
  async searchForSharing(options: SearchOptions = {}): Promise<SearchResponse> {
    return this.buildAndSearch("sharing", options);
  }

  /** Search for commercial properties for sale. */
  async searchCommercialForSale(
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    return this.buildAndSearch("commercial-for-sale", options);
  }

  /** Search for commercial rental properties. */
  async searchCommercialForRent(
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    return this.buildAndSearch("commercial-to-rent", options);
  }

  /** Search for new developments. */
  async searchNewDevelopments(
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    return this.buildAndSearch("new-homes", options);
  }

  /**
   * Build and execute a search with friendly options.
   * `county` / `area` are resolved to stored shape ids automatically.
   * @internal
   */
  private async buildAndSearch(
    section: Section,
    options: SearchOptions
  ): Promise<SearchResponse> {
    const payload: SearchPayload = {
      section,
      paging: {
        from: String(((options.page ?? 1) - 1) * (options.pageSize ?? 20)),
        pageSize: String(options.pageSize ?? 20),
      },
    };

    const filters: NamedFilter[] = [];
    const ranges: Range[] = [];

    if (options.propertyTypes?.length) {
      filters.push({ name: "propertyType", values: options.propertyTypes });
    }

    if (options.roomTypes?.length) {
      filters.push({ name: "roomType", values: options.roomTypes });
    }

    if (options.facilities?.length) {
      payload.andFilters = [
        { name: "facilities", values: options.facilities },
      ];
    }

    if (options.minPrice !== undefined || options.maxPrice !== undefined) {
      const priceName =
        section === "residential-to-rent" || section === "sharing"
          ? "rentalPrice"
          : "salePrice";
      ranges.push({
        name: priceName,
        from: options.minPrice ?? "",
        to: options.maxPrice ?? "",
      });
    }

    if (options.minBeds !== undefined || options.maxBeds !== undefined) {
      ranges.push({
        name: "numBeds",
        from: options.minBeds ?? "",
        to: options.maxBeds ?? "",
      });
    }

    if (filters.length > 0) payload.filters = filters;
    if (ranges.length > 0) payload.ranges = ranges;

    payload.geoFilter =
      options.geoFilter ?? (await this.resolveAreaGeoFilter(options));

    if (options.terms) payload.terms = options.terms;
    if (options.sort) payload.sort = this.normalizeSort(options.sort);

    return this.search(payload);
  }

  /** Normalize legacy sort aliases to the real API values. */
  private normalizeSort(sort: Sort): Sort {
    switch (sort) {
      case "dateAsc":
        return "publishDateAsc";
      case "dateDesc":
      case "priorityDate":
        return "publishDateDesc";
      default:
        return sort;
    }
  }

  /** Build a STORED_SHAPES geoFilter from `county`/`area`/`geoFilter`. */
  private async resolveAreaGeoFilter(
    options: SearchOptions
  ): Promise<GeoFilter | undefined> {
    if (options.geoFilter) return options.geoFilter;
    const location = options.county ?? options.area;
    if (!location) return undefined;
    const ids = await this.resolveAreaIds(location);
    if (!ids) return undefined;
    return { storedShapeIds: ids, name: location, geoSearchType: "STORED_SHAPES" };
  }

  /**
   * Resolve a location name (county/city/area) to its stored shape ids.
   * Uses the cached `classifiedAreas` endpoint.
   */
  async resolveAreaIds(location: string): Promise<string[] | undefined> {
    if (!location) return undefined;
    const key = location.trim().toLowerCase();
    const map = await this.loadAreaMap();
    const area = map.get(key);
    if (!area) return undefined;
    return [area.id];
  }

  /** Lazily load + cache the area lookup map. */
  private async loadAreaMap(): Promise<Map<string, Area>> {
    if (this.areaCache) return this.areaCache;
    const data = await this.getClassifiedAreas();
    const map = new Map<string, Area>();
    for (const list of [
      data.counties,
      data.cities,
      data.areas,
      data.colleges,
    ]) {
      for (const area of list) {
        map.set(area.id, area);
        map.set(area.displayName.toLowerCase(), area);
        map.set(area.displayValue.toLowerCase(), area);
      }
    }
    this.areaCache = map;
    return map;
  }

  /** Clear the cached area lookup map. */
  clearAreaCache(): void {
    this.areaCache = null;
  }

  /**
   * Fetch multiple pages of search results.
   * @param searchFn - Search function (receives 1-based page number)
   * @param maxPages - Maximum number of pages to fetch
   */
  async searchAllPages(
    searchFn: (page: number) => Promise<SearchResponse>,
    maxPages: number = 10
  ): Promise<SearchResponse["listings"]> {
    const allListings: SearchResponse["listings"] = [];
    let page = 1;
    while (page <= maxPages) {
      const result = await searchFn(page);
      allListings.push(...result.listings);
      if (page >= result.paging.totalPages) break;
      page++;
    }
    return allListings;
  }

  // ============================================================
  // Property details
  // ============================================================

  /** Get full property details by listing id. */
  async getPropertyDetails(id: number): Promise<PropertyDetailsResponse> {
    return this.fetchJson<PropertyDetailsResponse>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.AD_DETAILS, { id })}`,
      "GET"
    );
  }

  /**
   * Get property details using a legacy (site) ad id.
   * @deprecated The legacy endpoint is still served but may 404 for newer ids.
   */
  async getPropertyDetailsLegacy(
    siteAdId: number
  ): Promise<PropertyDetailsResponse> {
    return this.fetchJson<PropertyDetailsResponse>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.AD_DETAILS_LEGACY, { siteAdId })}`,
      "GET"
    );
  }

  /** Convert a legacy ad id to the single-platform ad id. */
  async convertAdId(legacyAdId: string | number): Promise<AdConvertResponse> {
    return this.fetchJson<AdConvertResponse>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.CONVERT_AD_ID, { legacyAdId })}`,
      "GET"
    );
  }

  /** Report an ad. */
  async reportAd(body: ReportAdRequest): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.ENDPOINTS.POST_REPORT_AD}`,
      "POST",
      body
    );
  }

  /**
   * Send a reply/enquiry message for a listing.
   * Attaches lowercase `recaptcha-token` + `recaptcha-action` under the hood:
   * optional explicit token, else {@link DaftApiOptions.mintRecaptchaToken},
   * else TCP mint via `DAFT_RECAPTCHA_TCP_HOST` (phone LSPosed).
   * Action is always {@link DEFAULT_RECAPTCHA_ACTION} (`submit`).
   */
  async sendMessage(
    body: AdReplyMessageBody,
    recaptcha?: { token: string; action?: string }
  ): Promise<void> {
    const minted = await this.resolveRecaptcha(recaptcha);
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.ENDPOINTS.POST_AD_MESSAGE}`,
      "POST",
      {
        tcAccepted: true,
        ...body,
      },
      {
        // Lowercase names: gateway rejects Pascal-Case Recaptcha-* with 403.
        "recaptcha-token": minted.token,
        "recaptcha-action": minted.action,
      }
    );
  }

  private async resolveRecaptcha(
    explicit?: { token: string; action?: string }
  ): Promise<{ token: string; action: string }> {
    if (explicit?.token?.trim()) {
      return {
        token: explicit.token.trim(),
        action: DEFAULT_RECAPTCHA_ACTION,
      };
    }
    if (this.mintRecaptchaToken) {
      const minted = await this.mintRecaptchaToken();
      return { token: minted.token, action: DEFAULT_RECAPTCHA_ACTION };
    }
    if (this.recaptchaTcpHost || recaptchaTcpConfigured()) {
      return fetchRecaptchaToken({
        host: this.recaptchaTcpHost,
        port: this.recaptchaTcpPort,
      });
    }
    throw new Error(
      "reCAPTCHA mint not configured: set DAFT_RECAPTCHA_TCP_HOST (phone LSPosed TCP) or pass { token } / mintRecaptchaToken"
    );
  }

  /** Send an analytics/tracking event. */
  async postTrackEvent(body: AnalyticsEventBody): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.ENDPOINTS.POST_TRACK_EVENT}`,
      "POST",
      body
    );
  }

  /** Fetch a mortgage comparison. */
  async fetchMortgageComparison(
    body: MortgageComparisonBody
  ): Promise<MortgageComparisonResult> {
    return this.fetchJson<MortgageComparisonResult>(
      `${this.base("common")}${DaftApi.ENDPOINTS.MORTGAGE_COMPARISON}`,
      "POST",
      body
    );
  }

  // ============================================================
  // Areas / autocomplete / filters
  // ============================================================

  /** List all searchable areas. */
  async getAutoCompleteAreas(): Promise<Area[]> {
    return this.fetchJson<Area[]>(
      `${this.base("old")}${DaftApi.ENDPOINTS.AUTOCOMPLETE_AREAS}`,
      "GET"
    );
  }

  /** Get available filters for a section. */
  async getFiltersForSection(sectionName: string): Promise<FilterResponse> {
    return this.fetchJson<FilterResponse>(
      `${this.base("old")}${DaftApi.path(DaftApi.ENDPOINTS.FILTERS, { section: sectionName })}`,
      "GET"
    );
  }

  /** Get sub-areas within a location. */
  async getSubAreas(id: number | string): Promise<Area[]> {
    return this.fetchJson<Area[]>(
      `${this.base("old")}${DaftApi.path(DaftApi.ENDPOINTS.SUB_AREAS, { id })}`,
      "GET"
    );
  }

  /** Get classified areas (counties, cities, colleges, areas). */
  async getClassifiedAreas(): Promise<ClassifiedAreasResponse> {
    return this.fetchJson<ClassifiedAreasResponse>(
      `${this.base("old")}${DaftApi.ENDPOINTS.CLASSIFIED_AREAS}`,
      "GET"
    );
  }

  /** Autocomplete areas by search term. */
  async autocomplete(searchTerm: string): Promise<Area[]> {
    return this.fetchJson<Area[]>(
      `${this.base("old")}${DaftApi.ENDPOINTS.AUTOCOMPLETE}`,
      "POST",
      { text: searchTerm }
    );
  }

  /** Autocomplete colleges by search term. */
  async getColleges(searchTerm: string): Promise<Area[]> {
    return this.fetchJson<Area[]>(
      `${this.base("old")}${DaftApi.ENDPOINTS.AUTOCOMPLETE_COLLEGES}`,
      "POST",
      { text: searchTerm }
    );
  }

  /** Geocoded location autocomplete. */
  async getLocationAutocomplete(query: string): Promise<Location[]> {
    return this.fetchJson<Location[]>(
      `${this.base("common")}${DaftApi.ENDPOINTS.LOCATIONS_AUTOCOMPLETE}?query=${encodeURIComponent(query)}`,
      "GET"
    );
  }

  /** Get reasons a user can report an ad for. */
  async getReportReasons(): Promise<ReportReason[]> {
    return this.fetchJson<ReportReason[]>(
      `${this.base("common")}${DaftApi.ENDPOINTS.REPORT_REASONS}`,
      "GET"
    );
  }

  /** Map a Daft area id to the Allianz area id. */
  async getAreaMapping(areaId: number | string): Promise<AreaMapping> {
    return this.fetchJson<AreaMapping>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.AREA_MAPPING, { areaId })}`,
      "GET"
    );
  }

  // ============================================================
  // Auth (Keycloak)
  // ============================================================

  /**
   * Authenticate with Daft credentials (Keycloak password grant) and store
   * the access token.
   *
   * Note: password grants only work for accounts that have a Keycloak
   * password. Accounts created via Google/Apple SSO cannot log in this way —
   * obtain a token through the app/website and pass it via `authToken`.
   */
  async login(username: string, password: string): Promise<TokenResponse> {
    const token = await this.requestToken({
      grant_type: "password",
      client_id: this.clientId,
      username,
      password,
      scope: "openid offline_access dapi",
    });
    this.token = token.access_token;
    if (token.refresh_token) this.refreshTokenValue = token.refresh_token;
    this.emitTokensChange("current");
    return token;
  }

  /**
   * Refresh an access token using a refresh token.
   * Returns a new access token (and a new refresh token).
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    this.refreshTokenValue = refreshToken;
    const token = await this.requestToken({
      grant_type: "refresh_token",
      client_id: this.clientId,
      refresh_token: refreshToken,
    });
    this.token = token.access_token;
    if (token.refresh_token) this.refreshTokenValue = token.refresh_token;
    this.emitTokensChange("current");
    return token;
  }

  /** Log out a session on the Keycloak server. */
  async logout(
    refreshToken: string,
    username?: string
  ): Promise<LogoutResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const form = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        refresh_token: refreshToken,
        ...(username ? { username } : {}),
      });
      const response = await this.fetchFn(
        `${this.authUrl}${DaftApi.ENDPOINTS.LOGOUT}`,
        {
          method: "POST",
          headers: { accept: "application/json" },
          body: form,
          signal: controller.signal,
        }
      );
      const body = (await response.json().catch(() => ({}))) as LogoutResponse;
      if (!response.ok) {
        throw new ApiError(
          response.status,
          `${this.authUrl}${DaftApi.ENDPOINTS.LOGOUT}`,
          "POST",
          body,
          `Logout failed: HTTP ${response.status}`
        );
      }
      this.token = undefined;
      this.refreshTokenValue = undefined;
      this.emitTokensChange(null);
      return body;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Shared token endpoint caller (form-encoded). */
  private async requestToken(
    formData: Record<string, string>
  ): Promise<TokenResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await this.fetchFn(
        `${this.authUrl}${DaftApi.ENDPOINTS.TOKEN}`,
        {
          method: "POST",
          headers: { accept: "application/json" },
          body: new URLSearchParams(formData),
          signal: controller.signal,
        }
      );
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new ApiError(
          response.status,
          `${this.authUrl}${DaftApi.ENDPOINTS.TOKEN}`,
          "POST",
          text,
          `Token request failed: HTTP ${response.status} — ${text.slice(0, 200)}`
        );
      }
      return (await response.json()) as TokenResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ============================================================
  // Authenticated endpoints (require authToken or login())
  // ============================================================

  /** Get user info (requires auth). */
  async getUserInfo(userId: string | number): Promise<UserInfo> {
    return this.fetchJson<UserInfo>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.USER_INFO, { userId })}`,
      "GET"
    );
  }

  /** Update the user's consents (requires auth). */
  async updateUserConsents(
    userId: string | number,
    consents: Consent
  ): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.USER_CONSENTS, { userId })}`,
      "PATCH",
      consents
    );
  }

  /** Get saved ads for a user (requires auth). */
  async getSavedAds(
    userId: string | number,
    options: { pageSize?: number; from?: number } = {}
  ): Promise<SavedAdsResponse> {
    const pageSize = options.pageSize ?? 20;
    const from = options.from ?? 0;
    return this.fetchJson<SavedAdsResponse>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.SAVED_ADS_FETCH, { userId })}?pageSize=${pageSize}&from=${from}`,
      "GET"
    );
  }

  /** Save an ad (requires auth). */
  async saveAd(body: SaveAdBody): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.ENDPOINTS.SAVED_ADS_CREATE}`,
      "POST",
      body
    );
  }

  /** Update a saved ad's alert preferences (requires auth). */
  async updateSavedAd(body: SaveAdBody): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.ENDPOINTS.SAVED_ADS_CREATE}`,
      "PATCH",
      body
    );
  }

  /** Delete a saved ad (requires auth). */
  async deleteSavedAd(
    userId: string | number,
    id: string | number
  ): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.SAVED_ADS_DELETE, { userId, id })}`,
      "DELETE"
    );
  }

  /** Get saved searches for a user (requires auth). */
  async getSavedSearches(userId: string | number): Promise<SavedSearchResponse> {
    return this.fetchJson<SavedSearchResponse>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.SAVED_SEARCHES_FETCH, { userId })}`,
      "GET"
    );
  }

  /** Save a search (requires auth). */
  async saveSearch(
    body: SavedSearchParamsBody
  ): Promise<SavedSearchCreateResponse> {
    return this.fetchJson<SavedSearchCreateResponse>(
      `${this.base("common")}${DaftApi.ENDPOINTS.SAVED_SEARCHES_CREATE}`,
      "POST",
      body
    );
  }

  /** Delete a saved search (requires auth). */
  async deleteSavedSearch(
    userId: string | number,
    id: string | number
  ): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.SAVED_SEARCHES_DELETE, { userId, id })}`,
      "DELETE"
    );
  }

  /** Update a saved search's alert settings (requires auth). */
  async updateSearch(
    userId: string | number,
    id: string | number,
    body: UpdateSearchParamsBody
  ): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.SAVED_SEARCHES_UPDATE, { userId, id })}`,
      "PATCH",
      body
    );
  }

  /** Get the user's saved "my properties" (requires auth). */
  async getMyProperties(): Promise<PropertyDto[]> {
    return this.fetchJson<PropertyDto[]>(
      `${this.base("common")}${DaftApi.ENDPOINTS.MY_PROPERTIES}`,
      "GET"
    );
  }

  /** Create a "my property" (requires auth). */
  async createMyProperty(body: CreatePropertyDto): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.ENDPOINTS.MY_PROPERTIES}`,
      "POST",
      body
    );
  }

  /** Delete a "my property" (requires auth). */
  async deleteMyProperty(propertyId: string): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.MY_PROPERTIES_DELETE, { propertyId })}`,
      "DELETE"
    );
  }

  /** Get the user's own ads (requires auth). */
  async getMyAds(userId: string | number): Promise<MyAdsResponse> {
    return this.fetchJson<MyAdsResponse>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.MY_ADS, { userId })}`,
      "GET"
    );
  }

  /** Update the state of one of the user's ads (requires auth). */
  async updateAdState(adId: string | number, body: AdStateBody): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.AD_STATE, { adId })}`,
      "PUT",
      body
    );
  }

  /** Relist a user's archived ad (requires auth). */
  async relistAd(adId: string | number, body: AdRelistBody): Promise<AdRelistResponse> {
    return this.fetchJson<AdRelistResponse>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.AD_STATE, { adId })}`,
      "PUT",
      body
    );
  }

  /** Get inbox enquiries for one of the user's ads (requires auth). */
  async getEnquiries(
    adId: string | number,
    pageNumber?: number
  ): Promise<InboxEnquiriesResponse> {
    const query = `adId=${adId}${pageNumber !== undefined ? `&pageNumber=${pageNumber}` : ""}`;
    return this.fetchJson<InboxEnquiriesResponse>(
      `${this.base("common")}${DaftApi.ENDPOINTS.ENQUIRIES}?${query}`,
      "GET"
    );
  }

  /** Mark replies as read/unread (requires auth). */
  async markReplies(body: MarkReadRequest[]): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.ENDPOINTS.REPLIES}`,
      "PATCH",
      body
    );
  }

  /** Get the enquiry form / saved reply for a listing (requires auth). */
  async getSavedReply(listingId: string | number): Promise<SavedReply> {
    return this.fetchJson<SavedReply>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.FORMS_ENQUIRY, { listingId })}`,
      "GET"
    );
  }

  /** Get the offers available on an ad (requires auth). */
  async getOffers(adId: string | number): Promise<AdOffers> {
    return this.fetchJson<AdOffers>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.OFFERS, { ad_id: adId })}`,
      "GET"
    );
  }

  /** Make an offer on an ad (requires auth). */
  async makeOffer(adId: string | number, body: MakeOfferBody): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.OFFERS_SUBMISSIONS, { ad_id: adId })}`,
      "POST",
      body
    );
  }

  /** Create a bidder for an ad's offers (requires auth). */
  async createBidder(adId: string | number, body: CreateBidderBody): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("common")}${DaftApi.path(DaftApi.ENDPOINTS.OFFERS_BIDDERS, { ad_id: adId })}`,
      "POST",
      body
    );
  }

  /** Register a push notification token for a user (requires auth). */
  async createPushToken(
    userId: string | number,
    body: PushTokenBody
  ): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("old")}${DaftApi.path(DaftApi.ENDPOINTS.PUSH_TOKENS, { userId })}`,
      "POST",
      body
    );
  }

  /** Delete a push notification token for a user (requires auth). */
  async deletePushToken(
    userId: string | number,
    pushToken: string
  ): Promise<void> {
    return this.fetchJson<void>(
      `${this.base("old")}${DaftApi.path(DaftApi.ENDPOINTS.PUSH_TOKENS, { userId })}/${encodeURIComponent(pushToken)}`,
      "DELETE"
    );
  }
}

export default DaftApi;
