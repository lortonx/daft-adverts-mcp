import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { bootMcpEnv, monorepoEnvPath } from "./boot";
import { createAdvertsClient } from "./client";
import { createServer } from "./create-server";

bootMcpEnv(monorepoEnvPath());

// One client for the process so auth_login tokens survive across tool calls.
const api = createAdvertsClient();

// Factory must ignore the request context — never pass createServer directly,
// or serveStdio will inject ctx as the first argument (mistaken for AdvertsApi).
const handle = serveStdio(() => createServer(api));

process.on("SIGINT", () => {
  void handle.close();
});
