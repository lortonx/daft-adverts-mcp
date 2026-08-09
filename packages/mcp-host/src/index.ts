import { createDaftClient } from "@daft-ie/mcp/client";
import { createServer as createDaftServer } from "@daft-ie/mcp";
import { createMcpFastifyApp } from "@modelcontextprotocol/fastify";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";

const host = process.env.MCP_HOST ?? "127.0.0.1";
const port = Number(process.env.MCP_HOST_PORT ?? "3100");

/** Shared clients — auth and state survive across HTTP requests. */
const daft = createDaftClient();

const daftHandler = toNodeHandler(
  createMcpHandler(() => createDaftServer(daft))
);

const app = createMcpFastifyApp({ host });

app.all("/mcp/daft", (request, reply) =>
  daftHandler(request.raw, reply.raw, request.body)
);

// Future MCPs:
// app.all("/mcp/<name>", (request, reply) => otherHandler(...));

app.get("/health", async () => ({
  ok: true,
  endpoints: ["/mcp/daft"],
}));

await app.listen({ host, port });
console.error(`mcp-host listening on http://${host}:${port}`);
console.error(`  daft → http://${host}:${port}/mcp/daft`);
