import type { AdvertsApi } from "@adverts-ie/api";
import { createServer as createAdvertsServer } from "@adverts-ie/mcp";
import { createServer as createDaftServer } from "@daft-ie/mcp";
import type { AgentSessionManager } from "@daft-ie/mcp/sessions";
import { createMcpFastifyApp } from "@modelcontextprotocol/fastify";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { FastifyInstance } from "fastify";
import { registerOAuth, type OAuthConfig } from "./oauth/routes.ts";

export type McpHostOptions = {
  host: string;
  /** Hostname from MCP_PUBLIC_URL — DNS-rebinding allowlist when binding 0.0.0.0. */
  publicHostname?: string;
  oauth?: OAuthConfig | null;
  daftSessions: AgentSessionManager;
  adverts: AdvertsApi;
};

export function hostnameFromPublicUrl(
  url: string | undefined
): string | undefined {
  if (!url?.trim()) return undefined;
  try {
    return new URL(url).hostname || undefined;
  } catch {
    return undefined;
  }
}

/** Fastify app: Streamable HTTP mounts + optional OAuth. Does not listen. */
export function createMcpHost(opts: McpHostOptions): FastifyInstance {
  const allowedHosts = opts.publicHostname
    ? [opts.publicHostname, "127.0.0.1", "localhost"]
    : undefined;

  const app = createMcpFastifyApp({
    host: opts.host,
    allowedHosts,
  });

  if (opts.oauth) registerOAuth(app, opts.oauth);

  const daft = toNodeHandler(
    createMcpHandler(() => createDaftServer(opts.daftSessions))
  );
  const adverts = toNodeHandler(
    createMcpHandler(() => createAdvertsServer(opts.adverts))
  );

  app.all("/mcp/daft", (request, reply) =>
    daft(request.raw, reply.raw, request.body)
  );
  app.all("/mcp/adverts", (request, reply) =>
    adverts(request.raw, reply.raw, request.body)
  );

  app.get("/health", async () => ({
    ok: true,
    endpoints: ["/mcp/daft", "/mcp/adverts"] as const,
    oauth: Boolean(opts.oauth),
    publicUrl: opts.oauth?.publicUrl ?? null,
  }));

  return app;
}
