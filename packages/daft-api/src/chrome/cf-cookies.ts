/**
 * Shared Cloudflare clearance cookies across BrowserContexts.
 * cf_clearance is IP/browser scoped — safe to reuse for all enquiry users.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StoredCookie } from "./util";

export const CF_COOKIE_FILE = "_cf_global.json";

export function isCfCookie(c: StoredCookie): boolean {
  return (
    /^cf_clearance$|^__cf_bm$|^__cflb$/i.test(c.name) ||
    (/\.daft\.ie$/i.test(c.domain) &&
      /^cf_clearance$|^__cf_bm$/i.test(c.name))
  );
}

/** Mid-challenge state cookies — never persist or inject (break clearance). */
export function isCfChallengeCookie(c: StoredCookie): boolean {
  return /^cf_chl_|^__cf_chl/i.test(c.name);
}

export function stripCfCookies(cookies: StoredCookie[]): StoredCookie[] {
  return cookies.filter((c) => !isCfCookie(c) && !isCfChallengeCookie(c));
}

export function dedupeCfClearance(cookies: StoredCookie[]): StoredCookie[] {
  const nonCf = stripCfCookies(cookies);
  const clearance = cookies
    .filter((c) => /^cf_clearance$/i.test(c.name))
    .pop();
  const bm = cookies.filter((c) => /^__cf_bm$/i.test(c.name)).pop();
  return [
    ...nonCf,
    ...(bm ? [bm] : []),
    ...(clearance ? [clearance] : []),
  ];
}

export function cfCookiePath(cookieDir: string): string {
  return join(cookieDir, CF_COOKIE_FILE);
}

export function loadGlobalCfCookies(cookieDir: string): StoredCookie[] {
  const p = cfCookiePath(cookieDir);
  if (!existsSync(p)) return [];
  try {
    const all = JSON.parse(readFileSync(p, "utf8")) as StoredCookie[];
    return all.filter(isCfCookie);
  } catch {
    return [];
  }
}

export function saveGlobalCfCookies(
  cookieDir: string,
  cookies: StoredCookie[]
): void {
  const keep = dedupeCfClearance(cookies.filter(isCfCookie));
  if (!keep.length) return;
  writeFileSync(cfCookiePath(cookieDir), JSON.stringify(keep, null, 0));
}

export function mergeCfCookies(
  userCookies: StoredCookie[],
  globalCf: StoredCookie[]
): StoredCookie[] {
  const base = stripCfCookies(userCookies);
  if (!globalCf.length) return base;
  return dedupeCfClearance([...base, ...globalCf.filter(isCfCookie)]);
}

export function extractCfCookies(cookies: StoredCookie[]): StoredCookie[] {
  return cookies.filter(isCfCookie);
}
