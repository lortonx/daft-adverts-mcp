/** Debug ChromePool cookie seeding + CF on prod. */
import { ChromePool } from "../src/chrome/pool.ts";
import { loadGlobalCfCookies } from "../src/chrome/cf-cookies.ts";
import { setTimeout as sleep } from "node:timers/promises";

process.env.DAFT_CHROME_CDP_URL = "http://10.0.1.1:9222";
process.env.DAFT_CHROME_DATA_DIR = "/data/daft-chrome";

const pool = new ChromePool();
const global = loadGlobalCfCookies("/data/daft-chrome/cookies");
console.log(JSON.stringify({ globalCount: global.length, global: global.map(c => ({ name: c.name, domain: c.domain })) }));

const { page, dispose } = await pool.openPage("debug@example.com");
const afterSet = await page.getCookies();
const cf = afterSet.filter(c => /cf_clearance|__cf_bm/i.test(c.name));
console.log(JSON.stringify({ afterSetCf: cf.map(c => ({ name: c.name, domain: c.domain })) }));

await page.navigate("https://www.daft.ie/", 2000);
for (let i = 0; i < 15; i++) {
  await sleep(1000);
  const st = await page.evaluate(`({
    title: document.title,
    head: (document.body?.innerText||'').slice(0,80),
    href: location.href,
  })`);
  const ck = await page.getCookies();
  console.log(JSON.stringify({ t: i, st, hasCf: ck.some(c => c.name === 'cf_clearance') }));
  if (!/just a moment|checking the security/i.test(st.title + ' ' + st.head)) break;
}
await dispose();
await pool.shutdown();
