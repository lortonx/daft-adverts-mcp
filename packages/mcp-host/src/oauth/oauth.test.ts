import { describe, expect, test } from "bun:test";
import Fastify from "fastify";
import { registerOAuth, type OAuthConfig } from "./routes.ts";
import {
  OAuthStore,
  redirectUriAllowed,
  sha256Base64Url,
  verifyPkceS256,
} from "./store.ts";

describe("oauth helpers", () => {
  test("pkce s256", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = sha256Base64Url(verifier);
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256("nope", challenge)).toBe(false);
  });

  test("loopback redirect ignores port", () => {
    expect(
      redirectUriAllowed(
        ["http://127.0.0.1/callback"],
        "http://127.0.0.1:3118/callback"
      )
    ).toBe(true);
    expect(
      redirectUriAllowed(
        ["https://claude.ai/api/mcp/auth_callback"],
        "https://claude.ai/api/mcp/auth_callback"
      )
    ).toBe(true);
  });
});

describe("oauth routes", () => {
  async function boot() {
    const store = new OAuthStore(null);
    store.ensureStaticClient("claude-mcp");
    const cfg: OAuthConfig = {
      publicUrl: "https://dmcp.example",
      mcpPaths: ["/mcp/daft", "/mcp/adverts"],
      store,
      apiKeys: new Set(["test-api-key"]),
      autoApprove: true,
      accessTtlSec: 3600,
    };
    const app = Fastify();
    registerOAuth(app, cfg);
    app.post("/mcp/daft", async () => ({ ok: true }));
    await app.ready();
    return { app, store, cfg };
  }

  test("AS + PRM discovery", async () => {
    const { app } = await boot();
    const as = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });
    expect(as.statusCode).toBe(200);
    const meta = as.json() as { registration_endpoint: string };
    expect(meta.registration_endpoint).toContain("/oauth/register");

    const prm = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource/mcp/daft",
    });
    expect(prm.statusCode).toBe(200);
    expect(prm.json().resource).toBe("https://dmcp.example/mcp/daft");
    await app.close();
  });

  test("DCR returns 201 with refresh_token grant", async () => {
    const { app } = await boot();
    const res = await app.inject({
      method: "POST",
      url: "/oauth/register",
      headers: { "content-type": "application/json" },
      payload: {
        client_name: "Claude",
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      client_id: string;
      grant_types: string[];
    };
    expect(body.client_id).toBeTruthy();
    expect(body.grant_types).toContain("refresh_token");
    await app.close();
  });

  test("full code+pkce flow and mcp bearer", async () => {
    const { app } = await boot();
    const verifier = "a".repeat(64);
    const challenge = sha256Base64Url(verifier);

    const auth = await app.inject({
      method: "GET",
      url:
        "/oauth/authorize?" +
        new URLSearchParams({
          response_type: "code",
          client_id: "claude-mcp",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          code_challenge: challenge,
          code_challenge_method: "S256",
          resource: "https://dmcp.example/mcp/daft",
          state: "xyz",
        }).toString(),
    });
    expect(auth.statusCode).toBe(302);
    const loc = new URL(auth.headers.location!);
    const code = loc.searchParams.get("code");
    expect(code).toBeTruthy();

    const token = await app.inject({
      method: "POST",
      url: "/oauth/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code: code!,
        redirect_uri: "https://claude.ai/api/mcp/auth_callback",
        client_id: "claude-mcp",
        code_verifier: verifier,
        resource: "https://dmcp.example/mcp/daft",
      }).toString(),
    });
    expect(token.statusCode).toBe(200);
    const tok = token.json() as {
      access_token: string;
      refresh_token: string;
    };
    expect(tok.access_token).toBeTruthy();
    expect(tok.refresh_token).toBeTruthy();

    const denied = await app.inject({ method: "POST", url: "/mcp/daft" });
    expect(denied.statusCode).toBe(401);
    expect(denied.headers["www-authenticate"]).toContain("resource_metadata");

    const ok = await app.inject({
      method: "POST",
      url: "/mcp/daft",
      headers: { authorization: `Bearer ${tok.access_token}` },
    });
    expect(ok.statusCode).toBe(200);

    const apiKey = await app.inject({
      method: "POST",
      url: "/mcp/daft",
      headers: { authorization: "Bearer test-api-key" },
    });
    expect(apiKey.statusCode).toBe(200);

    await app.close();
  });
});
