import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type AgentSessionRecord = {
  accessToken?: string;
  refreshToken?: string;
  /** Login identity (email/username) — never the password. */
  username?: string;
  updatedAt: string;
};

export type AgentSessionsFile = {
  agents: Record<string, AgentSessionRecord>;
};

/** Path to the multi-agent session JSON DB (override with DAFT_AGENT_SESSIONS_FILE). */
export function agentSessionsPath(): string {
  return resolve(
    process.env.DAFT_AGENT_SESSIONS_FILE ??
      resolve(process.cwd(), ".daft-agent-sessions.json")
  );
}

function emptyFile(): AgentSessionsFile {
  return { agents: {} };
}

export function readAgentSessionsFile(): AgentSessionsFile {
  try {
    const raw = readFileSync(agentSessionsPath(), "utf8");
    const parsed = JSON.parse(raw) as AgentSessionsFile;
    if (!parsed || typeof parsed !== "object" || !parsed.agents) {
      return emptyFile();
    }
    return { agents: { ...parsed.agents } };
  } catch {
    return emptyFile();
  }
}

export function writeAgentSessionsFile(data: AgentSessionsFile): void {
  const path = agentSessionsPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(tmp, path);
}

export function getAgentSession(agentId: string): AgentSessionRecord | null {
  const id = agentId.trim();
  if (!id) return null;
  const rec = readAgentSessionsFile().agents[id];
  if (!rec || (!rec.refreshToken && !rec.accessToken)) return null;
  return rec;
}

export function upsertAgentSession(
  agentId: string,
  patch: Partial<Omit<AgentSessionRecord, "updatedAt">> & {
    username?: string;
  }
): AgentSessionRecord {
  const id = agentId.trim();
  if (!id) throw new Error("agentId is required");
  const data = readAgentSessionsFile();
  const prev = data.agents[id];
  const next: AgentSessionRecord = {
    accessToken: patch.accessToken ?? prev?.accessToken,
    refreshToken: patch.refreshToken ?? prev?.refreshToken,
    username: patch.username ?? prev?.username,
    updatedAt: new Date().toISOString(),
  };
  if (!next.refreshToken && !next.accessToken) {
    delete data.agents[id];
    writeAgentSessionsFile(data);
    return next;
  }
  data.agents[id] = next;
  writeAgentSessionsFile(data);
  return next;
}

export function deleteAgentSession(agentId: string): void {
  const id = agentId.trim();
  if (!id) return;
  const data = readAgentSessionsFile();
  if (!(id in data.agents)) return;
  delete data.agents[id];
  writeAgentSessionsFile(data);
}

/** Remove the whole DB file if empty / for tests. */
export function clearAllAgentSessions(): void {
  try {
    unlinkSync(agentSessionsPath());
  } catch {
    // ignore
  }
}
