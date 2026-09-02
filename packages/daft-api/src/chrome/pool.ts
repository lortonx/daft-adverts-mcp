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
import {
  extractCfCookies,
  hasFreshGlobalCf,
  loadGlobalCfCookies,
  mergeCfCookies,
  saveGlobalCfCookies,
  stripCfCookies,
} from "./cf-cookies";
import { warmCfClearance } from "./cf-warm";

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
  private globalCfSynced = false;

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
    this.globalCfSynced = false;
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
    // Keep host attach CDP connected; spawned local Chrome may idle-kill.
    if (this.proc.isAttached) {
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
    await this.ensureCfReady(b);
    this.touchIdle();
    return b;
  }

  /** Ensure CF is ready; re-warm when global file missing or mid-challenge cookies detected. */
  private async ensureCfReady(browser: CdpSession): Promise<void> {
    await this.syncGlobalCfCookies(browser);
    if (
      hasFreshGlobalCf(this.conf.cookieDir) &&
      (!this.conf.cdpUrl || (await this.hostProfileCfLooksValid(browser)))
    ) {
      return;
    }
    const ok = await warmCfClearance(browser, this.conf, {
      force: true,
      maxSec: 60,
    });
    if (
      ok ||
      hasFreshGlobalCf(this.conf.cookieDir) ||
      (this.conf.cdpUrl && (await this.hostProfileCfLooksValid(browser)))
    ) {
      return;
    }
    throw new Error(
      "Cloudflare clearance not ready. Host Chrome on DAFT_CHROME_CDP_URL needs cf_clearance (check DISPLAY=:0 and daft-chrome-cdp-loop)."
    );
  }

  /** True when host default profile has cf_clearance and no cf_chl_* challenge cookies. */
  private async hostProfileCfLooksValid(browser: CdpSession): Promise<boolean> {
    let targetId: string | undefined;
    try {
      ({ targetId } = await browser.send<{ targetId: string }>(
        "Target.createTarget",
        { url: "about:blank" }
      ));
      const attached = await browser.send<{ sessionId: string }>(
        "Target.attachToTarget",
        { targetId, flatten: true }
      );
      await browser.send("Network.enable", {}, attached.sessionId);
      const r = await browser.send<{ cookies: StoredCookie[] }>(
        "Network.getAllCookies",
        {},
        attached.sessionId
      );
      const cookies = r.cookies ?? [];
      const hasClearance = cookies.some((c) => /^cf_clearance$/i.test(c.name));
      const hasChallenge = cookies.some((c) => /^cf_chl_|^__cf_chl/i.test(c.name));
      return hasClearance && !hasChallenge;
    } catch {
      return false;
    } finally {
      if (targetId) {
        try {
          await browser.send("Target.closeTarget", { targetId });
        } catch {
          /* ignore */
        }
      }
    }
  }

  /**
   * Copy cf_clearance from host Chrome default profile into _cf_global.json
   * so isolated BrowserContexts inherit clearance without a manual challenge.
   */
  private async syncGlobalCfCookies(browser: CdpSession): Promise<void> {
    if (this.globalCfSynced && hasFreshGlobalCf(this.conf.cookieDir)) {
      return;
    }
    let targetId: string | undefined;
    try {
      ({ targetId } = await browser.send<{ targetId: string }>(
        "Target.createTarget",
        { url: "about:blank" }
      ));
      const attached = await browser.send<{ sessionId: string }>(
        "Target.attachToTarget",
        { targetId, flatten: true }
      );
      await browser.send("Network.enable", {}, attached.sessionId);
      const r = await browser.send<{ cookies: StoredCookie[] }>(
        "Network.getAllCookies",
        {},
        attached.sessionId
      );
      const cf = extractCfCookies(r.cookies ?? []);
      if (cf.some((c) => /^cf_clearance$/i.test(c.name))) {
        saveGlobalCfCookies(this.conf.cookieDir, cf);
        console.error(`[chrome-pool] synced ${cf.length} global CF cookie(s)`);
      }
      this.globalCfSynced = true;
    } catch (err) {
      console.error(
        `[chrome-pool] global CF sync failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      if (targetId) {
        try {
          await browser.send("Target.closeTarget", { targetId });
        } catch {
          /* ignore */
        }
      }
    }
  }

  private loadCookies(email: string): StoredCookie[] {
    const p = cookieStorePath(this.conf.cookieDir, email);
    if (!existsSync(p)) return [];
    try {
      const raw = JSON.parse(readFileSync(p, "utf8")) as StoredCookie[];
      return stripCfCookies(raw);
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

  private usesHostProfile(): boolean {
    return Boolean(this.conf.cdpUrl);
  }

  /**
   * Open an isolated tab for this email (own BrowserContext).
   * When attached to host CDP (`DAFT_CHROME_CDP_URL`), uses the host default
   * profile so Cloudflare clearance from the real display applies natively.
   * Caller must close via returned dispose / withPage.
   */
  async openPage(
    email: string,
    password?: string
  ): Promise<{ page: PageHandle; dispose: () => Promise<void> }> {
    const u = this.user(email);
    if (password) u.password = password;

    const browser = await this.browser();
    const hostProfile = this.usesHostProfile();
    if (!hasFreshGlobalCf(this.conf.cookieDir)) {
      const ok = await warmCfClearance(browser, this.conf, {
        force: true,
        maxSec: 45,
      });
      if (
        !ok &&
        !(hostProfile && (await this.hostProfileCfLooksValid(browser)))
      ) {
        throw new Error(
          "Cloudflare clearance not ready before enquiry tab opened. Warm host Chrome or run cf-warm-host."
        );
      }
    }

    if (!hostProfile) {
      if (!u.browserContextId) {
        const created = await browser.send<{ browserContextId: string }>(
          "Target.createBrowserContext"
        );
        u.browserContextId = created.browserContextId;
      }
    }

    const targetOpts: { url: string; browserContextId?: string } = {
      url: "about:blank",
    };
    if (!hostProfile && u.browserContextId) {
      targetOpts.browserContextId = u.browserContextId;
    }

    let targetId: string;
    try {
      ({ targetId } = await browser.send<{ targetId: string }>(
        "Target.createTarget",
        targetOpts
      ));
    } catch (err) {
      if (hostProfile) throw err;
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

    if (hostProfile) {
      // Host profile: never inject stale cf_clearance (triggers cf_chl_* loops).
      await page.clearCfCookies();
      const userCookies = this.loadCookies(u.email);
      if (userCookies.length) await page.setCookies(userCookies);
    } else {
      const cookies = mergeCfCookies(
        this.loadCookies(u.email),
        loadGlobalCfCookies(this.conf.cookieDir)
      );
      if (cookies.length) await page.setCookies(cookies);
    }

    this.activeLeases++;
    u.leases++;
    this.touchIdle();

    let disposed = false;
    const dispose = async () => {
      if (disposed) return;
      disposed = true;
      try {
        const latest = await page.getCookies();
        saveGlobalCfCookies(this.conf.cookieDir, latest);
        // Persist daft/keycloak session only — CF lives in _cf_global.json
        const keep = stripCfCookies(latest).filter((c) =>
          /daft\.ie|keycloak/i.test(c.domain)
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
