/**
 * Disk cleanup for Chrome pool: wipe profile caches, drop cookie files.
 * Session cookies live in JSON under cookieDir — profile is disposable.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { cookieStorePath, normalizeEmail } from "./util";

/** Remove Chrome --user-data-dir entirely (safe after process stop). */
export function wipeChromeProfile(userDataDir: string): void {
  if (!existsSync(userDataDir)) return;
  try {
    rmSync(userDataDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`[chrome-cleanup] wipe profile failed: ${String(err)}`);
    return;
  }
  mkdirSync(userDataDir, { recursive: true });
}

/** Delete persisted cookie jar for one email. */
export function deleteCookieFile(cookieDir: string, email: string): boolean {
  const p = cookieStorePath(cookieDir, normalizeEmail(email));
  if (!existsSync(p)) return false;
  try {
    unlinkSync(p);
    return true;
  } catch (err) {
    console.error(`[chrome-cleanup] delete cookie failed: ${String(err)}`);
    return false;
  }
}

/**
 * Remove cookie JSON files older than maxAgeMs (by mtime).
 * @returns number of files removed
 */
export function pruneStaleCookieFiles(
  cookieDir: string,
  maxAgeMs: number,
  now = Date.now()
): number {
  if (maxAgeMs <= 0 || !existsSync(cookieDir)) return 0;
  let removed = 0;
  for (const name of readdirSync(cookieDir)) {
    if (!name.endsWith(".json")) continue;
    const p = join(cookieDir, name);
    try {
      const st = statSync(p);
      if (now - st.mtimeMs > maxAgeMs) {
        unlinkSync(p);
        removed++;
      }
    } catch {
      /* ignore */
    }
  }
  return removed;
}
