/**
 * Shared helpers for Chrome CDP enquiry pool.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailCookieKey(email: string): string {
  return createHash("sha256")
    .update(normalizeEmail(email))
    .digest("hex")
    .slice(0, 24);
}

export function cookieStorePath(baseDir: string, email: string): string {
  return join(baseDir, `${emailCookieKey(email)}.json`);
}

/** Simple promise mutex (per-user serialization). */
export class Mutex {
  private chain: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const prev = this.chain;
    this.chain = prev.then(() => gate);
    return prev.then(async () => {
      try {
        return await fn();
      } finally {
        release();
      }
    });
  }
}

export type StoredCookie = {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

export type ChromePoolEnv = {
  chromePath: string;
  userDataDir: string;
  cookieDir: string;
  debuggingPort: number;
  idleMs: number;
  xvfb: boolean;
  display: string;
  windowSize: string;
  /** Wipe --user-data-dir after idle kill / shutdown (default true). */
  wipeProfileOnStop: boolean;
  /** Drop cookie JSON older than this (default 30d). 0 = never prune by age. */
  cookieMaxAgeMs: number;
};

function envFlag(env: NodeJS.ProcessEnv, key: string, defaultTrue: boolean): boolean {
  const v = env[key]?.trim().toLowerCase();
  if (v === undefined || v === "") return defaultTrue;
  return !(v === "0" || v === "false" || v === "no" || v === "off");
}

export function resolveChromePoolEnv(
  env: NodeJS.ProcessEnv = process.env
): ChromePoolEnv {
  const home =
    env.DAFT_CHROME_DATA_DIR?.trim() ||
    join(process.cwd(), ".daft-chrome");
  const cookieMaxAgeRaw = env.DAFT_CHROME_COOKIE_MAX_AGE_MS?.trim();
  const cookieMaxAgeMs =
    cookieMaxAgeRaw === undefined || cookieMaxAgeRaw === ""
      ? 30 * 24 * 60 * 60 * 1000
      : Number(cookieMaxAgeRaw);
  return {
    chromePath:
      env.CHROME_PATH?.trim() ||
      env.DAFT_CHROME_PATH?.trim() ||
      defaultChromePath(),
    userDataDir: join(home, "profile"),
    cookieDir: join(home, "cookies"),
    debuggingPort: Number(env.DAFT_CHROME_DEBUG_PORT ?? 9339) || 9339,
    idleMs: Number(env.DAFT_CHROME_IDLE_MS ?? 90_000) || 90_000,
    xvfb:
      env.DAFT_CHROME_XVFB === "1" ||
      env.DAFT_CHROME_XVFB === "true" ||
      (!env.DISPLAY && process.platform === "linux"),
    display: env.DAFT_CHROME_DISPLAY?.trim() || env.DISPLAY?.trim() || ":99",
    windowSize: env.DAFT_CHROME_WINDOW_SIZE?.trim() || "1280,900",
    wipeProfileOnStop: envFlag(env, "DAFT_CHROME_WIPE_PROFILE", true),
    cookieMaxAgeMs: Number.isFinite(cookieMaxAgeMs) ? cookieMaxAgeMs : 0,
  };
}

function defaultChromePath(): string {
  if (process.platform === "win32") {
    return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  }
  return "google-chrome";
}

export function enquiryMode(
  env: NodeJS.ProcessEnv = process.env
): "chrome" | "tcp" | "auto" {
  const v = (env.DAFT_ENQUIRY_MODE ?? "chrome").trim().toLowerCase();
  if (v === "chrome" || v === "tcp" || v === "auto") return v;
  return "chrome";
}
