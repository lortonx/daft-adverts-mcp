import { ChromePool } from "../src/chrome/pool.ts";
import { ensureWebLogin } from "../src/chrome/enquiry.ts";

process.env.DAFT_CHROME_CDP_URL = "http://10.0.1.1:9222";
process.env.DAFT_CHROME_DATA_DIR = "/data/daft-chrome";

const pool = new ChromePool();
const email = process.env.DAFT_USERNAME ?? "literal:";
const password = process.env.DAFT_PASSWORD ?? "literal:";
const listing =
  "https://www.daft.ie/for-sale/3-stonepark-abbey-rathfarnham-dublin-14/6606296";

const { page, dispose } = await pool.openPage(email, password);
try {
  console.log(JSON.stringify({ phase: "ensureWebLogin" }));
  await ensureWebLogin(page, email, password, listing);
  console.log(
    JSON.stringify({
      ok: true,
      title: await page.evaluate("document.title"),
    })
  );
} catch (e) {
  console.log(JSON.stringify({ ok: false, err: String(e) }));
} finally {
  await dispose();
  await pool.shutdown();
}
