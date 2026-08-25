import { DaftApi } from "@daft-ie/api";

/**
 * Build a DaftApi client for MCP.
 * Auth is per-agent via AgentSessionManager.
 * Enquiry is Chrome web form only (`sendEnquiryViaChrome`).
 */
export function createDaftClient(): DaftApi {
  const timeout = Number(process.env.DAFT_HTTP_TIMEOUT_MS ?? 30_000);
  return new DaftApi({
    clientId: process.env.DAFT_CLIENT_ID ?? "daft-android-v2",
    platform: "android",
    appVersion: process.env.DAFT_APP_VERSION ?? "9.8.1",
    osVersion: process.env.DAFT_OS_VERSION ?? "15",
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 30_000,
  });
}
