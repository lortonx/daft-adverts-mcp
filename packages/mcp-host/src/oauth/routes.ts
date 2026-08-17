import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  OAuthStore,
  randomToken,
  redirectUriAllowed,
  verifyPkceS256,
} from "./store.ts";

export type OAuthConfig = {
  /** Public origin, e.g. https://example.com (no trailing slash). */
  publicUrl: string;
  /** MCP mount paths protected by bearer auth. */
  mcpPaths: string[];
  store: OAuthStore;
  /** Extra bearer tokens accepted (Cursor / Hermes). */
  apiKeys: Set<string>;
  /** Skip consent HTML; issue code immediately. */
  autoApprove: boolean;
  /** Optional gate password for consent page. */
  password?: string;
  accessTtlSec: number;
};

function issuer(cfg: OAuthConfig): string {
  return cfg.publicUrl.replace(/\/$/, "");
}

function resourceForPath(cfg: OAuthConfig, path: string): string {
  return `${issuer(cfg)}${path}`;
}

function oauthError(
  reply: FastifyReply,
  status: number,
  error: string,
  description?: string
) {
  return reply.status(status).type("application/json").send({
    error,
    ...(description ? { error_description: description } : {}),
  });
}

async function unauthorized(
  reply: FastifyReply,
  cfg: OAuthConfig,
  mcpPath: string
): Promise<void> {
  if (reply.sent) return;
  const meta = `${issuer(cfg)}/.well-known/oauth-protected-resource${mcpPath}`;
  reply.header(
    "WWW-Authenticate",
    `Bearer realm="mcp", resource_metadata="${meta}"`
  );
  await reply.code(401).send({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized" },
    id: null,
  });
}

function parseBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1]?.trim();
}

export function registerOAuth(app: FastifyInstance, cfg: OAuthConfig): void {
  const base = issuer(cfg);

  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        done(null, Object.fromEntries(new URLSearchParams(String(body))));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  const asMetadata = {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    scopes_supported: ["mcp", "offline_access"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    code_challenge_methods_supported: ["S256"],
    // Claude selects CIMD only when both are true; we use DCR.
    client_id_metadata_document_supported: false,
  };

  app.get("/.well-known/oauth-authorization-server", async () => asMetadata);
  app.get("/.well-known/openid-configuration", async () => asMetadata);

  const prm = (resource: string) => ({
    resource,
    authorization_servers: [base],
    scopes_supported: ["mcp", "offline_access"],
    bearer_methods_supported: ["header"],
  });

  app.get("/.well-known/oauth-protected-resource", async () =>
    prm(`${base}/mcp/daft`)
  );

  for (const path of cfg.mcpPaths) {
    app.get(
      `/.well-known/oauth-protected-resource${path}`,
      async () => prm(resourceForPath(cfg, path))
    );
  }

  /** RFC 7591 Dynamic Client Registration — Claude Connect uses this. */
  app.post("/oauth/register", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const redirect_uris = body.redirect_uris;
    if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return oauthError(
        reply,
        400,
        "invalid_client_metadata",
        "redirect_uris required"
      );
    }
    const uris = redirect_uris.map(String);
    for (const u of uris) {
      try {
        new URL(u);
      } catch {
        return oauthError(reply, 400, "invalid_redirect_uri", u);
      }
    }

    let authMethod = String(
      body.token_endpoint_auth_method ?? "none"
    );
    // Claude may request client_secret_post; accept it.
    if (
      authMethod !== "none" &&
      authMethod !== "client_secret_post" &&
      authMethod !== "client_secret_basic"
    ) {
      authMethod = "none";
    }

    const client = cfg.store.registerClient({
      client_name:
        typeof body.client_name === "string" ? body.client_name : undefined,
      redirect_uris: uris,
      grant_types: Array.isArray(body.grant_types)
        ? body.grant_types.map(String)
        : undefined,
      response_types: Array.isArray(body.response_types)
        ? body.response_types.map(String)
        : undefined,
      token_endpoint_auth_method: authMethod,
    });

    return reply.status(201).send({
      client_id: client.client_id,
      ...(client.client_secret
        ? { client_secret: client.client_secret, client_secret_expires_at: 0 }
        : {}),
      client_id_issued_at: client.client_id_issued_at,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: client.grant_types,
      response_types: client.response_types,
      token_endpoint_auth_method: client.token_endpoint_auth_method,
    });
  });

  app.get("/oauth/authorize", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const clientId = q.client_id;
    const redirectUri = q.redirect_uri;
    const responseType = q.response_type;
    const challenge = q.code_challenge;
    const method = q.code_challenge_method;
    const state = q.state;
    const resource = q.resource;
    const scope = q.scope ?? "mcp offline_access";

    if (!clientId || !redirectUri || !challenge) {
      return oauthError(reply, 400, "invalid_request", "missing params");
    }
    if (responseType !== "code") {
      return oauthError(reply, 400, "unsupported_response_type");
    }
    if (method !== "S256") {
      return oauthError(
        reply,
        400,
        "invalid_request",
        "code_challenge_method must be S256"
      );
    }

    const client = cfg.store.getClient(clientId);
    if (!client) {
      return oauthError(reply, 400, "invalid_client");
    }
    if (!redirectUriAllowed(client.redirect_uris, redirectUri)) {
      return oauthError(reply, 400, "invalid_request", "redirect_uri mismatch");
    }

    const issue = () => {
      const code = randomToken(24);
      cfg.store.saveCode({
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource,
        scope,
        expires_at: Date.now() + 10 * 60_000,
      });
      const url = new URL(redirectUri);
      url.searchParams.set("code", code);
      if (state) url.searchParams.set("state", state);
      return reply.redirect(url.toString());
    };

    if (cfg.autoApprove && !cfg.password) {
      return issue();
    }

    if (request.headers["content-type"]?.includes("application/x-www-form-urlencoded")) {
      // handled by POST below
    }

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Allow MCP access</title>
<style>
body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;line-height:1.4}
button{padding:.6rem 1rem;font-size:1rem;cursor:pointer}
input{width:100%;padding:.5rem;margin:.5rem 0 1rem;box-sizing:border-box}
</style></head><body>
<h1>Allow Claude to use this MCP?</h1>
<p>Host: <code>${base}</code></p>
<form method="POST" action="/oauth/authorize">
${Object.entries(q)
  .filter(([, v]) => v != null)
  .map(
    ([k, v]) =>
      `<input type="hidden" name="${k}" value="${String(v)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")}" />`
  )
  .join("\n")}
