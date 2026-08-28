#!/usr/bin/env bun
/** Diagnose CF state via CDP (attach + host profile tab). */
import { connectCdp } from "../src/chrome/cdp.ts";
import { PageHandle } from "../src/chrome/page.ts";
import { loadGlobalCfCookies, hasFreshGlobalCf } from "../src/chrome/cf-cookies.ts";
import { resolveChromePoolEnv } from "../src/chrome/util.ts";

const conf = resolveChromePoolEnv(process.env);
const base = (conf.cdpUrl ?? "http://127.0.0.1:9222").replace(/\/$/, "");
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
const attached = await browser.send<{ sessionId: string }>(
  "Target.attachToTarget",
  { targetId, flatten: true }
);
const page = new PageHandle(browser, attached.sessionId, targetId);
await page.enable();

const globalCf = loadGlobalCfCookies(conf.cookieDir);
if (globalCf.length) await page.setCookies(globalCf);

console.log(
  JSON.stringify({
    cdpUrl: conf.cdpUrl,
    cookieDir: conf.cookieDir,
    hasFreshGlobal: hasFreshGlobalCf(conf.cookieDir),
    globalCfNames: globalCf.map((c) => c.name),
  })
);

await page.navigate("https://www.daft.ie/", 3000);
for (let i = 0; i < 15; i++) {
  const st = await page.evaluate(`({
    title: document.title,
    href: location.href,
    snippet: (document.body?.innerText || '').slice(0, 120),
  })`);
  const cookies = await page.getCookies();
  const cf = cookies.filter((c) => /cf_|__cf/i.test(c.name)).map((c) => c.name);
  console.log(JSON.stringify({ sec: i, st, cfCookies: cf }));
  if (!/just a moment|security check/i.test(String(st.title) + st.snippet)) break;
  await Bun.sleep(2000);
}

browser.close();
