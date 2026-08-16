/**
 * Mint reCAPTCHA Enterprise tokens via the LSPosed TCP server on a phone
 * (e.g. galaxy-j7 over Tailscale). Used under the hood by {@link DaftApi.sendMessage}.
 *
 * Protocol: one line request → one line response → close.
 *   TOKEN [action] → OK <token> | ERR <msg>
 */
import { connect } from "node:net";

export const DEFAULT_RECAPTCHA_TCP_PORT = 17373;
export const DEFAULT_RECAPTCHA_ACTION = "enquiry_form_submit";

export type RecaptchaTcpOptions = {
  host?: string;
  port?: number;
  action?: string;
  timeoutMs?: number;
};

export type RecaptchaMintResult = { token: string; action: string };

export function recaptchaTcpConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return Boolean(env.DAFT_RECAPTCHA_TCP_HOST?.trim());
}

export function resolveRecaptchaTcpOptions(
  overrides: RecaptchaTcpOptions = {},
  env: NodeJS.ProcessEnv = process.env
): Required<
  Pick<RecaptchaTcpOptions, "host" | "port" | "action" | "timeoutMs">
> {
  const host = (overrides.host ?? env.DAFT_RECAPTCHA_TCP_HOST ?? "").trim();
  if (!host) {
    throw new Error(
      "DAFT_RECAPTCHA_TCP_HOST is not set (Tailscale hostname/IP of the phone, e.g. galaxy-j7)"
    );
  }
  const port =
    overrides.port ??
    Number(env.DAFT_RECAPTCHA_TCP_PORT ?? DEFAULT_RECAPTCHA_TCP_PORT);
  const action =
    (
      overrides.action ??
      env.DAFT_RECAPTCHA_ACTION ??
      DEFAULT_RECAPTCHA_ACTION
    ).trim() || DEFAULT_RECAPTCHA_ACTION;
  const timeoutMs =
    overrides.timeoutMs ??
    Number(env.DAFT_RECAPTCHA_TCP_TIMEOUT_MS ?? 90_000);
  return { host, port, action, timeoutMs };
}

/** Returns the raw token (without OK prefix). */
export async function fetchRecaptchaToken(
  overrides: RecaptchaTcpOptions = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<RecaptchaMintResult> {
  const { host, port, action, timeoutMs } = resolveRecaptchaTcpOptions(
    overrides,
    env
  );
  const request = `TOKEN ${action}`;
  const line = await tcpLine(host, port, request, timeoutMs);
  if (line.startsWith("OK ")) {
    const token = line.slice(3).trim();
    if (token.length < 20) {
      throw new Error(
        `recaptcha TCP returned short token (len=${token.length})`
      );
    }
    return { token, action };
  }
  throw new Error(
    line.startsWith("ERR ") ? line.slice(4) : line || "empty response"
  );
}

function tcpLine(
  host: string,
  port: number,
  request: string,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    let buf = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(
        new Error(
          `recaptcha TCP timeout ${host}:${port} after ${timeoutMs}ms`
        )
      );
    }, timeoutMs);

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(request + "\n");
    });
    socket.on("data", (chunk: string) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl >= 0) {
        clearTimeout(timer);
        socket.end();
        resolve(buf.slice(0, nl).replace(/\r$/, ""));
      }
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.on("close", () => {
      if (!buf.includes("\n")) {
        clearTimeout(timer);
        reject(
          new Error(
            `recaptcha TCP closed without response from ${host}:${port} (got ${JSON.stringify(buf)})`
          )
        );
      }
    });
  });
}
