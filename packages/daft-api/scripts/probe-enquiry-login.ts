/**
 * Local enquiry probe with password login.
 * Usage: bun packages/daft-api/scripts/probe-enquiry-login.ts
 */
import { DaftApi, ApiError } from "../src/daft.ts";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvFile(resolve(import.meta.dir, "../../../.env"));

const username = process.env.DAFT_USERNAME;
const password = process.env.DAFT_PASSWORD;
if (!username || !password) {
  console.error("Set DAFT_USERNAME and DAFT_PASSWORD");
  process.exit(1);
}
const adId = Number(process.env.AD_ID ?? "6606296");

// Prefer no webshare for auth-sensitive calls if TS/local works; keep env proxy if set.
const daft = new DaftApi({
  clientId: process.env.DAFT_CLIENT_ID ?? "daft-android-v2",
  platform: "android",
  appVersion: "9.8.1",
});

console.log("proxy", process.env.HTTP_PROXY ?? "(none)");
console.log("adId", adId);

try {
  await daft.login(username, password);
  console.log("login OK", {
    hasAccess: Boolean(daft.getToken()),
    hasRefresh: Boolean(daft.getRefreshToken()),
  });
} catch (e) {
  if (e instanceof ApiError) {
    console.log("login FAIL", e.status, e.message.slice(0, 400));
  } else {
    console.log("login FAIL", e);
  }
  process.exit(1);
}

try {
  const form = await daft.getSavedReply(adId);
  console.log("form OK", JSON.stringify(form, null, 2));
} catch (e) {
  if (e instanceof ApiError) {
    console.log("form FAIL", e.status, e.message.slice(0, 400));
  } else console.log("form FAIL", e);
}

const form = await daft.getSavedReply(adId).catch(() => null);
const body = {
  adId,
  firstName: (form?.firstName ?? "Alexander").trim(),
  lastName: (form?.lastName ?? "M").trim(),
  email: form?.email ?? username,
  phone: form?.phone,
  message: "Hi, is this still available? (local API probe — please ignore)",
  saveReply: false,
  ...(form?.propertyToSellDetails
    ? { propertyToSellDetails: form.propertyToSellDetails }
    : {}),
};

async function rawPost(
  label: string,
  path: string,
  payload: unknown,
  headers: Record<string, string> = {},
  platform = "android"
) {
  const res = await fetch(`https://gateway.daft.ie${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      brand: "daft",
      platform,
      version: "9.8.1",
      app_version: "9.8.1",
      "User-Agent":
        platform === "android"
          ? "daft/9.8.1/AndroidVersion/11"
          : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Authorization: `Bearer ${daft.getToken()}`,
      ...headers,
    },
    body: JSON.stringify(payload),
    ...(process.env.HTTP_PROXY
      ? ({ proxy: process.env.HTTP_PROXY } as RequestInit)
      : {}),
  } as RequestInit);
  const text = await res.text();
  console.log(
    label,
    res.status,
    text.slice(0, 300).replace(/\s+/g, " ")
  );
  return { status: res.status, text };
}

console.log("body", body);

await rawPost("reply-base", "/old/v4/reply", body);
await rawPost("reply-no-phone", "/old/v4/reply", {
  adId: body.adId,
  firstName: body.firstName,
  lastName: body.lastName,
  email: body.email,
  message: body.message,
});
await rawPost("reply-dummy-captcha", "/old/v4/reply", body, {
  "Recaptcha-Token": "dummy",
  "Recaptcha-Action": "enquiry",
});
await rawPost("reply-web", "/old/v4/reply", body, {}, "web");

try {
  await daft.sendMessage(body);
  console.log("sendMessage OK");
} catch (e) {
  if (e instanceof ApiError) {
    console.log("sendMessage FAIL", e.status, e.message.slice(0, 400));
  } else console.log("sendMessage FAIL", e);
}

// Control: report should work if auth+proxy OK
try {
  await daft.reportAd({
    site: "daft",
    adId,
    reason: 1,
    message: "local probe ignore",
  });
  console.log("reportAd OK (control)");
} catch (e) {
  if (e instanceof ApiError) {
    console.log("reportAd FAIL", e.status, e.message.slice(0, 300));
  } else console.log("reportAd FAIL", e);
}
