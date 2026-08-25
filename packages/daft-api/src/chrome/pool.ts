/**
 * On-demand Chrome + Xvfb pool with per-email BrowserContext tabs.
 *
 * - One Chrome process (headed; CF-safe)
 * - Isolated cookies via Target.createBrowserContext per email
 * - Cookie JSON persistence across Chrome idle kills
 * - Concurrent users = concurrent contexts/tabs
 * - Same-email jobs serialized via Mutex
 * - Idle timeout kills Chrome (+ Xvfb) when no active leases
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { ChromeProcess } from "./chrome-process";
import type { CdpSession } from "./cdp";
import { PageHandle } from "./page";
import {
  Mutex,
  cookieStorePath,
  normalizeEmail,
  resolveChromePoolEnv,
  type ChromePoolEnv,
  type StoredCookie,
} from "./util";
import {
  deleteCookieFile,
  pruneStaleCookieFiles,
  wipeChromeProfile,
} from "./cleanup";

export type ChromePoolOptions = Partial<ChromePoolEnv> & {
  env?: NodeJS.ProcessEnv;
};

type UserState = {
  email: string;
  password?: string;
  browserContextId?: string;
  mutex: Mutex;
  /** Active page leases (for idle accounting). */
  leases: number;
};

export class ChromePool {
  private readonly conf: ChromePoolEnv;
  private readonly proc: ChromeProcess;
  private readonly users = new Map<string, UserState>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private starting: Promise<CdpSession> | null = null;
  private activeLeases = 0;
  /** One shared host Chrome → serialize all tabs (not only per-email). */
  private readonly cdpMutex = new Mutex();

  constructor(opts: ChromePoolOptions = {}) {
    const base = resolveChromePoolEnv(opts.env ?? process.env);
    this.conf = {
      ...base,
      chromePath: opts.chromePath ?? base.chromePath,
      userDataDir: opts.userDataDir ?? base.userDataDir,
      cookieDir: opts.cookieDir ?? base.cookieDir,
      debuggingPort: opts.debuggingPort ?? base.debuggingPort,
      idleMs: opts.idleMs ?? base.idleMs,
      xvfb: opts.xvfb ?? base.xvfb,
      display: opts.display ?? base.display,
      windowSize: opts.windowSize ?? base.windowSize,
      wipeProfileOnStop: opts.wipeProfileOnStop ?? base.wipeProfileOnStop,
      cookieMaxAgeMs: opts.cookieMaxAgeMs ?? base.cookieMaxAgeMs,
      cdpUrl: opts.cdpUrl ?? base.cdpUrl,
    };
    mkdirSync(this.conf.cookieDir, { recursive: true });
    pruneStaleCookieFiles(this.conf.cookieDir, this.conf.cookieMaxAgeMs);
    this.proc = new ChromeProcess(this.conf);
  }

  /** Remember password in-memory for cold Chrome restarts (never disk). */
  rememberPassword(email: string, password: string) {
    const key = normalizeEmail(email);
    const u = this.users.get(key) ?? {
      email: key,
      mutex: new Mutex(),
      leases: 0,
    };
    u.password = password;
    this.users.set(key, u);
  }

  /** Drop in-memory user + delete cookie JSON (auth_logout). */
  clearUser(email: string) {
    const key = normalizeEmail(email);
    this.users.delete(key);
    deleteCookieFile(this.conf.cookieDir, key);
  }

  private afterChromeStop() {
    for (const u of this.users.values()) {
      u.browserContextId = undefined;
    }
    if (this.conf.wipeProfileOnStop) {
      wipeChromeProfile(this.conf.userDataDir);
    }
    const n = pruneStaleCookieFiles(
      this.conf.cookieDir,
      this.conf.cookieMaxAgeMs
    );
    if (n > 0) {
      console.error(`[chrome-pool] pruned ${n} stale cookie file(s)`);
    }
  }