${
  cfg.password
    ? `<label>Password<input type="password" name="password" required /></label>`
    : ""
}
<button type="submit" name="approve" value="1">Allow</button>
</form>
</body></html>`;
    return reply.type("text/html").send(html);
  });

  app.post("/oauth/authorize", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string>;
    const clientId = body.client_id;
    const redirectUri = body.redirect_uri;
    const challenge = body.code_challenge;
    const method = body.code_challenge_method;
    const state = body.state;
    const resource = body.resource;
    const scope = body.scope ?? "mcp offline_access";

    if (cfg.password && body.password !== cfg.password) {
      return reply.status(403).type("text/html").send("Wrong password");
    }
    if (!clientId || !redirectUri || !challenge || method !== "S256") {
      return oauthError(reply, 400, "invalid_request");
    }
    const client = cfg.store.getClient(clientId);
    if (!client || !redirectUriAllowed(client.redirect_uris, redirectUri)) {
      return oauthError(reply, 400, "invalid_request");
    }

    const code = randomToken(24);
    cfg.store.saveCode({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource,
      scope,
      expires_at: Date.now() + 10 * 60_000,
    });
    const url = new URL(redirectUri);
    url.searchParams.set("code", code);
    if (state) url.searchParams.set("state", state);
    return reply.redirect(url.toString());
  });

  app.post("/oauth/token", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string>;
    const grant = body.grant_type;

    let clientId = body.client_id;
    let clientSecret = body.client_secret;
    const auth = request.headers.authorization;
    if (auth?.startsWith("Basic ")) {
      try {
        const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
        const i = decoded.indexOf(":");
        clientId = decoded.slice(0, i);
        clientSecret = decoded.slice(i + 1);
      } catch {
        /* ignore */
      }
    }

    if (!clientId) {
      return oauthError(reply, 400, "invalid_client", "client_id required");
    }
    const client = cfg.store.getClient(clientId);
    if (!client) {
      return oauthError(reply, 401, "invalid_client");
    }
    if (
      client.client_secret &&
      client.token_endpoint_auth_method !== "none" &&
      client.client_secret !== clientSecret
    ) {
      return oauthError(reply, 401, "invalid_client");
    }

    if (grant === "authorization_code") {
      const code = body.code;
      const redirectUri = body.redirect_uri;
      const verifier = body.code_verifier;
      if (!code || !redirectUri || !verifier) {
        return oauthError(reply, 400, "invalid_request");
      }
      const saved = cfg.store.takeCode(code);
      if (!saved || saved.client_id !== clientId) {
        return oauthError(reply, 400, "invalid_grant");
      }
      if (saved.redirect_uri !== redirectUri) {
        return oauthError(reply, 400, "invalid_grant", "redirect_uri");
      }
      if (!verifyPkceS256(verifier, saved.code_challenge)) {
        return oauthError(reply, 400, "invalid_grant", "pkce");
      }
      if (body.resource && saved.resource && body.resource !== saved.resource) {
        return oauthError(reply, 400, "invalid_target");
      }

      const access = randomToken(32);
      const refresh = randomToken(32);
      cfg.store.saveTokens({
        access_token: access,
        refresh_token: refresh,
        client_id: clientId,
        resource: body.resource ?? saved.resource,
        scope: saved.scope,
        access_expires_at: Date.now() + cfg.accessTtlSec * 1000,
      });

      return reply.send({
        access_token: access,
        token_type: "bearer",
        expires_in: cfg.accessTtlSec,
        refresh_token: refresh,
        scope: saved.scope,
      });
    }

    if (grant === "refresh_token") {
      const rt = body.refresh_token;
      if (!rt) return oauthError(reply, 400, "invalid_request");
      const existing = cfg.store.findByRefresh(rt);
      if (!existing || existing.client_id !== clientId) {
        return oauthError(reply, 400, "invalid_grant");
      }
      cfg.store.revokeRefresh(rt);
      const access = randomToken(32);
      const refresh = randomToken(32);
      cfg.store.saveTokens({
        access_token: access,
        refresh_token: refresh,
        client_id: clientId,
        resource: body.resource ?? existing.resource,
        scope: existing.scope,
        access_expires_at: Date.now() + cfg.accessTtlSec * 1000,
        rotated_from: rt,
      });
      return reply.send({
        access_token: access,
        token_type: "bearer",
        expires_in: cfg.accessTtlSec,
        refresh_token: refresh,
        scope: existing.scope,
      });
    }

    return oauthError(reply, 400, "unsupported_grant_type");
  });

  app.post("/oauth/revoke", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string>;
    if (body.token) cfg.store.revokeRefresh(body.token);
    return reply.status(200).send({});
  });

  app.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0] ?? "";
    const mcpPath = cfg.mcpPaths.find(
      (p) => path === p || path.startsWith(`${p}/`)
    );
    if (!mcpPath) return;

    const token = parseBearer(request.headers.authorization);
    if (!token) {
      await unauthorized(reply, cfg, mcpPath);
      return reply;
    }
    if (cfg.apiKeys.has(token)) return;

    const issued = cfg.store.findByAccess(token);
    if (!issued) {
      await unauthorized(reply, cfg, mcpPath);
      return reply;
    }

    if (issued.resource) {
      const allowed = cfg.mcpPaths.map((p) => resourceForPath(cfg, p));
      if (!allowed.includes(issued.resource)) {
        await unauthorized(reply, cfg, mcpPath);
        return reply;
      }
    }
  });
}

export function loadOAuthConfigFromEnv(store: OAuthStore): OAuthConfig | null {
  const enabled =
    process.env.MCP_OAUTH === "1" || process.env.MCP_OAUTH === "true";
  if (!enabled) return null;

  const publicUrl = (
    process.env.MCP_PUBLIC_URL ??
    process.env.MCP_OAUTH_ISSUER ??
    ""
  ).replace(/\/$/, "");
  if (!publicUrl) {
    console.error(
      "MCP_OAUTH=1 but MCP_PUBLIC_URL is missing — OAuth not mounted"
    );
    return null;
  }

  const staticId = process.env.MCP_OAUTH_CLIENT_ID ?? "claude-mcp";
  const staticSecret = process.env.MCP_OAUTH_CLIENT_SECRET;
  store.ensureStaticClient(staticId, staticSecret);

  const apiKeys = new Set(
    (process.env.MCP_API_KEYS ?? process.env.MCP_API_KEY ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  return {
    publicUrl,
    mcpPaths: ["/mcp/daft", "/mcp/adverts"],
    store,
    apiKeys,
    autoApprove:
      process.env.MCP_OAUTH_AUTO_APPROVE !== "0" &&
      process.env.MCP_OAUTH_AUTO_APPROVE !== "false",
    password: process.env.MCP_OAUTH_PASSWORD || undefined,
    accessTtlSec: Number(process.env.MCP_OAUTH_ACCESS_TTL ?? "3600"),
  };
}

/** Exported for tests — validate a request would be authorized. */
export function isAuthorizedToken(
  cfg: OAuthConfig,
  token: string,
  mcpPath: string
): boolean {
  if (cfg.apiKeys.has(token)) return true;
  const issued = cfg.store.findByAccess(token);
  if (!issued) return false;
  if (!issued.resource) return true;
  const expected = resourceForPath(cfg, mcpPath);
  if (issued.resource === expected) return true;
  return cfg.mcpPaths
    .map((p) => resourceForPath(cfg, p))
    .includes(issued.resource);
}

export type { FastifyRequest };
