import { DaftApi } from "@daft-ie/api";
import {
  persistTokensChange,
  readTokenStore,
} from "./token-store";

/**
 * Build a DaftApi client from persisted tokens (previous login) and/or env.
 * Token file wins over `.env` so auth_login / refresh rotation survive restarts.
 */
export function createDaftClient(): DaftApi {
  const stored = readTokenStore();
  return new DaftApi({
    // Android app client id — required even when .env isn't loaded (wrong cwd).
    clientId: process.env.DAFT_CLIENT_ID ?? "daft-android-v2",
    platform: "android",
    appVersion: "9.8.1",
    timeout: 8000,
    refreshToken:
      stored?.refreshToken ?? process.env.DAFT_REFRESH_TOKEN ?? undefined,
    authToken:
      stored?.accessToken ?? process.env.DAFT_ACCESS_TOKEN ?? undefined,
    onTokensChange: persistTokensChange,
  });
}
