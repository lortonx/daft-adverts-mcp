import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AdvertsTokensSnapshot } from "@adverts-ie/api";

export type StoredAdvertsTokens = {
  accessToken?: string;
  updatedAt: string;
};

/** Path to the persisted token file (override with ADVERTS_TOKEN_FILE). */
export function tokenStorePath(): string {
  return resolve(
    process.env.ADVERTS_TOKEN_FILE ??
      resolve(process.cwd(), ".adverts-tokens.json")
  );
}

/** Load tokens saved after a previous auth_login. */
export function readTokenStore(): StoredAdvertsTokens | null {
  try {
    const raw = readFileSync(tokenStorePath(), "utf8");
    const parsed = JSON.parse(raw) as StoredAdvertsTokens;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist current session token. */
export function writeTokenStore(tokens: AdvertsTokensSnapshot): void {
  const path = tokenStorePath();
  mkdirSync(dirname(path), { recursive: true });
  const prev = readTokenStore();
  const next: StoredAdvertsTokens = {
    accessToken: tokens.accessToken ?? prev?.accessToken,
    updatedAt: new Date().toISOString(),
  };
  if (!next.accessToken) {
    clearTokenStore();
    return;
  }
  writeFileSync(path, JSON.stringify(next, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

/** Remove the token file (logout / dead session). */
export function clearTokenStore(): void {
  try {
    unlinkSync(tokenStorePath());
  } catch {
    // ignore missing file
  }
}

/** Apply onTokensChange snapshot to disk. */
export function persistTokensChange(
  tokens: AdvertsTokensSnapshot | null
): void {
  if (!tokens || !tokens.accessToken) {
    clearTokenStore();
    return;
  }
  writeTokenStore(tokens);
}
