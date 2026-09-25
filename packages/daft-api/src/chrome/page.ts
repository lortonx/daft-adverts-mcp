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
  const href = location.href || '';
  const body = (document.body?.textContent || '').slice(0, 800);
  const blob = title + ' ' + body;
  const cfUrl = /__cf_chl|cf_chl_rt|challenges\\.cloudflare/i.test(href);
  const cfText = /just a moment|checking your browser|checking the security of your connection/i.test(blob);
  const normal = /property website|sign in|find your way|buy.*sell|search homes|place ad|residential|commercial|daft mortgage|MESSAGE|EMAIL|share this/i.test(blob)
    || /\\/share\\/|\\/for-rent\\/|\\/for-sale\\//i.test(href);
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
  const href = location.href || '';
  const body = (document.body?.textContent || '').slice(0, 800);
  const blob = title + ' ' + body;
  const cfUrl = /__cf_chl|cf_chl_rt|challenges\\.cloudflare/i.test(href);
  const cfText = /just a moment|checking your browser|checking the security of your connection/i.test(blob);
  const normal = /property website|sign in|find your way|buy.*sell|search homes|place ad|residential|commercial|daft mortgage|MESSAGE|EMAIL|share this/i.test(blob)
    || /\\/share\\/|\\/for-rent\\/|\\/for-sale\\//i.test(href);
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
   * Deadline and poll tick run on the Node side — Chrome throttles timers/rAF in background tabs.
   * `predicateJs` must be a JS expression returning boolean.
   */
  async waitUntil(
    predicateJs: string,
    opts: { timeoutMs?: number; label?: string; pollMs?: number } = {}
  ): Promise<void> {
    const timeoutMs = Math.max(1, opts.timeoutMs ?? 15_000);
    const pollMs = Math.max(10, opts.pollMs ?? 50);
    const label = opts.label ?? "condition";
    const deadline = Date.now() + timeoutMs;
    const expr = `(() => { try { return !!(${predicateJs}); } catch (_) { return false; } })()`;

    while (Date.now() < deadline) {
      try {
        if (await this.evaluate<boolean>(expr)) return;
      } catch {
        // Execution context destroyed mid-navigation — keep polling.
      }
      const left = deadline - Date.now();
      if (left <= 0) break;
      await new Promise<void>((r) =>
        setTimeout(r, Math.min(pollMs, left))
      );
    }
    throw new Error(`${label} timeout after ${timeoutMs}ms`);
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
   * Navigate and wait for the new top-level document + networkAlmostIdle.
   * Never leave an in-page Promise spanning the navigation — CDP destroys that context.
   */
  async navigate(url: string, timeoutMs = 30_000) {
    await this.send("Page.setLifecycleEventsEnabled", { enabled: true }).catch(
      () => undefined
    );

    let settled = false;
    let resolveNav!: () => void;
    let rejectNav!: (e: Error) => void;
    const navP = new Promise<void>((res, rej) => {
      resolveNav = res;
      rejectNav = rej;
    });

    const offs: Array<() => void> = [];
    const cleanup = () => {
      clearTimeout(timer);
      for (const off of offs) off();
      offs.length = 0;
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectNav(new Error(`navigate timeout after ${timeoutMs}ms: ${url}`));
    }, timeoutMs);

    const hit = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveNav();
    };

    offs.push(
      this.onSessionEvent("Page.frameNavigated", (params) => {
        const frame = params.frame as
          | { url?: string; parentId?: string }
          | undefined;
        if (frame?.parentId) return; // iframe
        hit();
      })
    );
    offs.push(this.onSessionEvent("Page.loadEventFired", () => hit()));
    offs.push(this.onSessionEvent("Page.domContentEventFired", () => hit()));

    try {
      const nav = await this.send<{ errorText?: string }>("Page.navigate", {
        url,
      });
      if (nav.errorText) {
        throw new Error(`navigate failed: ${nav.errorText} (${url})`);
      }
      await navP;
    } catch (err) {
      if (!settled) {
        settled = true;
        cleanup();
      }
      throw err;
    }
    // Document swapped — callers wait for their own selectors (MESSAGE, login fields…).
    // Do not evaluate here: a busy main thread would block for seconds.
  }

  /** Wait until a network response URL matches (CDP Network domain — no page JS). */
  async waitForResponse(
    urlRe: RegExp,
    timeoutMs = 15_000
  ): Promise<void> {
    let settled = false;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        off();
        reject(
          new Error(
            `response ${urlRe} timeout after ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
      const off = this.onSessionEvent(
        "Network.responseReceived",
        (params) => {
          const url = String(
            (params.response as { url?: string } | undefined)?.url ??
              params.url ??
              ""
          );
          if (!urlRe.test(url)) return;
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          off();
          resolve();
        }
      );
    });
  }

  /** Wait for one of the given Page.lifecycleEvent names (Node-side deadline). */
  async waitForLifecycle(
    names: string[],
    timeoutMs = 12_000
  ): Promise<void> {
    const want = new Set(names);
    let settled = false;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        off();
        reject(
          new Error(`lifecycle ${names.join("|")} timeout after ${timeoutMs}ms`)
        );
      }, timeoutMs);
      const off = this.onSessionEvent("Page.lifecycleEvent", (params) => {
        const name = String(params.name ?? "");
        if (!want.has(name)) return;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        off();
        resolve();
      });
    });
  }

  /**
   * Wait until CDP DOM.performSearch finds a BUTTON/A matching size heuristics.
   * Returns node box center. No Runtime.evaluate.
   */
  async waitForTextButton(
    search: string,
    opts: { timeoutMs?: number } = {}
  ): Promise<{ nodeId: number; x: number; y: number; w: number; h: number }> {
    const timeoutMs = opts.timeoutMs ?? 15_000;
    const deadline = Date.now() + timeoutMs;
    await this.send("DOM.enable").catch(() => undefined);

    while (Date.now() < deadline) {
      const hit = await this.findTextButton(search);
      if (hit) return hit;
      await new Promise<void>((r) => setTimeout(r, 200));
    }
    throw new Error(`waitForTextButton ${search} timeout after ${timeoutMs}ms`);
  }

  private async findTextButton(
    search: string
  ): Promise<{ nodeId: number; x: number; y: number; w: number; h: number } | null> {
    try {
      await this.send("DOM.getDocument", { depth: 0, pierce: true });
      const { searchId, resultCount } = await this.send<{
        searchId: string;
        resultCount: number;
      }>("DOM.performSearch", {
        query: search,
        includeUserAgentShadowDOM: true,
      });
      try {
        if (resultCount <= 0) return null;
        const { nodeIds } = await this.send<{ nodeIds: number[] }>(
          "DOM.getSearchResults",
          {
            searchId,
            fromIndex: 0,
            toIndex: Math.min(resultCount, 40),
          }
        );
        for (const nodeId of nodeIds ?? []) {
          const described = await this.send<{
            node?: { nodeName?: string };
          }>("DOM.describeNode", { nodeId }).catch(() => null);
          const nodeName = (described?.node?.nodeName ?? "").toUpperCase();
          if (nodeName !== "BUTTON" && nodeName !== "A") continue;
          const box = await this.send<{
            model?: { content?: number[] };
          }>("DOM.getBoxModel", { nodeId }).catch(() => null);
          const content = box?.model?.content;
          if (!content || content.length < 8) continue;
          const xs = [content[0], content[2], content[4], content[6]];
          const ys = [content[1], content[3], content[5], content[7]];
          const w = Math.max(...xs) - Math.min(...xs);
          const h = Math.max(...ys) - Math.min(...ys);
          if (w < 40 || h < 16 || w > 220 || h > 64) continue;
          return {
            nodeId,
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2,
            w,
            h,
          };
        }
      } finally {
        await this.send("DOM.discardSearchResults", { searchId }).catch(
          () => undefined
        );
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Find MESSAGE/EMAIL via CDP DOM.performSearch and click with Input events.
   * Avoids Runtime.evaluate (blocked while React hydrates the listing).
   */
  async clickByText(
    pattern: RegExp,
    opts: { timeoutMs?: number; search?: string } = {}
  ): Promise<string> {
    const search = opts.search ?? "MESSAGE";
    const hit = await this.waitForTextButton(search, {
      timeoutMs: opts.timeoutMs ?? 15_000,
    });
    await this.send("DOM.scrollIntoViewIfNeeded", {
      nodeId: hit.nodeId,
    }).catch(() => undefined);
    await this.clickAt(hit.x, hit.y);
    return `${search}:${Math.round(hit.w)}x${Math.round(hit.h)}`;
  }

  /** Optional: click known consent SDK accept control (no full-button scan). */
  async acceptCookies(_appearTimeoutMs = 800) {
    await this.evaluate(`(() => {
      const sel = '#onetrust-accept-btn-handler, #CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll, .cc-dismiss, .cc-allow';
      const btn = document.querySelector(sel)
        || [...document.querySelectorAll('button')].find(b => /^\\s*accept all\\s*$/i.test((b.innerText||'').trim()));
      if (btn) btn.click();
      return !!btn;
    })()`).catch(() => undefined);
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

  /** Wait until CF challenge cleared. Prefer CDP (no page JS) — evaluate blocks on busy main thread. */
  async waitCfGone(maxSec = 45) {
    try {
      const tree = await this.send<{
        frameTree: { frame: { url: string; name?: string } };
      }>("Page.getFrameTree");
      const url = tree.frameTree?.frame?.url ?? "";
      const hasCf = await this.hasCfClearance();
      if (
        hasCf &&
        /daft\.ie/i.test(url) &&
        !/__cf_chl|challenges\.cloudflare/i.test(url)
      ) {
        return;
      }
      if (/just a moment/i.test(url)) {
        /* real challenge URL — fall through */
      } else if (/daft\.ie\/(share|for-rent|for-sale|)/i.test(url) && hasCf) {
        return;
      }
    } catch {
      /* fall through to DOM checks */
    }

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
