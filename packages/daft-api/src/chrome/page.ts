/**
 * Page helpers over an attached CDP target session.
 * Waits use CDP lifecycle events + in-page MutationObserver / rAF poll — no fixed sleeps.
 */
import type { CdpSession } from "./cdp";
import type { StoredCookie } from "./util";

const STEALTH_SCRIPT = `(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  if (!window.chrome) window.chrome = { runtime: {} };
})();`;

const CHALLENGE_EXPR = `(() => {
  const title = document.title || '';
  const body = document.body?.innerText || '';
  const href = location.href || '';
  const blob = title + ' ' + body;
  const cfUrl = /__cf_chl|cf_chl_rt|challenges\\.cloudflare/i.test(href);
  const cfText = /just a moment|checking the security|security check/i.test(blob);
  const normal = /property website|sign in|accept all|find your way|buy.*sell|search homes|place ad|residential|commercial|daft mortgage/i.test(blob);
  return {
    challenge: (cfText || cfUrl) && !normal,
    cfUrl,
    title,
    href,
    normal,
  };
})()`;

const CF_CLEARED_PRED = `(() => {
  const title = document.title || '';
  const body = document.body?.innerText || '';
  const href = location.href || '';
  const blob = title + ' ' + body;
  const cfUrl = /__cf_chl|cf_chl_rt|challenges\\.cloudflare/i.test(href);
  const cfText = /just a moment|checking the security|security check/i.test(blob);
  const normal = /property website|sign in|accept all|find your way|buy.*sell|search homes|place ad|residential|commercial|daft mortgage/i.test(blob);
  const challenge = (cfText || cfUrl) && !normal;
  return normal || !challenge;
})()`;

export class PageHandle {
  networkLog: Array<{ url: string; status: number }> = [];

  constructor(
    private readonly browser: CdpSession,
    readonly sessionId: string,
    readonly targetId: string
  ) {}

