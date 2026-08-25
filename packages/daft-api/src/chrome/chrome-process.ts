/**
 * Spawn headed Chrome with remote debugging, or attach to an existing CDP endpoint.
 * Pure `--headless=new` / Docker+Xvfb often fail Cloudflare on www.daft.ie —
 * prefer attaching to a host Chrome on a real display (`DAFT_CHROME_CDP_URL`).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { connectCdp, waitForDebugger, type CdpSession } from "./cdp";
import type { ChromePoolEnv } from "./util";
import { XvfbProcess } from "./xvfb";

function rewriteWsHost(wsUrl: string, httpBase: string): string {
  try {
    const http = new URL(httpBase);
    const ws = new URL(wsUrl);
    ws.hostname = http.hostname;
    if (http.port) ws.port = http.port;
    return ws.toString();
  } catch {
    return wsUrl;
  }
}

export class ChromeProcess {
  private chrome: ChildProcess | null = null;
  private xvfb: XvfbProcess | null = null;
  private attached = false;
  browser: CdpSession | null = null;

  constructor(private readonly env: ChromePoolEnv) {}

  get running() {
    return Boolean(this.browser?.alive);
  }

  get isAttached() {
    return this.attached;
  }

  async start(): Promise<CdpSession> {
    if (this.running && this.browser) return this.browser;

    if (this.env.cdpUrl) {
      return this.attach(this.env.cdpUrl);
    }

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
      "--remote-allow-origins=*",
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
    this.attached = false;
    this.browser = await connectCdp(ver.webSocketDebuggerUrl);
    await this.browser.send("Target.setDiscoverTargets", { discover: true });
    return this.browser;
  }

  private async attach(cdpHttpUrl: string): Promise<CdpSession> {
    const base = cdpHttpUrl.replace(/\/$/, "");
    const ver = (await (
      await fetch(`${base}/json/version`)
    ).json()) as { webSocketDebuggerUrl: string; Browser?: string };
    if (!ver.webSocketDebuggerUrl) {
      throw new Error(`CDP attach failed: no webSocketDebuggerUrl at ${base}`);
    }
    const ws = rewriteWsHost(ver.webSocketDebuggerUrl, base);
    this.attached = true;
    this.browser = await connectCdp(ws);
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
    // Never kill an attached host Chrome — only disconnect CDP.
    if (this.attached) {
      this.attached = false;
      return;
    }
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
