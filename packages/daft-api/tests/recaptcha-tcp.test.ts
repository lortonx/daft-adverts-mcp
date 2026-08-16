import { describe, it, expect, afterEach } from "bun:test";
import { createServer, type Server } from "node:net";
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
});
