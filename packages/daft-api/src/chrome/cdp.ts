/**
 * Minimal Chrome DevTools Protocol client (browser + page sessions).
 */
export type CdpMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message?: string; code?: number };
};

export class CdpSession {
  private id = 0;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private handlers = new Map<string, Set<(params: Record<string, unknown>) => void>>();
  private closed = false;

  constructor(private readonly ws: WebSocket) {
    ws.onmessage = (ev) => this.onMessage(String(ev.data));
    ws.onclose = () => {
      this.closed = true;
      for (const [, p] of this.pending) {
        p.reject(new Error("CDP session closed"));
      }
      this.pending.clear();
    };
  }

  get alive() {
    return !this.closed && this.ws.readyState === WebSocket.OPEN;
  }

  on(method: string, fn: (params: Record<string, unknown>) => void) {
    let set = this.handlers.get(method);
    if (!set) {
      set = new Set();
      this.handlers.set(method, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  private onMessage(data: string) {
    const msg = JSON.parse(data) as CdpMessage;
    if (msg.id != null && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
      } else {
        resolve(msg.result);
      }
      return;
    }
    if (msg.method) {
      const set = this.handlers.get(msg.method);
      if (set) {
        for (const fn of set) fn(msg.params ?? {});
      }
    }
  }

  send<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string
  ): Promise<T> {
    if (!this.alive) return Promise.reject(new Error("CDP not connected"));
    const id = ++this.id;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      this.ws.send(JSON.stringify(payload));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

export async function connectCdp(wsUrl: string): Promise<CdpSession> {
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error(`CDP connect failed: ${wsUrl}`));
  });
  return new CdpSession(ws);
}

export async function waitForDebugger(
  port: number,
  attempts = 80
): Promise<{ webSocketDebuggerUrl: string; Browser?: string }> {
  const { setTimeout: sleep } = await import("node:timers/promises");
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        return (await res.json()) as {
          webSocketDebuggerUrl: string;
          Browser?: string;
        };
      }
    } catch {
      /* retry */
    }
    await sleep(150);
  }
  throw new Error(`Chrome debugger not up on :${port}`);
}
