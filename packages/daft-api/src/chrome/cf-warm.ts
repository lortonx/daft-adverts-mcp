/**
 * Actively obtain/refresh Cloudflare clearance via host Chrome CDP.
 */
import type { CdpSession } from "./cdp";
import { PageHandle } from "./page";
import {
  extractCfCookies,
  hasFreshGlobalCf,
  saveGlobalCfCookies,
} from "./cf-cookies";
import type { ChromePoolEnv } from "./util";

export async function warmCfClearance(
  browser: CdpSession,
  conf: ChromePoolEnv,
  opts: { force?: boolean; maxSec?: number } = {}
): Promise<boolean> {
  if (!opts.force && hasFreshGlobalCf(conf.cookieDir)) {
    return true;
  }

  let targetId: string | undefined;
  try {
    ({ targetId } = await browser.send<{ targetId: string }>(
      "Target.createTarget",
      { url: "about:blank" }
    ));
    const attached = await browser.send<{ sessionId: string }>(
      "Target.attachToTarget",
      { targetId, flatten: true }
    );
    const page = new PageHandle(browser, attached.sessionId, targetId);
    await page.enable();
    await page.navigate("https://www.daft.ie/", 3000);
    await page.waitCfGone(opts.maxSec ?? 120);
    const cookies = extractCfCookies(await page.getCookies());
    if (cookies.length) {
      saveGlobalCfCookies(conf.cookieDir, cookies);
      console.error(`[chrome-pool] CF warm ok (${cookies.length} cookie(s))`);
      return true;
    }
    console.error("[chrome-pool] CF warm finished without cf_clearance");
    return false;
  } catch (err) {
    console.error(
      `[chrome-pool] CF warm failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  } finally {
    if (targetId) {
      try {
        await browser.send("Target.closeTarget", { targetId });
      } catch {
        /* ignore */
      }
    }
  }
}
