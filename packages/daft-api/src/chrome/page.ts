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

  async waitCfGone(maxSec = 40) {
    for (let i = 0; i < maxSec; i++) {
      const st = await this.evaluate<{ challenge: boolean }>(`({
        challenge: /just a moment|checking the security/i.test(
          document.title + ' ' + (document.body?.innerText || '')
        ),
      })`);
      if (!st.challenge) return;
      await sleep(1000);
    }
    throw new Error("Cloudflare challenge timeout");
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
