/**
 * CF probe with Turnstile click — run on kubuntu in dmcp container:
 *   CDP=http://10.0.1.1:9222 bun packages/daft-api/scripts/cf-diag.ts
 */
import { connectCdp } from "../src/chrome/cdp.ts";
import { setTimeout as sleep } from "node:timers/promises";

const base = (process.env.CDP ?? "http://127.0.0.1:9222").replace(/\/$/, "");
const ver = await (await fetch(`${base}/json/version`)).json();
let ws = (ver as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
const u = new URL(base);
ws = ws.replace("127.0.0.1", u.hostname).replace("localhost", u.hostname);
if (u.port) ws = ws.replace(/:\d+\//, `:${u.port}/`);
const browser = await connectCdp(ws);

const STEALTH = `(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  if (!window.chrome) window.chrome = { runtime: {} };
})();`;

async function clickAt(
  send: (m: string, p?: Record<string, unknown>) => Promise<unknown>,
  x: number,
  y: number
) {
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"] as const) {
    await send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "left",
      clickCount: type === "mouseReleased" ? 1 : 0,
    });
  }
}

async function findTurnstile(
  send: (m: string, p?: Record<string, unknown>) => Promise<unknown>
) {
  const r = await send("Runtime.evaluate", {
    expression: `(() => {
      const iframe = [...document.querySelectorAll('iframe')].find(f => {
        const s = (f.src || '') + (f.title || '');
        return /challenges\\.cloudflare|turnstile|cf-chl/i.test(s);
      });
      if (iframe) {
        const b = iframe.getBoundingClientRect();
        return { kind: 'iframe', x: b.x + 30, y: b.y + b.height / 2, w: b.width, h: b.height };
      }
      const host = document.querySelector('#cf-turnstile, .cf-turnstile, [data-sitekey]');
      if (host) {
        const b = host.getBoundingClientRect();
        return { kind: 'host', x: b.x + 30, y: b.y + b.height / 2, w: b.width, h: b.height };
      }
      return null;
    })()`,
    returnByValue: true,
  });
  return (r as { result?: { value?: { x: number; y: number; kind: string } | null } })
    .result?.value;
}

async function probe(label: string) {
  const { targetId } = await browser.send<{ targetId: string }>(
    "Target.createTarget",
    { url: "about:blank" }
  );
  const { sessionId } = await browser.send<{ sessionId: string }>(
    "Target.attachToTarget",
    { targetId, flatten: true }
  );
  const send = <T>(m: string, p: Record<string, unknown> = {}) =>
    browser.send<T>(m, p, sessionId);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: STEALTH });
  await send("Page.navigate", { url: "https://www.daft.ie/" });

  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const st = await send<{
      result?: { value?: { title: string; body: string; href: string } };
    }>("Runtime.evaluate", {
      expression: `({
        title: document.title,
        body: (document.body?.innerText || '').slice(0, 100),
        href: location.href,
        challenge: /just a moment|checking the security/i.test(document.title + ' ' + (document.body?.innerText||'')),
      })`,
      returnByValue: true,
    });
    const v = st.result?.value;
    const cookies = await send<{ cookies: Array<{ name: string }> }>(
      "Network.getAllCookies"
    );
    const cf = (cookies.cookies ?? [])
      .filter((c) => /^cf_clearance|__cf_bm$/i.test(c.name))
      .map((c) => c.name);

    if (i % 3 === 2 && v?.challenge) {
      const pt = await findTurnstile(send);
      if (pt) {
        console.log(JSON.stringify({ label, click: pt, t: i }));
        await clickAt(send, pt.x, pt.y);
      } else {
        await clickAt(send, 640, 450);
      }
    }

    console.log(JSON.stringify({ label, t: i, title: v?.title, cf, challenge: v?.challenge }));
    if (v && !v.challenge && cf.includes("cf_clearance")) {
      console.log(JSON.stringify({ label, ok: true }));
      await browser.send("Target.closeTarget", { targetId });
      return;
    }
  }
  console.log(JSON.stringify({ label, ok: false }));
  await browser.send("Target.closeTarget", { targetId });
}

await probe("with_turnstile_click");
browser.close();
