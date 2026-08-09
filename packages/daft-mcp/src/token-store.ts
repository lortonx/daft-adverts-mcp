import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DaftTokensSnapshot } from "@daft-ie/api";

export type StoredDaftTokens = {
  accessToken?: string;
  refreshToken?: string;
  updatedAt: string;
};

/** Path to the persisted token file (override with DAFT_TOKEN_FILE). */
export function tokenStorePath(): string {
  return resolve(
    process.env.DAFT_TOKEN_FILE ??
      resolve(process.cwd(), ".daft-tokens.json")
  );
}

/** Load tokens saved after a previous auth_login / refresh rotation. */
export function readTokenStore(): StoredDaftTokens | null {
  try {
    const raw = readFileSync(tokenStorePath(), "utf8");
    const parsed = JSON.parse(raw) as StoredDaftTokens;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.refreshToken && !parsed.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist current session tokens (refresh is required for restart survival). */
export function writeTokenStore(tokens: DaftTokensSnapshot): void {
  const path = tokenStorePath();
  mkdirSync(dirname(path), { recursive: true });
  const prev = readTokenStore();
  const next: StoredDaftTokens = {
    accessToken: tokens.accessToken ?? prev?.accessToken,
    refreshToken: tokens.refreshToken ?? prev?.refreshToken,
    updatedAt: new Date().toISOString(),
  };
  if (!next.refreshToken && !next.accessToken) {
    clearTokenStore();
    return;
  }
  writeFileSync(path, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
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
export function persistTokensChange(tokens: DaftTokensSnapshot | null): void {
  if (!tokens) {
    clearTokenStore();
    return;
  }
  writeTokenStore(tokens);
}