  private touchIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.conf.idleMs <= 0) return;
    this.idleTimer = setTimeout(() => {
      void this.maybeIdleStop();
    }, this.conf.idleMs);
  }

  private async maybeIdleStop() {
    if (this.activeLeases > 0) {
      this.touchIdle();
      return;
    }
    // Attach mode: keep the CDP websocket (and host Chrome) alive.
    // Disconnecting after idleMs causes "CDP session closed" / client
    // "Socket connection closed" on the next burst of send_enquiry calls.
    if (this.conf.cdpUrl) {
      return;
    }
    await this.proc.stop();
    this.afterChromeStop();
  }

  private async browser(): Promise<CdpSession> {
    if (this.proc.running && this.proc.browser) {
      this.touchIdle();
      return this.proc.browser;
    }
    // Stale contexts after CDP drop / host Chrome restart
    this.afterChromeStop();
    if (!this.starting) {
      this.starting = this.proc.start().finally(() => {
        this.starting = null;
      });
    }
    const b = await this.starting;
    this.touchIdle();
    return b;
  }

  private loadCookies(email: string): StoredCookie[] {
    const p = cookieStorePath(this.conf.cookieDir, email);
    if (!existsSync(p)) return [];
    try {
      return JSON.parse(readFileSync(p, "utf8")) as StoredCookie[];
    } catch {
      return [];
    }
  }

  private saveCookies(email: string, cookies: StoredCookie[]) {
    const p = cookieStorePath(this.conf.cookieDir, email);
    writeFileSync(p, JSON.stringify(cookies, null, 0));
  }

  private user(email: string): UserState {
    const key = normalizeEmail(email);
    let u = this.users.get(key);
    if (!u) {
      u = { email: key, mutex: new Mutex(), leases: 0 };
      this.users.set(key, u);
    }
    return u;
  }

  /**
   * Open an isolated tab for this email (own BrowserContext).
   * Caller must close via returned dispose / withPage.
   */
  async openPage(
    email: string,
    password?: string
  ): Promise<{ page: PageHandle; dispose: () => Promise<void> }> {
    const u = this.user(email);
    if (password) u.password = password;

    const browser = await this.browser();

    if (!u.browserContextId) {
      const created = await browser.send<{ browserContextId: string }>(
        "Target.createBrowserContext"
      );
      u.browserContextId = created.browserContextId;
    }

    let targetId: string;
    try {
      ({ targetId } = await browser.send<{ targetId: string }>(
        "Target.createTarget",
        {
          url: "about:blank",
          browserContextId: u.browserContextId,
        }
      ));
    } catch {
      // Stale context after unexpected Chrome restart
      const created = await browser.send<{ browserContextId: string }>(
        "Target.createBrowserContext"
      );
      u.browserContextId = created.browserContextId;
      ({ targetId } = await browser.send<{ targetId: string }>(
        "Target.createTarget",
        {
          url: "about:blank",
          browserContextId: u.browserContextId,
        }
      ));
    }

    const attached = await browser.send<{ sessionId: string }>(
      "Target.attachToTarget",
      { targetId, flatten: true }
    );

    const page = new PageHandle(browser, attached.sessionId, targetId);
    await page.enable();

    const cookies = this.loadCookies(u.email);
    if (cookies.length) await page.setCookies(cookies);

    this.activeLeases++;
    u.leases++;
    this.touchIdle();

    let disposed = false;
    const dispose = async () => {
      if (disposed) return;
      disposed = true;
      try {
        const latest = await page.getCookies();
        // Persist daft + Cloudflare clearance for warmer next jobs
        const keep = latest.filter(
          (c) =>
            /daft\.ie|keycloak|cloudflare/i.test(c.domain) ||
            /^cf_clearance$|^__cf_bm$/i.test(c.name)
        );
        if (keep.length) this.saveCookies(u.email, keep);
      } catch {
        /* ignore */
      }
      try {
        await page.close();
      } catch {
        /* ignore */
      }
      u.leases = Math.max(0, u.leases - 1);
      this.activeLeases = Math.max(0, this.activeLeases - 1);
      this.touchIdle();
    };

    return { page, dispose };
  }

  /**
   * Run work on a dedicated tab for this email (serialized per email).
   * In DAFT_CHROME_CDP_URL attach mode, also globally serialized — one host
   * Chrome cannot safely run parallel CDP jobs (OpenCode bursts).
   */
  async withPage<T>(
    email: string,
    password: string | undefined,
    fn: (page: PageHandle, user: UserState) => Promise<T>
  ): Promise<T> {
    const u = this.user(email);
    if (password) u.password = password;
    const run = async () => {
      const { page, dispose } = await this.openPage(u.email, u.password);
      try {
        return await fn(page, u);
      } finally {
        await dispose();
      }
    };
    if (this.conf.cdpUrl) {
      return this.cdpMutex.run(() => u.mutex.run(run));
    }
    return u.mutex.run(run);
  }

  async shutdown() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    await this.proc.stop();
    this.afterChromeStop();
  }

  /** Test/diag helpers */
  get diagnostics() {
    return {
      running: this.proc.running,
      activeLeases: this.activeLeases,
      users: [...this.users.values()].map((u) => ({
        email: u.email,
        hasPassword: Boolean(u.password),
        hasContext: Boolean(u.browserContextId),
        leases: u.leases,
      })),
      idleMs: this.conf.idleMs,
      xvfb: this.conf.xvfb,
      wipeProfileOnStop: this.conf.wipeProfileOnStop,
      cookieMaxAgeMs: this.conf.cookieMaxAgeMs,
    };
  }
}

let singleton: ChromePool | null = null;

export function getChromePool(opts?: ChromePoolOptions): ChromePool {
  if (!singleton) singleton = new ChromePool(opts);
  return singleton;
}

export function resetChromePoolForTests() {
  const p = singleton;
  singleton = null;
  return p?.shutdown();
}

/** Soft wait used by enquiry flow */
export async function pause(ms: number) {
  await sleep(ms);
}
