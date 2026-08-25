import { DaftApi, getChromePool } from "@daft-ie/api";
import {
  deleteAgentSession,
  getAgentSession,
  upsertAgentSession,
} from "./agent-session-store";
import { createDaftClient } from "./client";

export type AgentSessionManagerOptions = {
  anonymous?: DaftApi;
  /** Injected fetch for per-agent clients (tests / custom HTTP). */
  fetchFn?: typeof fetch;
};

/**
 * Per-agent DaftApi clients backed by the JSON session DB.
 * Handshake: auth_login(agentId, username, password) → persist refresh/access.
 * Later tools pass agentId only; tokens load/refresh from the store.
 */
export class AgentSessionManager {
  private readonly clients = new Map<string, DaftApi>();
  private readonly usernames = new Map<string, string>();
  /** In-memory only — for Chrome web re-login after idle kill. Never written to disk. */
  private readonly passwords = new Map<string, string>();
  readonly anonymous: DaftApi;
  private readonly fetchFn?: typeof fetch;

  constructor(anonymousOrOpts: DaftApi | AgentSessionManagerOptions = {}) {
    if (anonymousOrOpts instanceof DaftApi) {
      this.anonymous = anonymousOrOpts;
      this.fetchFn = undefined;
    } else {
      this.anonymous = anonymousOrOpts.anonymous ?? createDaftClient();
      this.fetchFn = anonymousOrOpts.fetchFn;
    }
  }

  normalizeId(agentId: string): string {
    const id = agentId.trim();
    if (!id) throw new Error("agentId is required");
    return id;
  }

  getUsername(agentId: string): string | undefined {
    const id = this.normalizeId(agentId);
    return this.usernames.get(id) ?? getAgentSession(id)?.username;
  }

  /** Password from last auth_login in this process (not persisted). */
  getPassword(agentId: string): string | undefined {
    return this.passwords.get(this.normalizeId(agentId));
  }

  /**
   * Client for this agent. Loads tokens from JSON if present.
   * Does not create a disk row until login / token change.
   */
  clientFor(agentId: string): DaftApi {
    const id = this.normalizeId(agentId);
    let client = this.clients.get(id);
    if (client) return client;

    const stored = getAgentSession(id);
    client = new DaftApi({
      clientId: process.env.DAFT_CLIENT_ID ?? "daft-android-v2",
      platform: "android",
      appVersion: "9.8.1",
      timeout: 8000,
      fetchFn: this.fetchFn,
      authToken: stored?.accessToken,
      refreshToken: stored?.refreshToken,
      onTokensChange: (tokens) => {
        if (!tokens) {
          deleteAgentSession(id);
          return;
        }
        upsertAgentSession(id, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          username: this.usernames.get(id) ?? getAgentSession(id)?.username,
        });
      },
    });
    if (stored?.username) this.usernames.set(id, stored.username);
    this.clients.set(id, client);
    return client;
  }

  async login(
    agentId: string,
    username: string,
    password: string
  ): Promise<DaftApi> {
    const id = this.normalizeId(agentId);
    const client = this.clientFor(id);
    this.usernames.set(id, username);
    this.passwords.set(id, password);
    await client.login(username, password);
    upsertAgentSession(id, {
      accessToken: client.getToken(),
      refreshToken: client.getRefreshToken(),
      username,
    });
    return client;
  }

  /**
   * Ensure a logged-in client: optional password re-handshake, else restore from JSON.
   */
  async requireSession(
    agentId: string,
    credentials?: { username: string; password: string }
  ): Promise<DaftApi> {
    const id = this.normalizeId(agentId);
    if (credentials?.username && credentials?.password) {
      return this.login(id, credentials.username, credentials.password);
    }
    const client = this.clientFor(id);
    if (!client.getToken() && !client.getRefreshToken()) {
      throw new Error(
        `No session for agentId=${id}. Call auth_login with username+password first.`
      );
    }
    return client;
  }

  async logout(agentId: string): Promise<void> {
    const id = this.normalizeId(agentId);
    const client = this.clients.get(id) ?? this.clientFor(id);
    const refresh = client.getRefreshToken();
    const username = this.getUsername(id);
    try {
      if (refresh) {
        await client.logout(refresh, username);
      } else {
        client.clearTokens();
      }
    } catch {
      client.clearTokens();
    }
    this.clients.delete(id);
    this.usernames.delete(id);
    this.passwords.delete(id);
    deleteAgentSession(id);
    if (username) {
      try {
        getChromePool().clearUser(username);
      } catch {
        /* chrome pool optional */
      }
    }
  }

  /** Drop in-memory client (tests). Disk unchanged unless logout. */
  dropMemory(agentId: string): void {
    this.clients.delete(this.normalizeId(agentId));
  }
}
