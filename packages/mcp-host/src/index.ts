import { createAdvertsClient } from "@adverts-ie/mcp/client";
import { createServer as createAdvertsServer } from "@adverts-ie/mcp";
import { createDaftClient } from "@daft-ie/mcp/client";
import { createServer as createDaftServer } from "@daft-ie/mcp";
import { createMcpFastifyApp } from "@modelcontextprotocol/fastify";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { loadOAuthConfigFromEnv, registerOAuth } from "./oauth/routes.ts";
import { OAuthStore } from "./oauth/store.ts";

// Coolify sets HOST/PORT; local/Docker may use MCP_HOST / MCP_HOST_PORT.
const host = process.env.MCP_HOST ?? process.env.HOST ?? "127.0.0.1";
const port = Number(
  process.env.PORT ?? process.env.MCP_HOST_PORT ?? "3100"
);

/** Shared clients — auth and state survive across HTTP requests. */
const daft = createDaftClient();
const adverts = createAdvertsClient();

const daftHandler = toNodeHandler(
  createMcpHandler(() => createDaftServer(daft))
);
const advertsHandler = toNodeHandler(
  createMcpHandler(() => createAdvertsServer(adverts))
);

const app = createMcpFastifyApp({ host });

const oauthStore = new OAuthStore(process.env.MCP_OAUTH_STORE ?? null);
const oauth = loadOAuthConfigFromEnv(oauthStore);
if (oauth) {
  registerOAuth(app, oauth);
  console.error(`OAuth enabled for ${oauth.publicUrl}`);
  console.error(
    `  static client_id=${process.env.MCP_OAUTH_CLIENT_ID ?? "claude-mcp"} (paste in Claude Advanced if DCR fails)`
  );
  if (oauth.apiKeys.size) {
    console.error(`  MCP_API_KEYS: ${oauth.apiKeys.size} key(s) accepted as Bearer`);
  }
}

app.all("/mcp/daft", (request, reply) =>
  daftHandler(request.raw, reply.raw, request.body)
);

app.all("/mcp/adverts", (request, reply) =>
  advertsHandler(request.raw, reply.raw, request.body)
);

app.get("/health", async () => ({
  ok: true,
  endpoints: ["/mcp/daft", "/mcp/adverts"],
  oauth: Boolean(oauth),
  publicUrl: oauth?.publicUrl ?? null,
}));

await app.listen({ host, port });
console.error(`mcp-host listening on http://${host}:${port}`);
console.error(`  daft    → http://${host}:${port}/mcp/daft`);
console.error(`  adverts → http://${host}:${port}/mcp/adverts`);
