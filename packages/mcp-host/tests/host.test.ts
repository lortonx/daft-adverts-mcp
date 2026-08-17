import { describe, expect, it } from "bun:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createAdvertsClient } from "@adverts-ie/mcp/client";
import { createDaftClient } from "@daft-ie/mcp/client";
import { AgentSessionManager } from "@daft-ie/mcp/sessions";
import { createMcpHost, hostnameFromPublicUrl } from "../src/app.ts";

process.env.DAFT_CLIENT_ID ??= "daft-android-v2";
process.env.ADVERTS_NEW_API_KEY ??= "test";
process.env.ADVERTS_OLD_API_KEY ??= "test";

describe("mcp-host", () => {
  it("parses MCP_PUBLIC_URL hostname", () => {
    expect(hostnameFromPublicUrl("https://example.com")).toBe("example.com");
    expect(hostnameFromPublicUrl("https://example.com/")).toBe("example.com");
    expect(hostnameFromPublicUrl(undefined)).toBeUndefined();
    expect(hostnameFromPublicUrl("not a url")).toBeUndefined();
  });

  it("lists daft tools over Streamable HTTP", async () => {
    const app = createMcpHost({
      host: "127.0.0.1",
      daftSessions: new AgentSessionManager({ anonymous: createDaftClient() }),
      adverts: createAdvertsClient(),
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const addr = app.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp/daft`)
    );
    const client = new Client(
      { name: "host-harness", version: "1.0.0" },
      { versionNegotiation: { mode: "auto" } }
    );
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain("search_for_rent");
      expect(tools.map((t) => t.name)).toContain("auth_login");
    } finally {
      await client.close();
      await app.close();
    }
  });
});
