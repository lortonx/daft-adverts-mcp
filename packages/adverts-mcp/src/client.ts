import { AdvertsApi } from "@adverts-ie/api";
import { persistTokensChange, readTokenStore } from "./token-store";

/**
 * Build an AdvertsApi client from persisted tokens and/or env.
 * Token file wins over `.env` so auth_login survives restarts.
 */
export function createAdvertsClient(): AdvertsApi {
  const stored = readTokenStore();
  return new AdvertsApi({
    accessToken:
      stored?.accessToken ?? process.env.ADVERTS_ACCESS_TOKEN ?? undefined,
    onTokensChange: persistTokensChange,
  });
}
