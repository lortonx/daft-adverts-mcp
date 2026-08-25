#!/usr/bin/env bun
/**
 * Refresh Cloudflare clearance (run on host loop or manually).
 *   CDP=http://10.0.1.1:9222 DAFT_CHROME_DATA_DIR=/data/daft-chrome bun scripts/cf-warm-cli.ts
 */
import { connectCdp } from "../src/chrome/cdp.ts";
import { warmCfClearance } from "../src/chrome/cf-warm.ts";
import { hasFreshGlobalCf } from "../src/chrome/cf-cookies.ts";
import { resolveChromePoolEnv } from "../src/chrome/util.ts";

const conf = resolveChromePoolEnv(process.env);
const base = (conf.cdpUrl ?? "http://127.0.0.1:9222").replace(/\/$/, "");
const ver = await (await fetch(`${base}/json/version`)).json();
let ws = (ver as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
const u = new URL(base);
ws = ws.replace("127.0.0.1", u.hostname).replace("localhost", u.hostname);
if (u.port) ws = ws.replace(/:\d+\//, `:${u.port}/`);

const browser = await connectCdp(ws);
const before = hasFreshGlobalCf(conf.cookieDir);
const ok = await warmCfClearance(browser, conf, {
  force: !before,
  maxSec: Number(process.env.CF_WARM_MAX_SEC ?? 120),
});
browser.close();
console.log(JSON.stringify({ ok, before, after: hasFreshGlobalCf(conf.cookieDir) }));
process.exitCode = ok ? 0 : 1;
