/**
 * Red-capable harness for enquiry 403 diagnosis.
 * Asserts: POST /old/v4/reply with phone-minted captcha → expect NOT 403 once fixed.
 * Current: goes RED (status===403).
 *
 * Usage:
 *   bun packages/daft-api/scripts/diagnose-enquiry-403.ts
 *
 * Env: DAFT_RECAPTCHA_TCP_HOST (default 100.83.27.97), DAFT_USERNAME, DAFT_PASSWORD
 * Optional: DIAG_AD_ID, DIAG_CASE=baseline|lower|no-captcha|dummy|submit|no-auth|all
 * baseline = Pascal Recaptcha-* + enquiry_form_submit; remints on 403
 *   (DAFT_RECAPTCHA_SEND_RETRIES / PREFER_SHORT / MINT_TRIES)
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fetchRecaptchaToken } from "../src/recaptcha-tcp.ts";

function loadEnv(p: string) {
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
loadEnv(resolve(import.meta.dir, "../../../.env"));

process.env.DAFT_RECAPTCHA_TCP_HOST ??= "100.83.27.97";
process.env.DAFT_RECAPTCHA_TCP_PORT ??= "17373";

const email = process.env.DAFT_USERNAME?.trim();
const password = process.env.DAFT_PASSWORD?.trim();
if (!email || !password) {
  throw new Error(
    "Set DAFT_USERNAME and DAFT_PASSWORD in .env (no hardcoded credentials)"
  );
}
const caseName = process.env.DIAG_CASE ?? "baseline";
const fixedAd = process.env.DIAG_AD_ID
  ? Number(process.env.DIAG_AD_ID)
  : undefined;

type CaseResult = {
  case: string;
  status: number;
  ok: boolean;
  red: boolean;
  envoyMs: string | null;
  cfRay: string | null;
  bodyLen: number;
  bodyHead: string;
  captchaLen?: number;
  action?: string;
  egress: string;
};

async function login(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "daft-android-v2",
    username: email,
    password,
    scope: "openid offline_access dapi",
  });
  const res = await fetch("https://auth.daft.ie/auth/realms/daft/protocol/openid-connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      brand: "daft",
      platform: "android",
      version: "9.8.1",
      app_version: "9.8.1",
      "User-Agent": "daft/9.8.1/AndroidVersion/15",
    },
    body,
  });
  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`login failed ${res.status} ${json.error ?? ""}`);
  }
  return json.access_token;
}

async function getForm(token: string, adId: number) {
  const res = await fetch(
    `https://gateway.daft.ie/api/v1/forms/enquiry/${adId}`,
    {
      headers: {
        accept: "application/json",
        brand: "daft",
        platform: "android",
        version: "9.8.1",
        app_version: "9.8.1",
        Authorization: `Bearer ${token}`,
        "User-Agent": "daft/9.8.1/AndroidVersion/15",
      },
    },
  );
  if (!res.ok) throw new Error(`form ${adId} → ${res.status}`);
  return (await res.json()) as {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    enquired?: boolean;
  };
}

async function pickAd(token: string): Promise<number> {
  if (fixedAd) return fixedAd;
  const res = await fetch("https://gateway.daft.ie/old/v1/listings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      brand: "daft",
      platform: "android",
      version: "9.8.1",
      app_version: "9.8.1",
      Authorization: `Bearer ${token}`,
      "User-Agent": "daft/9.8.1/AndroidVersion/15",
    },
    body: JSON.stringify({
      section: "residential-to-rent",
      andFilters: [],
      geoFilter: { storedShapeIds: [] },
      paging: { from: "0", pageSize: "20" },
      sort: "publishDateDesc",
    }),
  });
  // Prefer known fresh id if search shape differs
  const known = [6646640, 6646621, 6646618, 6646611];
  for (const id of known) {
    const f = await getForm(token, id);
    if (!f.enquired) return id;
  }
  if (!res.ok) return 6646640;
  const data = (await res.json()) as {
    listings?: Array<{ listing?: { id?: number }; id?: number }>;
  };
  for (const row of data.listings ?? []) {
    const id = row.listing?.id ?? row.id;
    if (typeof id !== "number") continue;
    const f = await getForm(token, id);
    if (!f.enquired) return id;
  }
  return known[0]!;
}

async function runCase(
  name: string,
  opts: {
    token?: string;
    captcha?: { token: string; action: string };
    headerStyle: "lower" | "pascal" | "none";
    bodyExtra?: Record<string, unknown>;
  },
  adId: number,
  form: Awaited<ReturnType<typeof getForm>>,
  egress: string,
): Promise<CaseResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    accept: "application/json",
    brand: "daft",
    platform: "android",
    version: "9.8.1",
    app_version: "9.8.1",
    "User-Agent": "daft/9.8.1/AndroidVersion/15",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.captcha && opts.headerStyle === "lower") {
    headers["recaptcha-token"] = opts.captcha.token;
    headers["recaptcha-action"] = opts.captcha.action;
  }
  if (opts.captcha && opts.headerStyle === "pascal") {
    headers["Recaptcha-Token"] = opts.captcha.token;
    headers["Recaptcha-Action"] = opts.captcha.action;
  }

  const res = await fetch("https://gateway.daft.ie/old/v4/reply", {
    method: "POST",
    headers,
    body: JSON.stringify({
      tcAccepted: true,
      adId,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone,
      message: "Hi, is this still available? (diag)",
      ...opts.bodyExtra,
    }),
  });
  const text = await res.text().catch(() => "");
  return {
    case: name,
    status: res.status,
    ok: res.ok,
    red: res.status === 403,
    envoyMs: res.headers.get("x-envoy-upstream-service-time"),
    cfRay: res.headers.get("cf-ray"),
    bodyLen: text.length,
    bodyHead: text.slice(0, 160),
    captchaLen: opts.captcha?.token.length,
    action: opts.captcha?.action,
    egress,
  };
}

const egress = await fetch("https://api.ipify.org").then((r) => r.text());
const access = await login();
const adId = await pickAd(access);
const form = await getForm(access, adId);

console.log(
  JSON.stringify({
    phase: "setup",
    egress,
    adId,
    enquired: form.enquired,
    captchaHost: process.env.DAFT_RECAPTCHA_TCP_HOST,
  }),
);

const results: CaseResult[] = [];

async function mint(action: string) {
  return fetchRecaptchaToken({ action } as never).catch(async () => {
    // action override not on type — call via env HOST only and rewrite request by TCP
    const { connect } = await import("node:net");
    const host = process.env.DAFT_RECAPTCHA_TCP_HOST!;
    const port = Number(process.env.DAFT_RECAPTCHA_TCP_PORT ?? 17373);
    const line = await new Promise<string>((resolveP, reject) => {
      const s = connect({ host, port }, () =>
        s.write(`TOKEN ${action}\n`),
      );
      let buf = "";
      s.setTimeout(30000);
      s.on("data", (d) => {
        buf += d.toString("utf8");
        if (buf.includes("\n")) {
          s.destroy();
          resolveP(buf.trim());
        }
      });
      s.on("error", reject);
      s.on("timeout", () => {
        s.destroy();
        reject(new Error("mint timeout"));
      });
    });
    if (!line.startsWith("OK ")) throw new Error(line);
    return { token: line.slice(3).trim(), action };
  });
}

const cases =
  caseName === "all"
    ? ([
        "no-captcha",
        "dummy",
        "lower",
        "baseline",
        "submit",
        "no-auth",
      ] as const)
    : ([caseName] as const);

for (const c of cases) {
  if (c === "no-captcha") {
    results.push(
      await runCase(
        "no-captcha",
        { token: access, headerStyle: "none" },
        adId,
        form,
        egress,
      ),
    );
    continue;
  }
  if (c === "dummy") {
    results.push(
      await runCase(
        "dummy",
        {
          token: access,
          captcha: { token: "dummy", action: "enquiry_form_submit" },
          headerStyle: "lower",
        },
        adId,
        form,
        egress,
      ),
    );
    continue;
  }
  if (c === "no-auth") {
    const m = await mint("enquiry_form_submit");
    results.push(
      await runCase(
        "no-auth",
        { captcha: m, headerStyle: "lower" },
        adId,
        form,
        egress,
      ),
    );
    continue;
  }
  if (c === "submit") {
    const m = await mint("submit");
    results.push(
      await runCase(
        "submit+lower",
        { token: access, captcha: m, headerStyle: "lower" },
        adId,
        form,
        egress,
      ),
    );
    continue;
  }
  if (c === "lower") {
    const m = await mint("enquiry_form_submit");
    results.push(
      await runCase(
        "lower+enquiry_form_submit",
        { token: access, captcha: m, headerStyle: "lower" },
        adId,
        form,
        egress,
      ),
    );
    continue;
  }
  // baseline = locked-in working path; remint on 403 (bad captcha score)
  const sendRetries = Number(process.env.DAFT_RECAPTCHA_SEND_RETRIES ?? 10);
  const preferShort = (process.env.DAFT_RECAPTCHA_PREFER_SHORT ?? "1") !== "0";
  const maxLen = Number(process.env.DAFT_RECAPTCHA_PREFERRED_MAX_LEN ?? 3200);
  const mintTries = Number(process.env.DAFT_RECAPTCHA_MINT_TRIES ?? 8);
  let last: CaseResult | null = null;
  for (let attempt = 1; attempt <= sendRetries; attempt++) {
    let m = await mint("enquiry_form_submit");
    if (preferShort) {
      for (let i = 1; i < mintTries && m.token.length >= maxLen; i++) {
        m = await mint("enquiry_form_submit");
      }
    }
    last = await runCase(
      `baseline+pascal+enquiry_form_submit#${attempt}`,
      { token: access, captcha: m, headerStyle: "pascal" },
      adId,
      form,
      egress,
    );
    last = { ...last, captchaLen: m.token.length };
    results.push(last);
    if (!last.red && last.ok) break;
    if (!last.red) break; // non-403 failure — stop
  }
}

for (const r of results) {
  console.log(JSON.stringify(r));
}

const baseline =
  results.find((r) => r.case.includes("baseline") && r.ok && !r.red) ??
  results.find((r) => r.case.includes("baseline")) ??
  results[0]!;
const verdict = baseline.red ? "RED" : baseline.ok ? "GREEN" : `OTHER_${baseline.status}`;
console.log(JSON.stringify({ verdict, symptom: "HTTP 403 on /old/v4/reply", adId, attempts: results.filter((r) => r.case.includes("baseline")).length }));
process.exit(baseline.red || !baseline.ok ? 1 : 0);
