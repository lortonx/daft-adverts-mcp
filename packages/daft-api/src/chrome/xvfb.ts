/**
 * Optional Xvfb for headed Chrome in Docker (no real display).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

export class XvfbProcess {
  private child: ChildProcess | null = null;

  constructor(private readonly display: string) {}

  get envDisplay(): string {
    return this.display.startsWith(":")
      ? this.display
      : `:${this.display}`;
  }

  async start(): Promise<void> {
    if (this.child) return;
    const display = this.envDisplay;
    this.child = spawn(
      "Xvfb",
      [display, "-screen", "0", "1280x900x24", "-ac", "-nolisten", "tcp"],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    this.child.on("exit", () => {
      this.child = null;
    });
    // Give X time to bind
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      if (this.child?.exitCode != null) {
        throw new Error(`Xvfb exited early code=${this.child.exitCode}`);
      }
      // soft ready: process still alive after a bit
      if (i >= 5) return;
    }
  }

  stop() {
    if (!this.child) return;
    try {
      this.child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    this.child = null;
  }
}
