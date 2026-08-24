/**
 * Spawn headed Chrome with remote debugging (Cloudflare-friendly).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { connectCdp, waitForDebugger, type CdpSession } from "./cdp";
import type { ChromePoolEnv } from "./util";
import { XvfbProcess } from "./xvfb";

export class ChromeProcess {
  private chrome: ChildProcess | null = null;
  private xvfb: XvfbProcess | null = null;
  browser: CdpSession | null = null;

  constructor(private readonly env: ChromePoolEnv) {}

  get running() {
    return Boolean(this.chrome && this.browser?.alive);
  }

  async start(): Promise<CdpSession> {
    if (this.running && this.browser) return this.browser;

    mkdirSync(this.env.userDataDir, { recursive: true });

    const procEnv = { ...process.env };
    if (this.env.xvfb) {
      this.xvfb = new XvfbProcess(this.env.display);
      await this.xvfb.start();
      procEnv.DISPLAY = this.xvfb.envDisplay;
    } else if (this.env.display) {
      procEnv.DISPLAY = this.env.display.startsWith(":")
        ? this.env.display
        : this.env.display;
    }

    const args = [
      `--remote-debugging-port=${this.env.debuggingPort}`,
      `--user-data-dir=${this.env.userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--window-size=${this.env.windowSize}`,
      "--disable-background-networking",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-gpu",
      // NOT headless — CF blocks headless=new on www.daft.ie
      "about:blank",
    ];

    this.chrome = spawn(this.env.chromePath, args, {
      env: procEnv,
      stdio: ["ignore", "ignore", "pipe"],
    });
    this.chrome.on("exit", () => {
      this.chrome = null;
      try {
        this.browser?.close();
      } catch {
        /* ignore */
      }
      this.browser = null;
    });

    const ver = await waitForDebugger(this.env.debuggingPort);
    this.browser = await connectCdp(ver.webSocketDebuggerUrl);
    await this.browser.send("Target.setDiscoverTargets", { discover: true });
    return this.browser;
  }

  async stop(): Promise<void> {
    try {
      this.browser?.close();
    } catch {
      /* ignore */
    }
    this.browser = null;
    if (this.chrome) {
      try {
        this.chrome.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      this.chrome = null;
    }
    this.xvfb?.stop();
    this.xvfb = null;
  }
}
