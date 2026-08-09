import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Cursor (esp. CLI) may spawn MCP with a wrong cwd and inject
 * ELECTRON_RUN_AS_NODE, which breaks Bun/Node stdio. Fix both before
 * constructing the API client.
 */
export function bootMcpEnv(monorepoEnvFile: string): void {
  delete process.env.ELECTRON_RUN_AS_NODE;
  delete process.env.ELECTRON_NO_ASAR;

  if (!existsSync(monorepoEnvFile)) return;
  for (const raw of readFileSync(monorepoEnvFile, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Don't override vars already set by the host.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Monorepo root `.env` relative to `packages/<name>/src`. */
export function monorepoEnvPath(fromDir: string = import.meta.dir): string {
  return resolve(fromDir, "../../../.env");
}
