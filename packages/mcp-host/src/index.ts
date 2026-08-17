import { createAdvertsClient } from "@adverts-ie/mcp/client";
import { createDaftClient } from "@daft-ie/mcp/client";
import { AgentSessionManager } from "@daft-ie/mcp/sessions";
import { createMcpHost, hostnameFromPublicUrl } from "./app.ts";
import { loadOAuthConfigFromEnv } from "./oauth/routes.ts";
import { OAuthStore } from "./oauth/store.ts";

const host = process.env.MCP_HOST ?? process.env.HOST ?? "127.0.0.1";
const port = Number(
  process.env.PORT ?? process.env.MCP_HOST_PORT ?? "3100"
);

const daftSessions = new AgentSessionManager({ anonymous: createDaftClient() });
const adverts = createAdvertsClient();
const oauth = loadOAuthConfigFromEnv(
  new OAuthStore(process.env.MCP_OAUTH_STORE ?? null)
);

const app = createMcpHost({
  host,
  publicHostname: hostnameFromPublicUrl(process.env.MCP_PUBLIC_URL),
  oauth,
  daftSessions,
  adverts,
});

if (oauth) {
  console.error(`OAuth enabled for ${oauth.publicUrl}`);
  console.error(
    `  static client_id=${process.env.MCP_OAUTH_CLIENT_ID ?? "claude-mcp"} (paste in Claude Advanced if DCR fails)`
  );
  if (oauth.apiKeys.size) {
    console.error(`  MCP_API_KEYS: ${oauth.apiKeys.size} key(s) accepted as Bearer`);
  }
}

await app.listen({ host, port });
console.error(`mcp-host listening on http://${host}:${port}`);
console.error(`  daft    → http://${host}:${port}/mcp/daft`);
console.error(`  adverts → http://${host}:${port}/mcp/adverts`);
