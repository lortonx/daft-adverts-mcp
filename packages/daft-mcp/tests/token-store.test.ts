import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearTokenStore,
  persistTokensChange,
  readTokenStore,
  writeTokenStore,
} from "../src/token-store";

describe("token-store", () => {
  let dir: string;
  let prev: string | undefined;

  afterEach(() => {
    if (prev === undefined) delete process.env.DAFT_TOKEN_FILE;
    else process.env.DAFT_TOKEN_FILE = prev;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("persists refresh from login and reloads it", () => {
    dir = mkdtempSync(join(tmpdir(), "daft-tokens-"));
    prev = process.env.DAFT_TOKEN_FILE;
    process.env.DAFT_TOKEN_FILE = join(dir, "tokens.json");

    persistTokensChange({
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });

    const loaded = readTokenStore();
    expect(loaded?.refreshToken).toBe("refresh-1");
    expect(loaded?.accessToken).toBe("access-1");

    // Rotation updates refresh
    writeTokenStore({ refreshToken: "refresh-2", accessToken: "access-2" });
    expect(readTokenStore()?.refreshToken).toBe("refresh-2");

    const raw = JSON.parse(readFileSync(process.env.DAFT_TOKEN_FILE, "utf8"));
    expect(raw.updatedAt).toBeTruthy();

    persistTokensChange(null);
    expect(readTokenStore()).toBeNull();
    clearTokenStore();
  });
});
