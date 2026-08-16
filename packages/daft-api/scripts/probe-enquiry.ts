/**
 * Live probe: getSavedReply + sendMessage (dry — will actually POST if SEND=1).
 * Usage: bun packages/daft-api/scripts/probe-enquiry.ts [listingId]
 */
import { DaftApi, ApiError } from "../src/daft.ts";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

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

const listingId = Number(process.argv[2] ?? "6230913");
const doSend = process.env.SEND === "1";

const tokenFile = resolve(import.meta.dir, "../../../.daft-tokens.json");
let stored: { accessToken?: string; refreshToken?: string } | null = null;
if (existsSync(tokenFile)) {
  stored = JSON.parse(readFileSync(tokenFile, "utf8"));
}

const daft = new DaftApi({
  clientId: process.env.DAFT_CLIENT_ID ?? "daft-android-v2",
  platform: "android",
  appVersion: "9.8.1",
  authToken: stored?.accessToken ?? process.env.DAFT_ACCESS_TOKEN,
  refreshToken: stored?.refreshToken ?? process.env.DAFT_REFRESH_TOKEN,
});

console.log("proxy", process.env.HTTP_PROXY ?? "(none)");
console.log("hasAccess", Boolean(daft.getToken()));
console.log("hasRefresh", Boolean(daft.getRefreshToken()));
console.log("listingId", listingId);

try {
  const form = await daft.getSavedReply(listingId);
  console.log("getSavedReply OK", JSON.stringify(form, null, 2));
} catch (e) {
  if (e instanceof ApiError) {
    console.log("getSavedReply FAIL", e.status, e.message, e.body?.slice?.(0, 500));
  } else {
    console.log("getSavedReply FAIL", e);
  }
}

if (!doSend) {
  console.log("skip sendMessage (set SEND=1 to POST a real enquiry)");
  process.exit(0);
}

try {
  const form = await daft.getSavedReply(listingId).catch(() => null);
  await daft.sendMessage({
    adId: listingId,
    firstName: form?.firstName || "Test",
    lastName: form?.lastName || "User",
    email: form?.email || "test@example.com",
    phone: form?.phone,
    message: form?.message || "Is this still available? (API probe — please ignore)",
    saveReply: false,
  });
  console.log("sendMessage OK");
} catch (e) {
  if (e instanceof ApiError) {
    console.log("sendMessage FAIL", e.status, e.message);
    console.log("body", e.body?.slice?.(0, 1000));
  } else {
    console.log("sendMessage FAIL", e);
  }
}
