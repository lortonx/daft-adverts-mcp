import { DaftApi } from "@daft-ie/api";

/**
 * Build a DaftApi client for MCP.
 * Auth is per-agent via AgentSessionManager.
 * Enquiry defaults to Chrome web form (`DAFT_ENQUIRY_MODE=chrome`).
 * Optional legacy: `DAFT_RECAPTCHA_TCP_HOST` when mode=tcp.
 */
export function createDaftClient(): DaftApi {
  const captchaHost = process.env.DAFT_RECAPTCHA_TCP_HOST?.trim();
  const captchaConfigured = Boolean(captchaHost);
  const timeout = Number(
    process.env.DAFT_HTTP_TIMEOUT_MS ??
      (process.env.DAFT_ENQUIRY_MODE === "tcp" && captchaConfigured
        ? 60_000
        : 30_000)
  );
  const portRaw = process.env.DAFT_RECAPTCHA_TCP_PORT?.trim();
  return new DaftApi({
    clientId: process.env.DAFT_CLIENT_ID ?? "daft-android-v2",
    platform: "android",
    appVersion: process.env.DAFT_APP_VERSION ?? "9.8.1",
    osVersion: process.env.DAFT_OS_VERSION ?? "15",
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 60_000,
    recaptchaTcpHost: captchaHost,
    recaptchaTcpPort: portRaw ? Number(portRaw) : undefined,
  });
}
