/**
 * Page helpers over an attached CDP target session.
 */
import { setTimeout as sleep } from "node:timers/promises";
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

  async enable() {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
    await this.send("Page.addScriptToEvaluateOnNewDocument", {
      source: STEALTH_SCRIPT,
    }).catch(() => undefined);
  }

  async navigate(url: string, waitMs = 4000) {
    await this.send("Page.navigate", { url });
    await sleep(waitMs);
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
      throw new Error(JSON.stringify(r.exceptionDetails));
    }
    return r.result?.value as T;
  }

  async acceptCookies() {
    await this.evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b =>
        /accept all/i.test(b.innerText || ''));
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(600);
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

  /**
   * Wait until Cloudflare challenge clears. Seeds cf_clearance from the pool
   * should make this fast; otherwise clicks Turnstile and reloads once.
   */
  async waitCfGone(maxSec = 90) {
    let reloaded = false;
    let navigatedClean = false;

    for (let i = 0; i < maxSec; i++) {
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

      // Stale injected clearance + mid-challenge cookie = infinite loop; wipe and retry.
      if (midChallenge && hasCf && i >= 3 && i % 5 === 3) {
        await this.clearCfCookies();
        await this.send("Page.reload", { ignoreCache: true });
        await sleep(3500);
        continue;
      }

      // Host profile often already has clearance — give the page a beat to settle.
      if (hasCf && !midChallenge && i < 4) {
        await sleep(1500);
        continue;
      }

      if (hasCf && st.cfUrl && !navigatedClean) {
        navigatedClean = true;
        await this.send("Page.navigate", { url: "https://www.daft.ie/" });
        await sleep(4000);
        continue;
      }

      if (hasCf && !reloaded && i >= 2) {
        reloaded = true;
        await this.send("Page.reload", { ignoreCache: false });
        await sleep(3500);
        continue;
      }

      if (i > 0 && i % 2 === 0) {
        await this.clickTurnstile();
      }

      await sleep(1000);
    }

    const last = await this.evaluate<{ title: string; href: string; normal: boolean }>(
      `({
        title: document.title,
        href: location.href,
        normal: /property website|sign in|accept all|find your way|buy.*sell|search homes|place ad|residential|commercial|daft mortgage/i.test(
          document.title + ' ' + (document.body?.innerText || '')
        ),
      })`
    );
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
      if (
        !/daft\.ie/i.test(c.domain) &&
        !/\.daft\.ie$/i.test(c.domain)
      ) {
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
