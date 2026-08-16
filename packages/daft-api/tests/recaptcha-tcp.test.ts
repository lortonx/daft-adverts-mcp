import { describe, it, expect, afterEach } from "bun:test";
import { connect, createServer, type Server } from "node:net";
import {
  fetchRecaptchaToken,
  recaptchaTcpConfigured,
  resolveRecaptchaTcpOptions,
} from "../src/recaptcha-tcp";

describe("recaptcha-tcp", () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it("recaptchaTcpConfigured reflects DAFT_RECAPTCHA_TCP_HOST", () => {
    expect(recaptchaTcpConfigured({})).toBe(false);
    expect(
      recaptchaTcpConfigured({ DAFT_RECAPTCHA_TCP_HOST: "galaxy-j7" })
    ).toBe(true);
  });

  it("resolveRecaptchaTcpOptions defaults port and action", () => {
    const opts = resolveRecaptchaTcpOptions(
      {},
      { DAFT_RECAPTCHA_TCP_HOST: "galaxy-j7" }
    );
    expect(opts.host).toBe("galaxy-j7");
    expect(opts.port).toBe(17373);
    expect(opts.action).toBe("enquiry_form_submit");
  });

  it("fetchRecaptchaToken talks line protocol", async () => {
    server = createServer((socket) => {
      let buf = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => {
        buf += chunk;
        if (!buf.includes("\n")) return;
        const line = buf.trim();
        expect(line).toBe("TOKEN enquiry_form_submit");
        socket.write(
          "OK 03AFcXeabcdefghijklmnopqrstuvwxyz0123456789token\n"
        );
        socket.end();
      });
    });
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve)
    );
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");

    const { token, action } = await fetchRecaptchaToken(
      { host: "127.0.0.1", port: addr.port },
      { DAFT_RECAPTCHA_TCP_HOST: "127.0.0.1" }
    );
    expect(action).toBe("enquiry_form_submit");
    expect(token.startsWith("03A")).toBe(true);
    expect(token.length).toBeGreaterThan(20);
  });

  it("fetchRecaptchaToken surfaces ERR lines", async () => {
    server = createServer((socket) => {
      socket.setEncoding("utf8");
      socket.on("data", () => {
        socket.write("ERR busy\n");
        socket.end();
      });
    });
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve)
    );
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");

    await expect(
      fetchRecaptchaToken(
        { host: "127.0.0.1", port: addr.port },
        { DAFT_RECAPTCHA_TCP_HOST: "127.0.0.1" }
      )
    ).rejects.toThrow("busy");
  });

  it(
    "fetchRecaptchaToken dials via SOCKS5",
    async () => {
      const upstream = createServer((socket) => {
        socket.setEncoding("utf8");
        let buf = "";
        socket.on("data", (chunk) => {
          buf += chunk;
          if (!buf.includes("\n")) return;
          expect(buf.trim()).toBe("TOKEN enquiry_form_submit");
          socket.write(
            "OK 03AFcXeabcdefghijklmnopqrstuvwxyz0123456789socks\n"
          );
          socket.end();
        });
      });
      await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
      const upAddr = upstream.address();
      if (!upAddr || typeof upAddr === "string") throw new Error("no up port");

      const socks = createServer((client) => {
        let stage: "greet" | "req" = "greet";
        let buf = Buffer.alloc(0);
        client.on("data", (chunk) => {
          if (stage === "pipe") return;
          buf = Buffer.concat([buf, chunk]);
          if (stage === "greet") {
            if (buf.length < 3) return;
            client.write(Buffer.from([0x05, 0x00]));
            buf = buf.subarray(3);
            stage = "req";
          }
          if (stage !== "req") return;
          if (buf.length < 5) return;
          const atyp = buf[3]!;
          if (atyp !== 0x03) {
            client.destroy();
            return;
          }
          const hlen = buf[4]!;
          if (buf.length < 5 + hlen + 2) return;
          const destPort = buf.readUInt16BE(5 + hlen);
          expect(destPort).toBe(upAddr.port);
          const rest = buf.subarray(5 + hlen + 2);
          buf = Buffer.alloc(0);
          stage = "pipe" as "greet"; // stop handshake parsing
          const remote = connect({ host: "127.0.0.1", port: upAddr.port }, () => {
            // Reply only after upstream is up so early payload is not lost.
            client.write(
              Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
            );
            if (rest.length) remote.write(rest);
            client.pipe(remote);
            remote.pipe(client);
          });
          remote.on("error", () => client.destroy());
        });
      });
      await new Promise<void>((r) => socks.listen(0, "127.0.0.1", r));
      const socksAddr = socks.address();
      if (!socksAddr || typeof socksAddr === "string")
        throw new Error("no socks");

      try {
        const { token } = await fetchRecaptchaToken(
          {
            host: "galaxy-j7",
            port: upAddr.port,
            socks: `socks5://127.0.0.1:${socksAddr.port}`,
          },
          { DAFT_RECAPTCHA_TCP_HOST: "galaxy-j7" }
        );
        expect(token.endsWith("socks")).toBe(true);
      } finally {
        socks.close();
        upstream.close();
      }
    },
    15_000
  );
});
