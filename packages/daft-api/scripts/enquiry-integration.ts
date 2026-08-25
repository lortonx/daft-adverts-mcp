/** Integration: sendEnquiryViaChrome against host CDP on prod. */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getChromePool, sendEnquiryViaChrome } from "../src/chrome/index.ts";

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

process.env.DAFT_CHROME_CDP_URL ??= "http://10.0.1.1:9222";
process.env.DAFT_CHROME_DATA_DIR ??= "/data/daft-chrome";
process.env.DAFT_ENQUIRY_MODE = "chrome";

const email = process.env.DAFT_USERNAME?.trim();
const password = process.env.DAFT_PASSWORD?.trim();
if (!email || !password) {
  console.error("Set DAFT_USERNAME and DAFT_PASSWORD");
  process.exit(1);
}

const pool = getChromePool();
const listingUrl =
  process.env.SMOKE_AD_URL?.trim() ||
  "https://www.daft.ie/for-sale/3-stonepark-abbey-rathfarnham-dublin-14/6606296";

console.log(JSON.stringify({ phase: "start", listingUrl, cdp: process.env.DAFT_CHROME_CDP_URL }));

try {
  const result = await sendEnquiryViaChrome(pool, {
    email,
    password,
    listingUrl,
    message:
      process.env.SMOKE_MESSAGE?.trim() ||
      "Hi, is this still available? (integration CF test — please ignore)",
  });
  console.log(JSON.stringify({ result }, null, 2));
  process.exitCode = result.ok ? 0 : 1;
} catch (e) {
  console.error(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  process.exitCode = 1;
} finally {
  await pool.shutdown();
}
