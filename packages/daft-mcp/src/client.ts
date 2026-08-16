import { DaftApi } from "@daft-ie/api";

/**
 * Build a DaftApi client for MCP.
 * Auth is per-agent via AgentSessionManager; captcha mint uses env
 * (`DAFT_RECAPTCHA_TCP_HOST` + optional `DAFT_RECAPTCHA_SOCKS` on Docker).
 */
export function createDaftClient(): DaftApi {
  const captchaHost = process.env.DAFT_RECAPTCHA_TCP_HOST?.trim();
  const captchaConfigured = Boolean(captchaHost);
  // Remint + short-token hunt can span many gateway round-trips; 8s is too low
  // on Coolify (exit-node + SOCKS mint to phone).
  const timeout = Number(
    process.env.DAFT_HTTP_TIMEOUT_MS ??
      (captchaConfigured ? 60_000 : 15_000)
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
