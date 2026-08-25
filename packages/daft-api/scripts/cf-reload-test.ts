/** Quick CF reload test after cf_clearance appears. */
import { connectCdp } from "../src/chrome/cdp.ts";
import { setTimeout as sleep } from "node:timers/promises";

const base = (process.env.CDP ?? "http://10.0.1.1:9222").replace(/\/$/, "");
const ver = await (await fetch(`${base}/json/version`)).json();
let ws = (ver as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
const u = new URL(base);
ws = ws.replace("127.0.0.1", u.hostname).replace("localhost", u.hostname);
if (u.port) ws = ws.replace(/:\d+\//, `:${u.port}/`);
const browser = await connectCdp(ws);
const { targetId } = await browser.send<{ targetId: string }>(
  "Target.createTarget",
  { url: "about:blank" }
);
const { sessionId } = await browser.send<{ sessionId: string }>(
  "Target.attachToTarget",
  { targetId, flatten: true }
);
const send = (m: string, p: Record<string, unknown> = {}) =>
  browser.send(m, p, sessionId);
await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Page.navigate", { url: "https://www.daft.ie/" });

let reloaded = false;
for (let i = 0; i < 90; i++) {
  await sleep(1000);
  const ck = await send<{ cookies: Array<{ name: string }> }>(
    "Network.getAllCookies"
  );
  const hasCf = (ck.cookies ?? []).some((c) => c.name === "cf_clearance");
  const st = await send<{
    result?: { value?: { title: string; href: string; head: string } };
  }>("Runtime.evaluate", {
    expression: `({
      title: document.title,
      href: location.href,
      head: (document.body?.innerText || '').slice(0, 80),
    })`,
    returnByValue: true,
  });
  const v = st.result?.value;
  console.log(JSON.stringify({ t: i, hasCf, ...v }));
  if (hasCf && v && !/just a moment|checking the security/i.test(v.title)) {
    console.log(JSON.stringify({ ok: true, mode: "natural" }));
    break;
  }
  if (hasCf && !reloaded && i >= 5) {
    reloaded = true;
    console.log(JSON.stringify({ action: "reload_with_cookie" }));
    await send("Page.navigate", { url: "https://www.daft.ie/" });
  }
}
browser.close();
