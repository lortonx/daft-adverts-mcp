import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type OAuthClient = {
  client_id: string;
  client_secret?: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  client_id_issued_at: number;
};

export type AuthCode = {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: "S256";
  resource?: string;
  scope: string;
  expires_at: number;
};

export type IssuedToken = {
  access_token: string;
  refresh_token: string;
  client_id: string;
  resource?: string;
  scope: string;
  access_expires_at: number;
  /** Previous refresh token after rotation (one-time reuse detection). */
  rotated_from?: string;
};

type StoreFile = {
  clients: OAuthClient[];
  codes: AuthCode[];
  tokens: IssuedToken[];
};

function emptyStore(): StoreFile {
  return { clients: [], codes: [], tokens: [] };
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Base64Url(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  return sha256Base64Url(verifier) === challenge;
}

/** Claude Code loopback: ignore port on localhost / 127.0.0.1. */
export function redirectUriAllowed(
  registered: string[],
  requested: string
): boolean {
  if (registered.includes(requested)) return true;
  let req: URL;
  try {
    req = new URL(requested);
  } catch {
    return false;
  }
  const loopback =
    req.hostname === "localhost" || req.hostname === "127.0.0.1";
  if (!loopback) return false;
  return registered.some((r) => {
    try {
      const u = new URL(r);
      return (
        (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
        u.protocol === req.protocol &&
        u.pathname === req.pathname
      );
    } catch {
      return false;
    }
  });
}

export class OAuthStore {
  private data: StoreFile;
  private dirty = false;

  constructor(private readonly filePath: string | null) {
    this.data = this.load();
  }

  private load(): StoreFile {
    if (!this.filePath || !existsSync(this.filePath)) return emptyStore();
    try {
      return { ...emptyStore(), ...JSON.parse(readFileSync(this.filePath, "utf8")) };
    } catch {
      return emptyStore();
    }
  }

  private persist(): void {
    if (!this.filePath || !this.dirty) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    this.dirty = false;
  }

  ensureStaticClient(clientId: string, clientSecret?: string): OAuthClient {
    let c = this.data.clients.find((x) => x.client_id === clientId);
    if (c) return c;
    c = {
      client_id: clientId,
      client_secret: clientSecret,
      client_name: "Claude (static)",
      redirect_uris: [
        "https://claude.ai/api/mcp/auth_callback",
        "http://localhost/callback",
        "http://127.0.0.1/callback",
      ],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: clientSecret ? "client_secret_post" : "none",
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.data.clients.push(c);
    this.dirty = true;
    this.persist();
    return c;
  }

  registerClient(input: {
    client_name?: string;
    redirect_uris: string[];
    grant_types?: string[];
    response_types?: string[];
    token_endpoint_auth_method?: string;
  }): OAuthClient {
    const authMethod = input.token_endpoint_auth_method ?? "none";
    const client: OAuthClient = {
      client_id: randomToken(16),
      client_secret:
        authMethod === "none" ? undefined : randomToken(24),
      client_name: input.client_name,
      redirect_uris: input.redirect_uris,
      grant_types: input.grant_types ?? [
        "authorization_code",
        "refresh_token",
      ],
      response_types: input.response_types ?? ["code"],
      token_endpoint_auth_method: authMethod,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.data.clients.push(client);
    this.dirty = true;
    this.persist();
    return client;
  }

  getClient(clientId: string): OAuthClient | undefined {
    return this.data.clients.find((c) => c.client_id === clientId);
  }

  saveCode(code: AuthCode): void {
    this.data.codes = this.data.codes.filter((c) => c.expires_at > Date.now());
    this.data.codes.push(code);
    this.dirty = true;
    this.persist();
  }

  takeCode(code: string): AuthCode | undefined {
    const idx = this.data.codes.findIndex((c) => c.code === code);
    if (idx < 0) return undefined;
    const [entry] = this.data.codes.splice(idx, 1);
    this.dirty = true;
    this.persist();
    if (!entry || entry.expires_at < Date.now()) return undefined;
    return entry;
  }

  saveTokens(token: IssuedToken): void {
    this.data.tokens = this.data.tokens.filter(
      (t) => t.access_expires_at > Date.now() - 86_400_000
    );
    this.data.tokens.push(token);
    this.dirty = true;
    this.persist();
  }

  findByAccess(accessToken: string): IssuedToken | undefined {
    const t = this.data.tokens.find((x) => x.access_token === accessToken);
    if (!t || t.access_expires_at < Date.now()) return undefined;
    return t;
  }

  findByRefresh(refreshToken: string): IssuedToken | undefined {
    return this.data.tokens.find((x) => x.refresh_token === refreshToken);
  }

  revokeRefresh(refreshToken: string): void {
    this.data.tokens = this.data.tokens.filter(
      (t) => t.refresh_token !== refreshToken
    );
    this.dirty = true;
    this.persist();
  }
}
