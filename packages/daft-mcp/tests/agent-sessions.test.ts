import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearAllAgentSessions,
  getAgentSession,
  upsertAgentSession,
  deleteAgentSession,
  readAgentSessionsFile,
} from "../src/agent-session-store";
import { AgentSessionManager } from "../src/agent-sessions";

describe("agent-session-store", () => {
  let dir: string;
  let prev: string | undefined;

  afterEach(() => {
    if (prev === undefined) delete process.env.DAFT_AGENT_SESSIONS_FILE;
    else process.env.DAFT_AGENT_SESSIONS_FILE = prev;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("upserts and deletes by agentId", () => {
    dir = mkdtempSync(join(tmpdir(), "daft-agents-"));
    prev = process.env.DAFT_AGENT_SESSIONS_FILE;
    process.env.DAFT_AGENT_SESSIONS_FILE = join(dir, "sessions.json");

    upsertAgentSession("agent-a", {
      refreshToken: "r1",
      accessToken: "a1",
      username: "user@example.com",
    });
    expect(getAgentSession("agent-a")?.refreshToken).toBe("r1");
    expect(getAgentSession("agent-a")?.username).toBe("user@example.com");

    upsertAgentSession("agent-a", { refreshToken: "r2", accessToken: "a2" });
    expect(getAgentSession("agent-a")?.refreshToken).toBe("r2");
    expect(getAgentSession("agent-a")?.username).toBe("user@example.com");

    const raw = JSON.parse(
      readFileSync(process.env.DAFT_AGENT_SESSIONS_FILE!, "utf8")
    );
    expect(raw.agents["agent-a"].updatedAt).toBeTruthy();
    expect(Object.keys(readAgentSessionsFile().agents)).toEqual(["agent-a"]);

    deleteAgentSession("agent-a");
    expect(getAgentSession("agent-a")).toBeNull();
    clearAllAgentSessions();
  });
});

describe("AgentSessionManager", () => {
  let dir: string;
  let prev: string | undefined;

  afterEach(() => {
    if (prev === undefined) delete process.env.DAFT_AGENT_SESSIONS_FILE;
    else process.env.DAFT_AGENT_SESSIONS_FILE = prev;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("restores tokens from JSON after dropMemory", async () => {
    dir = mkdtempSync(join(tmpdir(), "daft-agents-mgr-"));
    prev = process.env.DAFT_AGENT_SESSIONS_FILE;
    process.env.DAFT_AGENT_SESSIONS_FILE = join(dir, "sessions.json");

    upsertAgentSession("bot-1", {
      refreshToken: "refresh-x",
      accessToken: "access-x",
      username: "user@example.com",
    });

    const mgr = new AgentSessionManager();
    const client = await mgr.requireSession("bot-1");
    expect(client.getRefreshToken()).toBe("refresh-x");
    expect(client.getToken()).toBe("access-x");

    mgr.dropMemory("bot-1");
    const again = await mgr.requireSession("bot-1");
    expect(again.getRefreshToken()).toBe("refresh-x");

    await expect(mgr.requireSession("missing")).rejects.toThrow(/No session/);
  });
});
