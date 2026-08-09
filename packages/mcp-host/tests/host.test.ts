import { afterAll, describe, expect, it } from "bun:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createDaftClient } from "@daft-ie/mcp/client";
import { createServer as createDaftServer } from "@daft-ie/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";

process.env.DAFT_CLIENT_ID ??= "daft-android-v2";

/**
 * In-process mount smoke test (same wiring as Fastify → toNodeHandler).
 * Does not bind a TCP port.
 */
describe("mcp-host daft mount", () => {
  const daft = createDaftClient();
  const handler = createMcpHandler(() => createDaftServer(daft));

  afterAll(async () => {
    await handler.close();
  });

  it("lists daft tools over streamable HTTP handler", async () => {
    const transport = new StreamableHTTPClientTransport(
      new URL("http://test.local/mcp/daft"),
      {
        fetch: (url, init) => handler.fetch(new Request(url, init)),
      }
    );
    const client = new Client(
      { name: "host-harness", version: "1.0.0" },
      { versionNegotiation: { mode: "auto" } }
    );
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain("search_for_rent");
      expect(names).toContain("auth_login");
    } finally {
      await client.close();
    }
  });
});
