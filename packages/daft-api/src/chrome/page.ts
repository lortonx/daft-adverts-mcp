/**
 * Page helpers over an attached CDP target session.
 */
import { setTimeout as sleep } from "node:timers/promises";
import type { CdpSession } from "./cdp";
import type { StoredCookie } from "./util";

export class PageHandle {
  networkLog: Array<{ url: string; status: number }> = [];

  constructor(
    private readonly browser: CdpSession,
    readonly sessionId: string,
    readonly targetId: string
  ) {
    // Network events arrive on the page session via flat sessionId routing —
    // our CdpSession only sees browser-level messages unless we use sessionId
    // on send. For response logging we poll via Runtime after submit instead.
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
    return this.browser.send<T>(method, params, this.sessionId);
  }

  async enable() {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
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

  async waitCfGone(maxSec = 90) {
    // Host Chrome often needs a real click on the Turnstile/checkbox area.
    const clickPoints: Array<[number, number]> = [
      [640, 400],
      [200, 400],
      [640, 500],
      [400, 450],
    ];
    await this.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `Object.defineProperty(navigator,'webdriver',{get:()=>undefined});`,
    }).catch(() => undefined);

    for (let i = 0; i < maxSec; i++) {
      const st = await this.evaluate<{
        challenge: boolean;
        title: string;
        href: string;
      }>(`({
        challenge: /just a moment|checking the security|security check/i.test(
          document.title + ' ' + (document.body?.innerText || '')
        ) || /__cf_chl|cf-challenge|challenges\.cloudflare/i.test(location.href + document.documentElement.innerHTML.slice(0, 2000)),
        title: document.title,
        href: location.href,
      })`);
      if (!st.challenge) return;
      if (i > 0 && i % 3 === 0) {
        const [x, y] = clickPoints[(i / 3) % clickPoints.length | 0]!;
        await this.send("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x,
          y,
          button: "left",
          clickCount: 1,
        });
        await this.send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x,
          y,
          button: "left",
          clickCount: 1,
        });
      }
      await sleep(1000);
    }
    const last = await this.evaluate<{ title: string; href: string }>(
      `({ title: document.title, href: location.href })`
    );
    throw new Error(
      `Cloudflare/security challenge timeout (${last.title} @ ${last.href}). ` +
        `Use host Chrome on a real display (DAFT_CHROME_CDP_URL) and pass the check once.`
    );
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
