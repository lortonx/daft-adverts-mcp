import { describe, expect, it, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Mutex,
  cookieStorePath,
  enquiryMode,
  normalizeEmail,
  resolveChromePoolEnv,
} from "../src/chrome/util";
import { ChromePool, resetChromePoolForTests } from "../src/chrome/pool";
import {
  deleteCookieFile,
  pruneStaleCookieFiles,
  wipeChromeProfile,
} from "../src/chrome/cleanup";
import {
  extractCfCookies,
  isCfChallengeCookie,
  mergeCfCookies,
  saveGlobalCfCookies,
  loadGlobalCfCookies,
  stripCfCookies,
  isCfClearanceFresh,
  cfClearanceExpiresAt,
} from "../src/chrome/cf-cookies";
import { writeFileSync, mkdirSync, existsSync, utimesSync } from "node:fs";

describe("chrome util", () => {
  it("normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("cookieStorePath is stable per email", () => {
    const a = cookieStorePath("/tmp/c", "a@b.com");
    const b = cookieStorePath("/tmp/c", "A@B.COM");
    expect(a).toBe(b);
    expect(a.endsWith(".json")).toBe(true);
  });

  it("enquiryMode is always chrome", () => {
    expect(enquiryMode({ DAFT_ENQUIRY_MODE: "chrome" })).toBe("chrome");
    expect(enquiryMode({ DAFT_ENQUIRY_MODE: "TCP" })).toBe("chrome");
    expect(enquiryMode({})).toBe("chrome");
  });

  it("resolveChromePoolEnv defaults idle and xvfb on linux without DISPLAY", () => {
    const e = resolveChromePoolEnv({
      DAFT_CHROME_DATA_DIR: "/tmp/daft-chrome-test",
      DAFT_CHROME_IDLE_MS: "12000",
      DAFT_CHROME_XVFB: "1",
    });
    expect(e.idleMs).toBe(12000);
    expect(e.xvfb).toBe(true);
    expect(e.cookieDir).toContain("cookies");
  });

  it("cdpUrl disables default xvfb but keeps url for attach-with-spawn-fallback", () => {
    const e = resolveChromePoolEnv({
      DAFT_CHROME_DATA_DIR: "/tmp/daft-chrome-test",
      DAFT_CHROME_CDP_URL: "http://10.0.1.1:9222",
      DAFT_CHROME_XVFB: "1",
    });
    expect(e.cdpUrl).toBe("http://10.0.1.1:9222");
    expect(e.xvfb).toBe(false);
    expect(e.wipeProfileOnStop).toBe(false);
  });
});

describe("Mutex", () => {
  it("serializes concurrent runners", async () => {
    const m = new Mutex();
    const order: number[] = [];
    await Promise.all([
      m.run(async () => {
        order.push(1);
        await Bun.sleep(30);
        order.push(2);
      }),
      m.run(async () => {
        order.push(3);
        order.push(4);
      }),
    ]);
    expect(order).toEqual([1, 2, 3, 4]);
  });
});

