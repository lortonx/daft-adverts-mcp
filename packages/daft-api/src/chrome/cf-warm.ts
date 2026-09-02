import type { CdpSession } from "./cdp";
import { PageHandle } from "./page";
import {
  extractCfCookies,
  hasFreshGlobalCf,
  isCfChallengeCookie,
  saveGlobalCfCookies,
  stripCfCookies,
} from "./cf-cookies";
import type { ChromePoolEnv } from "./util";

type CdpTarget = {
  id: string;
  type: string;
  url: string;
  title: string;
};

/** Prefer the host's visible window tab (attach mode) over a fresh CDP tab. */
async function pickHostPageTarget(
  cdpHttpUrl: string
): Promise<string | undefined> {
  const base = cdpHttpUrl.replace(/\/$/, "");
  try {
    const list = (await fetch(`${base}/json/list`).then((r) =>
      r.json()
    )) as CdpTarget[];
    const pages = list.filter(
      (t) =>
        t.type === "page" &&
        !t.url.startsWith("chrome-extension:") &&
        !t.url.startsWith("chrome://")
    );
    const preferred =
      pages.find((t) => /daft\.ie/i.test(t.url)) ??
      pages.find((t) => t.url === "about:blank" || t.url === "") ??
      pages[0];
    return preferred?.id;
  } catch {
    return undefined;
  }
}

async function attachPage(
  browser: CdpSession,
  targetId: string
): Promise<PageHandle> {
  const attached = await browser.send<{ sessionId: string }>(
    "Target.attachToTarget",
    { targetId, flatten: true }
  );
  const page = new PageHandle(browser, attached.sessionId, targetId);
  await page.enable();
  return page;
}

export async function warmCfClearance(
  browser: CdpSession,
  conf: ChromePoolEnv,
  opts: { force?: boolean; maxSec?: number } = {}
): Promise<boolean> {
  if (!opts.force && hasFreshGlobalCf(conf.cookieDir)) {
    return true;
  }

  let targetId: string | undefined;
  let attachedExisting = false;
  try {
    if (conf.cdpUrl) {
      targetId = await pickHostPageTarget(conf.cdpUrl);
      attachedExisting = Boolean(targetId);
      if (targetId) {
        try {
          await browser.send("Target.activateTarget", { targetId });
        } catch {
          /* ignore */
        }
      }
    }
    if (!targetId) {
      ({ targetId } = await browser.send<{ targetId: string }>(
        "Target.createTarget",
        { url: "about:blank" }
      ));
    }

    const page = await attachPage(browser, targetId);
    // Attach mode: keep host clearance. Wiping it forces a fresh challenge
    // that CDP usually cannot pass. Spawned Chrome still needs a clean jar.
    if (!conf.cdpUrl) {
      await page.clearCfCookies();
    }
    await page.navigate("https://www.daft.ie/", 3000);
    await page.waitCfGone(opts.maxSec ?? 120);
    const raw = await page.getCookies();
    const cookies = extractCfCookies(raw).filter(
      (c) => !isCfChallengeCookie(c)
    );
    if (cookies.some((c) => /^cf_clearance$/i.test(c.name))) {
      saveGlobalCfCookies(conf.cookieDir, cookies);
      console.error(`[chrome-pool] CF warm ok (${cookies.length} cookie(s))`);
      return true;
    }
    console.error(
      `[chrome-pool] CF warm finished without cf_clearance (had ${stripCfCookies(raw).length} other cookies)`
    );
    return false;
  } catch (err) {
    console.error(
      `[chrome-pool] CF warm failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  } finally {
    if (targetId && !attachedExisting) {
      try {
        await browser.send("Target.closeTarget", { targetId });
      } catch {
        /* ignore */
      }
    }
  }
}
