import { DaftApi } from "@daft-ie/api";

/**
 * Build a DaftApi client for MCP.
 * No env / file credentials — the agent must pass username+password on auth tools.
 * Session tokens live only in this process after a successful login call.
 */
export function createDaftClient(): DaftApi {
  return new DaftApi({
    clientId: process.env.DAFT_CLIENT_ID ?? "daft-android-v2",
    platform: "android",
    appVersion: "9.8.1",
    timeout: 8000,
  });
}