describe("ChromePool bookkeeping", () => {
  afterEach(async () => {
    await resetChromePoolForTests();
  });

  it("rememberPassword is in-memory per email", () => {
    const dir = mkdtempSync(join(tmpdir(), "daft-chrome-"));
    try {
      const pool = new ChromePool({
        cookieDir: join(dir, "cookies"),
        userDataDir: join(dir, "profile"),
        idleMs: 0,
        xvfb: false,
        debuggingPort: 19999,
        wipeProfileOnStop: false,
      });
      pool.rememberPassword("A@B.com", "secret");
      const d = pool.diagnostics;
      expect(d.users).toHaveLength(1);
      expect(d.users[0]?.email).toBe("a@b.com");
      expect(d.users[0]?.hasPassword).toBe(true);
      expect(d.running).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("clearUser deletes cookie file", () => {
    const dir = mkdtempSync(join(tmpdir(), "daft-chrome-"));
    try {
      const cookieDir = join(dir, "cookies");
      mkdirSync(cookieDir, { recursive: true });
      const pool = new ChromePool({
        cookieDir,
        userDataDir: join(dir, "profile"),
        idleMs: 0,
        xvfb: false,
        debuggingPort: 19998,
        wipeProfileOnStop: false,
        cookieMaxAgeMs: 0,
      });
      const p = cookieStorePath(cookieDir, "u@x.com");
      writeFileSync(p, "[]");
      expect(existsSync(p)).toBe(true);
      pool.clearUser("u@x.com");
      expect(existsSync(p)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("chrome cleanup", () => {
  it("wipeChromeProfile removes contents and recreates dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "daft-prof-"));
    const junk = join(dir, "Default", "Cache");
    mkdirSync(junk, { recursive: true });
    writeFileSync(join(junk, "x"), "big");
    wipeChromeProfile(dir);
    expect(existsSync(join(junk, "x"))).toBe(false);
    expect(existsSync(dir)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("pruneStaleCookieFiles drops old json only", () => {
    const dir = mkdtempSync(join(tmpdir(), "daft-ck-"));
    const oldP = join(dir, "old.json");
    const newP = join(dir, "new.json");
    writeFileSync(oldP, "[]");
    writeFileSync(newP, "[]");
    const oldTime = new Date(Date.now() - 10_000);
    utimesSync(oldP, oldTime, oldTime);
    expect(pruneStaleCookieFiles(dir, 5_000)).toBe(1);
    expect(existsSync(oldP)).toBe(false);
    expect(existsSync(newP)).toBe(true);
    expect(deleteCookieFile(dir, "nobody@x.com")).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("cf cookies", () => {
  it("mergeCfCookies overlays global cf onto user jar", () => {
    const user = [
      {
        name: "session",
        value: "x",
        domain: ".daft.ie",
      },
    ];
    const global = [
      {
        name: "cf_clearance",
        value: "abc",
        domain: ".daft.ie",
      },
    ];
    const merged = mergeCfCookies(user, global);
    expect(merged).toHaveLength(2);
    expect(merged.some((c) => c.name === "cf_clearance")).toBe(true);
  });

  it("save/load global cf roundtrip", () => {
    const dir = mkdtempSync(join(tmpdir(), "daft-cf-"));
    saveGlobalCfCookies(dir, [
      { name: "cf_clearance", value: "tok", domain: ".daft.ie" },
      { name: "session", value: "ignore", domain: ".daft.ie" },
    ]);
    const loaded = loadGlobalCfCookies(dir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.name).toBe("cf_clearance");
    expect(extractCfCookies(loaded)).toHaveLength(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("stripCfCookies removes challenge state cookies", () => {
    const cleaned = stripCfCookies([
      { name: "session", value: "x", domain: ".daft.ie" },
      { name: "cf_clearance", value: "y", domain: ".daft.ie" },
      { name: "cf_chl_rc_ni", value: "2", domain: "www.daft.ie" },
    ]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]?.name).toBe("session");
    expect(isCfChallengeCookie({ name: "cf_chl_rc_ni", value: "1", domain: ".daft.ie" })).toBe(true);
  });

  it("isCfClearanceFresh respects embedded expiry", () => {
    const future = Math.floor(Date.now() / 1000) + 7200;
    const cookie = {
      name: "cf_clearance",
      value: `x-${future}-1.2.1.1-y`,
      domain: ".daft.ie",
    };
    expect(isCfClearanceFresh(cookie, 3600)).toBe(true);
    expect(cfClearanceExpiresAt(cookie.value)).toBe(future);
    const past = Math.floor(Date.now() / 1000) + 60;
    expect(isCfClearanceFresh({ ...cookie, value: `x-${past}-1.2.1.1-y` }, 3600)).toBe(false);
  });
});
