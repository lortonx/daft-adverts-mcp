/** Test seeding isolated BrowserContext with default-context cf_clearance. */
import { connectCdp } from "../src/chrome/cdp.ts";
import { setTimeout as sleep } from "node:timers/promises";

const base = (process.env.CDP ?? "http://10.0.1.1:9222").replace(/\/$/, "");
const ver = await (await fetch(`${base}/json/version`)).json();
let ws = (ver as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
const u = new URL(base);
ws = ws.replace("127.0.0.1", u.hostname).replace("localhost", u.hostname);
if (u.port) ws = ws.replace(/:\d+\//, `:${u.port}/`);
const browser = await connectCdp(ws);

// Grab CF cookies from default context via a throwaway tab
const { targetId: t0 } = await browser.send<{ targetId: string }>(
  "Target.createTarget",
  { url: "about:blank" }
);
const { sessionId: s0 } = await browser.send<{ sessionId: string }>(
  "Target.attachToTarget",
  { targetId: t0, flatten: true }
);
await browser.send("Network.enable", {}, s0);
const all = await browser.send<{ cookies: Array<Record<string, unknown>> }>(
  "Network.getAllCookies",
  {},
  s0
);
const cfOnly = (all.cookies ?? []).filter((c) =>
  /^cf_clearance$|^__cf_bm$/i.test(String(c.name))
);
await browser.send("Target.closeTarget", { targetId: t0 });

console.log(JSON.stringify({ seedCount: cfOnly.length, names: cfOnly.map((c) => c.name) }));

const { browserContextId } = await browser.send<{ browserContextId: string }>(
  "Target.createBrowserContext",
  {}
);
const { targetId } = await browser.send<{ targetId: string }>(
  "Target.createTarget",
  { url: "about:blank", browserContextId }
);
const { sessionId } = await browser.send<{ sessionId: string }>(
  "Target.attachToTarget",
  { targetId, flatten: true }
);
const send = (m: string, p: Record<string, unknown> = {}) =>
  browser.send(m, p, sessionId);
await send("Network.enable");
if (cfOnly.length) await send("Network.setCookies", { cookies: cfOnly });
await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: "https://www.daft.ie/" });

for (let i = 0; i < 20; i++) {
  await sleep(1000);
  const st = await send("Runtime.evaluate", {
    expression: `({
      title: document.title,
      href: location.href,
      head: (document.body?.innerText||'').slice(0,100),
      challenge: /just a moment|checking the security|security check/i.test(document.title+' '+(document.body?.innerText||'')),
    })`,
    returnByValue: true,
  });
  const v = (st as { result?: { value?: Record<string, unknown> } }).result?.value;
  console.log(JSON.stringify({ t: i, ...v }));
  if (v && !v.challenge && /daft\.ie/i.test(String(v.href))) {
    console.log(JSON.stringify({ ok: true }));
    break;
  }
}
browser.close();
