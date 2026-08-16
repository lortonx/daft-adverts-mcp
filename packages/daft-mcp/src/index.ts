import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { AgentSessionManager } from "./agent-sessions";
import { bootMcpEnv, monorepoEnvPath } from "./boot";
import { createDaftClient } from "./client";
import { createServer } from "./create-server";

bootMcpEnv(monorepoEnvPath());

const sessions = new AgentSessionManager({ anonymous: createDaftClient() });

// Factory must ignore the request context — never pass createServer directly,
// or serveStdio will inject ctx as the first argument (mistaken for DaftApi).
const handle = serveStdio(() => createServer(sessions));

process.on("SIGINT", () => {
  void handle.close();
});
