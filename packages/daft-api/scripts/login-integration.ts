/** Integration: ensureWebLogin against host CDP. Requires DAFT_USERNAME/DAFT_PASSWORD in env or .env */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ChromePool } from "../src/chrome/pool.ts";
import { ensureWebLogin } from "../src/chrome/enquiry.ts";

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnv(resolve(import.meta.dir, "../../../../.env"));

process.env.DAFT_CHROME_CDP_URL ??= "http://10.0.1.1:9222";
process.env.DAFT_CHROME_DATA_DIR ??= "/data/daft-chrome";

const email = process.env.DAFT_USERNAME?.trim();
const password = process.env.DAFT_PASSWORD?.trim();
if (!email || !password) {
  console.error("Set DAFT_USERNAME and DAFT_PASSWORD (env or monorepo .env)");
  process.exit(1);
}

const listing =
  process.env.SMOKE_AD_URL?.trim() ||
  "https://www.daft.ie/for-sale/3-stonepark-abbey-rathfarnham-dublin-14/6606296";

const pool = new ChromePool();
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
  process.exitCode = 1;
} finally {
  await dispose();
  await pool.shutdown();
}
