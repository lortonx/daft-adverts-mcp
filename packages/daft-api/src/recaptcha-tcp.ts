/**
 * Mint reCAPTCHA Enterprise tokens via the LSPosed TCP server on a phone
 * (e.g. galaxy-j7 over Tailscale). Used under the hood by {@link DaftApi.sendMessage}.
 *
 * Protocol: one line request → one line response → close.
 *   TOKEN [action] → OK <token> | ERR <msg>
 *
 * On Docker userspace Tailscale, raw `net.connect` to `100.x` fails — set
 * `DAFT_RECAPTCHA_SOCKS=socks5://127.0.0.1:1056` (entrypoint enables SOCKS5).
 * Prefer Tailscale IP (`100.x`) over MagicDNS hostname — userspace SOCKS
 * often fails CONNECT to names like `galaxy-j7` (status=1) while IP works.
 */
import { connect, type Socket } from "node:net";

export const DEFAULT_RECAPTCHA_TCP_PORT = 17373;
/** Hardcoded Recaptcha-Action for Daft Android enquiry. */
export const DEFAULT_RECAPTCHA_ACTION = "enquiry_form_submit";
/**
 * Prefer tokens shorter than this when minting (probe: short ≈2.6k succeed more often than ≈4.5k).
 * Override with `DAFT_RECAPTCHA_PREFERRED_MAX_LEN`.
 */
export const PREFERRED_RECAPTCHA_MAX_LEN = 3200;
/** Default mint attempts while hunting a short token (`DAFT_RECAPTCHA_MINT_TRIES`). */
export const DEFAULT_RECAPTCHA_MINT_TRIES = 8;
/** Default send attempts on HTTP 403 with a fresh mint (`DAFT_RECAPTCHA_SEND_RETRIES`). */
export const DEFAULT_RECAPTCHA_SEND_RETRIES = 10;

