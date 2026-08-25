import { ChromePool } from "../src/chrome/pool.ts";
import type { PageHandle } from "../src/chrome/page.ts";

process.env.DAFT_CHROME_CDP_URL = "http://10.0.1.1:9222";
process.env.DAFT_CHROME_DATA_DIR = "/data/daft-chrome";

const pool = new ChromePool();
const { page, dispose } = await pool.openPage("debug@example.com");

async function snap(label: string) {
  const st = await page.evaluate(`({
    title: document.title,
    head: (document.body?.innerText||'').slice(0,80),
    href: location.href,
  })`);
  console.log(JSON.stringify({ label, st }));
}

try {
  await page.navigate("https://www.daft.ie/", 3500);
  await snap("after_navigate_before_waitCf");
  await page.waitCfGone(15);
  await snap("after_waitCf");
} catch (e) {
  console.log(JSON.stringify({ err: String(e) }));
} finally {
  await dispose();
  await pool.shutdown();
}
