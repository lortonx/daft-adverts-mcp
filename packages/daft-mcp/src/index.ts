import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createDaftClient } from "./client";
import { createServer } from "./create-server";

// One client for the process so auth_login tokens survive across tool calls.
const daft = createDaftClient();

// Factory must ignore the request context — never pass createServer directly,
// or serveStdio will inject ctx as the first argument (mistaken for DaftApi).
const handle = serveStdio(() => createServer(daft));

process.on("SIGINT", () => {
  void handle.close();
});