export type RecaptchaTcpOptions = {
  host?: string;
  port?: number;
  timeoutMs?: number;
  /** socks5://host:port — overrides `DAFT_RECAPTCHA_SOCKS`. */
  socks?: string;
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
> & { socks?: string } {
  const host = (overrides.host ?? env.DAFT_RECAPTCHA_TCP_HOST ?? "").trim();
  if (!host) {
    throw new Error(
      "DAFT_RECAPTCHA_TCP_HOST is not set (Tailscale IP of the phone, e.g. 100.83.27.97)"
    );
  }
  const port =
    overrides.port ??
    Number(env.DAFT_RECAPTCHA_TCP_PORT ?? DEFAULT_RECAPTCHA_TCP_PORT);
  const action = DEFAULT_RECAPTCHA_ACTION;
  const timeoutMs =
    overrides.timeoutMs ??
    Number(env.DAFT_RECAPTCHA_TCP_TIMEOUT_MS ?? 90_000);
  const socks = (overrides.socks ?? env.DAFT_RECAPTCHA_SOCKS ?? "").trim() || undefined;
  return { host, port, action, timeoutMs, socks };
}

/** Returns the raw token (without OK prefix). */
export async function fetchRecaptchaToken(
  overrides: RecaptchaTcpOptions = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<RecaptchaMintResult> {
  const { host, port, action, timeoutMs, socks } = resolveRecaptchaTcpOptions(
    overrides,
    env
  );
  const request = `TOKEN ${action}`;
  const line = await tcpLine(host, port, request, timeoutMs, socks);
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

function envFlagTrue(value: string | undefined, defaultTrue: boolean): boolean {
  if (value === undefined || value === "") return defaultTrue;
  const v = value.trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
}

/** Whether to prefer short tokens (`DAFT_RECAPTCHA_PREFER_SHORT`, default on). */
export function preferShortRecaptcha(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return envFlagTrue(env.DAFT_RECAPTCHA_PREFER_SHORT, true);
}

export function preferredRecaptchaMaxLen(
  env: NodeJS.ProcessEnv = process.env
): number {
  const n = Number(env.DAFT_RECAPTCHA_PREFERRED_MAX_LEN ?? PREFERRED_RECAPTCHA_MAX_LEN);
  return Number.isFinite(n) && n > 0 ? n : PREFERRED_RECAPTCHA_MAX_LEN;
}

export function recaptchaMintTries(
  env: NodeJS.ProcessEnv = process.env
): number {
  const n = Number(env.DAFT_RECAPTCHA_MINT_TRIES ?? DEFAULT_RECAPTCHA_MINT_TRIES);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_RECAPTCHA_MINT_TRIES;
}

export function recaptchaSendRetries(
  env: NodeJS.ProcessEnv = process.env
): number {
  const n = Number(
    env.DAFT_RECAPTCHA_SEND_RETRIES ?? DEFAULT_RECAPTCHA_SEND_RETRIES
  );
  return Number.isFinite(n) && n >= 1
    ? Math.floor(n)
    : DEFAULT_RECAPTCHA_SEND_RETRIES;
}

/**
 * Mint until token length &lt; preferred max (short bucket), or tries exhausted
 * (returns last mint). Set `DAFT_RECAPTCHA_PREFER_SHORT=0` to mint once.
 */
export async function fetchRecaptchaTokenPreferShort(
  overrides: RecaptchaTcpOptions = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<RecaptchaMintResult> {
  if (!preferShortRecaptcha(env)) {
    return fetchRecaptchaToken(overrides, env);
  }
  const maxLen = preferredRecaptchaMaxLen(env);
  const tries = recaptchaMintTries(env);
  let last: RecaptchaMintResult | null = null;
  for (let i = 0; i < tries; i++) {
    last = await fetchRecaptchaToken(overrides, env);
    if (last.token.length < maxLen) return last;
  }
  return last!;
}

function tcpLine(
  host: string,
  port: number,
  request: string,
  timeoutMs: number,
  socksUrl?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    let socket: Socket;
    let buf = "";
    let settled = false;
    const timer = setTimeout(() => {
      fail(
        new Error(
          `recaptcha TCP timeout ${host}:${port} after ${timeoutMs}ms` +
            (socksUrl ? ` via ${socksUrl}` : "")
        )
      );
    }, timeoutMs);

    function fail(err: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.destroy();
      } catch {
        /* ignore */
      }
      reject(err);
    }

    function succeed(line: string) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.end();
      } catch {
        /* ignore */
      }
      resolve(line);
    }

    function onPayload() {
      const nl = buf.indexOf("\n");
      if (nl >= 0) succeed(buf.slice(0, nl).replace(/\r$/, ""));
    }

    function attachPayloadHandlers() {
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        buf += chunk;
        onPayload();
      });
      socket.on("error", (err) => fail(err));
      socket.on("close", () => {
        if (!settled && !buf.includes("\n")) {
          fail(
            new Error(
              `recaptcha TCP closed without response from ${host}:${port} (got ${JSON.stringify(buf)})`
            )
          );
        }
      });
      socket.write(request + "\n");
    }

    if (socksUrl) {
      const proxy = parseSocks5Url(socksUrl);
      socket = connect({ host: proxy.host, port: proxy.port });
      socket.on("error", (err) => fail(err));
      socket.on("connect", () => {
        void socks5Connect(socket, host, port)
          .then(() => attachPayloadHandlers())
          .catch((err: Error) => fail(err));
      });
    } else {
      socket = connect({ host, port });
      socket.on("error", (err) => fail(err));
      socket.on("connect", () => attachPayloadHandlers());
    }
  });
}

export function parseSocks5Url(url: string): { host: string; port: number } {
  const u = new URL(url);
  if (u.protocol !== "socks5:" && u.protocol !== "socks:") {
    throw new Error(`unsupported SOCKS URL (need socks5://): ${url}`);
  }
  const host = u.hostname || "127.0.0.1";
  const port = u.port ? Number(u.port) : 1080;
  return { host, port };
}

