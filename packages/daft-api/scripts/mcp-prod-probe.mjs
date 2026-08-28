/** Probe dmcp.malaha.tk MCP without printing secrets. */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.MCP_BASE ?? "https://dmcp.malaha.tk";
const dir = dirname(fileURLToPath(import.meta.url));

function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv(resolve(dir, "../../../.env"));

const username = process.env.DAFT_USERNAME?.trim();
const password = process.env.DAFT_PASSWORD?.trim();
if (!username || !password) {
  console.error(JSON.stringify({ error: "missing DAFT_USERNAME/PASSWORD in .env" }));
  process.exit(1);
}

const agentId = `prod-probe-${Date.now()}`;
const headers = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

async function call(name, args = {}) {
  const t0 = Date.now();
  const res = await fetch(`${base}/mcp/daft`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  const m = text.match(/data:\s*(\{[\s\S]*\})/);
  let json;
  try {
    json = m ? JSON.parse(m[1]) : JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  const content = json?.result?.content?.[0]?.text;
  let parsed = content;
  try {
    if (typeof content === "string" && content.startsWith("{")) parsed = JSON.parse(content);
  } catch {
    /* keep string */
  }
  return {
    tool: name,
    http: res.status,
    ms: Date.now() - t0,
    isError: Boolean(json?.result?.isError || json?.error),
    body: parsed ?? json?.error?.message ?? text.slice(0, 400),
  };
}

const health = await fetch(`${base}/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
console.log(JSON.stringify({ phase: "health", health }, null, 2));

const login = await call("auth_login", { agentId, username, password });
console.log(JSON.stringify({ phase: "auth_login", ...login }, null, 2));

const status = await call("auth_status", { agentId });
console.log(JSON.stringify({ phase: "auth_status", ...status }, null, 2));

const form = await call("get_enquiry_form", { agentId, listingId: 6606296 });
console.log(JSON.stringify({ phase: "get_enquiry_form", ...form }, null, 2));

const enquiry = await call("send_enquiry", {
  agentId,
  adId: 6606296,
  message: "Prod probe — please ignore if received.",
  listingUrl: "https://www.daft.ie/for-sale/3-stonepark-abbey-rathfarnham-dublin-14/6606296",
  firstName: "Alexander",
  lastName: "M",
  email: username,
  useSavedForm: false,
});
console.log(JSON.stringify({ phase: "send_enquiry", ...enquiry }, null, 2));