  send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
    return this.browser.send<T>(method, params, this.sessionId);
  }

  async evaluate<T>(expression: string): Promise<T> {
    const r = await this.send<{
      result?: { value?: T };
      exceptionDetails?: unknown;
    }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails as {
        text?: string;
        exception?: { description?: string };
      };
      throw new Error(
        d.exception?.description ??
          d.text ??
          JSON.stringify(r.exceptionDetails)
      );
    }
    return r.result?.value as T;
  }

  async enable() {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
    await this.send("Page.setLifecycleEventsEnabled", { enabled: true }).catch(
      () => undefined
    );
    await this.send("Page.addScriptToEvaluateOnNewDocument", {
      source: STEALTH_SCRIPT,
    }).catch(() => undefined);
  }

  /** Subscribe to a CDP event for this session only. */
  private onSessionEvent(
    method: string,
    fn: (params: Record<string, unknown>) => void
  ) {
    return this.browser.on(method, (params, sessionId) => {
      if (sessionId && sessionId !== this.sessionId) return;
      fn(params);
    });
  }

  /**
   * Wait until an in-page predicate is true.
   * Uses MutationObserver + requestAnimationFrame poll (no fixed delay).
   * `predicateJs` must be a JS expression returning boolean.
   */
  async waitUntil(
    predicateJs: string,
    opts: { timeoutMs?: number; label?: string } = {}
  ): Promise<void> {
    const timeoutMs = Math.max(1, opts.timeoutMs ?? 15_000);
    const label = opts.label ?? "condition";
    await this.evaluate(`(async () => {
      const pred = () => {
        try { return !!(${predicateJs}); } catch (_) { return false; }
      };
      if (pred()) return true;
      await new Promise((resolve, reject) => {
        let done = false;
        const finish = (ok, err) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          obs.disconnect();
          if (ok) resolve(true);
          else reject(err);
        };
        const timeout = setTimeout(() => {
          finish(false, new Error(${JSON.stringify(label)} + ' timeout after ${timeoutMs}ms'));
        }, ${timeoutMs});
        const obs = new MutationObserver(() => { if (pred()) finish(true); });
        obs.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
        const tick = () => {
          if (done) return;
          if (pred()) { finish(true); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return true;
    })()`);
  }

  async waitForSelector(
    selector: string,
    opts: { timeoutMs?: number; label?: string } = {}
  ): Promise<void> {
    const sel = JSON.stringify(selector);
    await this.waitUntil(`!!document.querySelector(${sel})`, {
      timeoutMs: opts.timeoutMs ?? 15_000,
      label: opts.label ?? `selector ${selector}`,
    });
  }

  /**
   * Navigate and wait for CDP load lifecycle (or loadEventFired), then document body.
   * `timeoutMs` is a deadline — not a fixed sleep.
   */
  async navigate(url: string, timeoutMs = 30_000) {
    await this.send("Page.setLifecycleEventsEnabled", { enabled: true }).catch(
      () => undefined
    );

    let settled = false;
    let resolveLoad!: () => void;
    let rejectLoad!: (e: Error) => void;
    const loadP = new Promise<void>((res, rej) => {
      resolveLoad = res;
      rejectLoad = rej;
    });
    const finish = () => {
      if (settled) return;
      settled = true;
      resolveLoad();
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      rejectLoad(new Error(`navigate timeout after ${timeoutMs}ms: ${url}`));
    }, timeoutMs);

    const offLife = this.onSessionEvent("Page.lifecycleEvent", (params) => {
      const name = String(params.name ?? "");
      if (name === "load" || name === "DOMContentLoaded") finish();
    });
    const offLoad = this.onSessionEvent("Page.loadEventFired", () => finish());
    const offStop = this.onSessionEvent("Page.frameStoppedLoading", () =>
      finish()
    );

    try {
      const nav = await this.send<{ errorText?: string }>("Page.navigate", {
        url,
      });
      if (nav.errorText) {
        throw new Error(`navigate failed: ${nav.errorText} (${url})`);
      }
      await loadP;
    } finally {
      clearTimeout(timer);
      offLife();
      offLoad();
      offStop();
    }

    await this.waitUntil(
      `!!document.body && document.readyState !== 'loading'`,
      {
        timeoutMs: Math.min(10_000, timeoutMs),
        label: `document ready after ${url}`,
      }
    );
  }

  async acceptCookies(appearTimeoutMs = 2_500) {
    const btnPresent = `[...document.querySelectorAll('button')].some(b => /accept all/i.test(b.innerText || ''))`;
    const clickExpr = `(() => {
      const btn = [...document.querySelectorAll('button')].find(b =>
        /accept all/i.test(b.innerText || ''));
      if (btn) { btn.click(); return true; }
      return false;
    })()`;

    let clicked = await this.evaluate<boolean>(clickExpr);
    if (!clicked) {
      try {
        await this.waitUntil(btnPresent, {
          timeoutMs: appearTimeoutMs,
          label: "cookie Accept All",
        });
        clicked = await this.evaluate<boolean>(clickExpr);
      } catch {
        return; // no banner
      }
    }
    if (!clicked) return;

    await this.waitUntil(`!(${btnPresent})`, {
      timeoutMs: 5_000,
      label: "cookie banner gone",
    }).catch(() => undefined);
  }

  private async hasCfClearance(): Promise<boolean> {
    const r = await this.send<{ cookies: StoredCookie[] }>(
      "Network.getAllCookies"
    );
    return (r.cookies ?? []).some((c) => /^cf_clearance$/i.test(c.name));
  }

  private async clickAt(x: number, y: number) {
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"] as const) {
      await this.send("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        clickCount: type === "mouseReleased" ? 1 : 0,
      });
    }
  }

  /** Click Cloudflare Turnstile checkbox area (iframe is cross-origin). */
  private async clickTurnstile(): Promise<boolean> {
    try {
      await this.browser.send("Target.activateTarget", {
        targetId: this.targetId,
      });
    } catch {
      /* ignore */
    }
    await this.send("Page.bringToFront").catch(() => undefined);

    const pt = await this.evaluate<{
      x: number;
      y: number;
      kind: string;
    } | null>(`(() => {
      const iframe = [...document.querySelectorAll('iframe')].find(f => {
        const s = (f.src || '') + (f.title || '');
        return /challenges\\.cloudflare|turnstile|cf-chl/i.test(s);
      });
      if (iframe) {
        const b = iframe.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) return null;
        return { x: b.x + 28, y: b.y + b.height / 2, kind: 'iframe' };
      }
      const host = document.querySelector('#cf-turnstile, .cf-turnstile, [data-sitekey]');
      if (host) {
        const b = host.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) return null;
        return { x: b.x + 28, y: b.y + b.height / 2, kind: 'host' };
      }
      return null;
    })()`);
    if (pt) {
      await this.clickAt(pt.x, pt.y);
      return true;
    }
    await this.clickAt(640, 450);
    for (const key of ["Tab", "Tab", "Space"] as const) {
      await this.send("Input.dispatchKeyEvent", {
        type: key === "Space" ? "keyDown" : "rawKeyDown",
        key,
        code: key === "Space" ? "Space" : "Tab",
        windowsVirtualKeyCode: key === "Space" ? 32 : 9,
        nativeVirtualKeyCode: key === "Space" ? 32 : 9,
      }).catch(() => undefined);
      if (key === "Space") {
        await this.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Space",
          code: "Space",
          windowsVirtualKeyCode: 32,
          nativeVirtualKeyCode: 32,
        }).catch(() => undefined);
      }
    }
    return false;
  }

  /** Wait until CF challenge cleared; actions then wait on DOM/lifecycle, not sleeps. */
  async waitCfGone(maxSec = 45) {
    const deadline = Date.now() + maxSec * 1000;
    let reloaded = false;
    let navigatedClean = false;
    let turnstileClicks = 0;

    const remaining = () => Math.max(0, deadline - Date.now());
    const waitClearedOrChange = async (sliceMs: number) => {
      const ms = Math.min(sliceMs, remaining());
      if (ms <= 0) return;
      await this.waitUntil(CF_CLEARED_PRED, {
        timeoutMs: ms,
        label: "cf challenge clear",
      }).catch(() => undefined);
    };

    while (remaining() > 0) {
      const st = await this.evaluate<{
        challenge: boolean;
        cfUrl: boolean;
        title: string;
        href: string;
        normal: boolean;
      }>(CHALLENGE_EXPR);
      const hasCf = await this.hasCfClearance();
      const midChallenge = await this.hasCfChallengeCookie();

      if (st.normal || !st.challenge) return;

      if (midChallenge && hasCf && turnstileClicks >= 1 && !reloaded) {
        await this.clearCfCookies();
        await this.send("Page.reload", { ignoreCache: true });
        reloaded = true;
        await waitClearedOrChange(12_000);
        continue;
      }

      if (hasCf && st.cfUrl && !navigatedClean) {
        navigatedClean = true;
        await this.navigate("https://www.daft.ie/", Math.min(20_000, remaining()));
        continue;
      }

      if (hasCf && !reloaded && turnstileClicks >= 2) {
        reloaded = true;
        await this.send("Page.reload", { ignoreCache: false });
        await waitClearedOrChange(12_000);
        continue;
      }

      await this.clickTurnstile();
      turnstileClicks++;
      await waitClearedOrChange(8_000);
    }

    const last = await this.evaluate<{
      title: string;
      href: string;
      normal: boolean;
    }>(`({
      title: document.title,
      href: location.href,
      normal: /property website|sign in|accept all|find your way|buy.*sell|search homes|place ad|residential|commercial|daft mortgage/i.test(
        document.title + ' ' + (document.body?.innerText || '')
      ),
    })`);
    if (last.normal) return;
    throw new Error(
      `Cloudflare/security challenge timeout (${last.title} @ ${last.href}). ` +
        `Ensure host Chrome on DAFT_CHROME_CDP_URL is running with DISPLAY=:0.`
    );
  }

  async clearCfCookies(): Promise<void> {
    const r = await this.send<{ cookies: StoredCookie[] }>(
      "Network.getAllCookies"
    );
    for (const c of r.cookies ?? []) {
      if (!/daft\.ie/i.test(c.domain) && !/\.daft\.ie$/i.test(c.domain)) {
        continue;
      }
      if (/^cf_|^__cf/i.test(c.name)) {
        await this.send("Network.deleteCookies", {
          name: c.name,
          domain: c.domain,
        }).catch(() => undefined);
      }
    }
  }

  private async hasCfChallengeCookie(): Promise<boolean> {
    const r = await this.send<{ cookies: StoredCookie[] }>(
      "Network.getAllCookies"
    );
    return (r.cookies ?? []).some((c) => /^cf_chl_|^__cf_chl/i.test(c.name));
  }

  async getCookies(): Promise<StoredCookie[]> {
    const r = await this.send<{ cookies: StoredCookie[] }>(
      "Network.getAllCookies"
    );
    return (r.cookies ?? []).map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    }));
  }

  async setCookies(cookies: StoredCookie[]) {
    if (!cookies.length) return;
    await this.send("Network.setCookies", {
      cookies: cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path ?? "/",
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })),
    });
  }

  async close() {
    try {
      await this.browser.send("Target.closeTarget", {
        targetId: this.targetId,
      });
    } catch {
      /* ignore */
    }
  }
}