/**
 * Minimal SOCKS5 CONNECT (no auth). Leaves socket ready for application data.
 * Uses ATYP IPv4 when `destHost` is a dotted quad (Tailscale userspace SOCKS
 * often fails domain CONNECT for MagicDNS / sometimes for IP-as-domain).
 */
export async function socks5Connect(
  socket: Socket,
  destHost: string,
  destPort: number
): Promise<void> {
  const reader = new SocketByteReader(socket);

  // greeting: ver=5, nmethods=1, method=0 (no auth)
  socket.write(Buffer.from([0x05, 0x01, 0x00]));
  const greet = await reader.read(2);
  if (greet[0] !== 0x05 || greet[1] !== 0x00) {
    throw new Error(
      `SOCKS5 greeting rejected: ${greet[0]},${greet[1]}`
    );
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(destHost);
  let req: Buffer;
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((n) => n > 255)) {
      throw new Error(`invalid IPv4: ${destHost}`);
    }
    req = Buffer.alloc(4 + 4 + 2);
    req[0] = 0x05;
    req[1] = 0x01;
    req[2] = 0x00;
    req[3] = 0x01; // IPv4
    req[4] = octets[0]!;
    req[5] = octets[1]!;
    req[6] = octets[2]!;
    req[7] = octets[3]!;
    req.writeUInt16BE(destPort, 8);
  } else {
    const hostBuf = Buffer.from(destHost, "utf8");
    if (hostBuf.length > 255) {
      throw new Error(`SOCKS5 hostname too long: ${destHost}`);
    }
    req = Buffer.alloc(4 + 1 + hostBuf.length + 2);
    req[0] = 0x05;
    req[1] = 0x01;
    req[2] = 0x00;
    req[3] = 0x03; // domain
    req[4] = hostBuf.length;
    hostBuf.copy(req, 5);
    req.writeUInt16BE(destPort, 5 + hostBuf.length);
  }
  socket.write(req);

  const head = await reader.read(4);
  if (head[0] !== 0x05 || head[1] !== 0x00) {
    throw new Error(`SOCKS5 CONNECT failed: status=${head[1]}`);
  }
  const atyp = head[3];
  if (atyp === 0x01) await reader.read(4 + 2);
  else if (atyp === 0x04) await reader.read(16 + 2);
  else if (atyp === 0x03) {
    const len = (await reader.read(1))[0]!;
    await reader.read(len + 2);
  } else {
    throw new Error(`SOCKS5 unknown atyp=${atyp}`);
  }
  reader.stop();
}

/** Accumulates socket bytes from construction so early packets are not lost. */
class SocketByteReader {
  private buf = Buffer.alloc(0);
  private wait: {
    n: number;
    resolve: (b: Buffer) => void;
    reject: (e: Error) => void;
  } | null = null;
  private readonly onData: (chunk: Buffer | string) => void;
  private readonly onErr: (err: Error) => void;
  private readonly onClose: () => void;

  constructor(private readonly socket: Socket) {
    this.onData = (chunk) => {
      const b = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      this.buf = Buffer.concat([this.buf, b]);
      this.pump();
    };
    this.onErr = (err) => {
      this.wait?.reject(err);
      this.wait = null;
    };
    this.onClose = () => {
      this.wait?.reject(new Error("SOCKS5 socket closed"));
      this.wait = null;
    };
    socket.on("data", this.onData);
    socket.on("error", this.onErr);
    socket.on("close", this.onClose);
  }

  read(n: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.wait = { n, resolve, reject };
      this.pump();
    });
  }

  private pump() {
    if (!this.wait || this.buf.length < this.wait.n) return;
    const { n, resolve } = this.wait;
    this.wait = null;
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    resolve(out);
  }

  stop() {
    this.socket.off("data", this.onData);
    this.socket.off("error", this.onErr);
    this.socket.off("close", this.onClose);
    if (this.buf.length) this.socket.unshift(this.buf);
  }
}
