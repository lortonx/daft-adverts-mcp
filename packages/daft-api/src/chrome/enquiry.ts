/**
 * Daft web enquiry via Chrome CDP (login + form submit).
 * Same gateway `/old/v4/reply` as Android, but captcha minted in-browser.
 */
import { pause, type ChromePool } from "./pool";
import type { PageHandle } from "./page";

export type ChromeEnquiryInput = {
  email: string;
  password: string;
  /** Full www.daft.ie listing URL (preferred). */
  listingUrl: string;
  message: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  /** Override contact email on form (defaults to login email). */
  contactEmail?: string;
};

export type ChromeEnquiryResult = {
  ok: boolean;
  listingUrl: string;
  replyStatus?: number;
  detail?: string;
};

async function apiSessionUser(page: PageHandle): Promise<unknown> {
  return page.evaluate(
    `fetch('https://www.daft.ie/api/auth/session', {credentials:'include'})
      .then(r => r.json()).catch(e => ({error: String(e)}))`
  );
}

async function isSignedIn(page: PageHandle): Promise<boolean> {
  const res = await apiSessionUser(page);
  return Boolean(
    res && typeof res === "object" && (res as { user?: unknown }).user
  );
}

async function ensureKeycloak(page: PageHandle, listingUrl: string) {
  let onAuth = await page.evaluate<boolean>(
    `location.hostname.includes('auth.daft.ie')`
  );
  if (onAuth) return;

  await page.navigate("https://www.daft.ie/auth/signin", 4000);
  await page.waitCfGone().catch(() => undefined);
  await page.acceptCookies();
  await pause(1500);
  onAuth = await page.evaluate<boolean>(
    `location.hostname.includes('auth.daft.ie')`
  );
  if (onAuth) return;

  await page.navigate(listingUrl, 4000);
  await page.waitCfGone().catch(() => undefined);
  await page.acceptCookies();
  await page.evaluate(`(() => {
    const el = [...document.querySelectorAll('button, a, [role=button]')]
      .find(e => /message/i.test((e.innerText||'') + ' ' + (e.getAttribute('aria-label')||'')));
    el && el.click();
  })()`);
  await pause(5000);
  onAuth = await page.evaluate<boolean>(
    `location.hostname.includes('auth.daft.ie')`
  );
  if (!onAuth) throw new Error("chrome enquiry: could not reach Keycloak login");
}

export async function ensureWebLogin(
  page: PageHandle,
  email: string,
  password: string,
  listingUrl: string
): Promise<void> {
  await page.navigate("https://www.daft.ie/", 3500);
  await page.waitCfGone().catch(() => undefined);
  await page.acceptCookies();
  if (await isSignedIn(page)) return;

  await ensureKeycloak(page, listingUrl);

  const userJson = JSON.stringify(email);
  const passJson = JSON.stringify(password);
  await page.evaluate(`(() => {
    const u = document.querySelector('#username');
    const p = document.querySelector('#password');
    if (!u || !p) throw new Error('login fields missing');
    const set = (el, v) => {
      el.focus();
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set(u, ${userJson});
    set(p, ${passJson});
    const btn = document.querySelector('#login, button[type=submit], input[type=submit]');
    if (!btn) throw new Error('login button missing');
    btn.click();
    return true;
  })()`);

  for (let i = 0; i < 45; i++) {
    await pause(1500);
    const host = await page.evaluate<string>(`location.hostname`);
    if (host === "www.daft.ie") {
      await pause(1500);
      if (await isSignedIn(page)) return;
    }
    const err = await page.evaluate<string>(
      `((document.querySelector('.alert-error, .error, #input-error, .kc-feedback-text') || {}).innerText || '')`
    );
    if (err && /invalid|incorrect|captcha|robot|failed/i.test(err)) {
      throw new Error(`chrome enquiry login failed: ${err}`);
    }
  }
  throw new Error("chrome enquiry: login timeout");
}

async function openMessageForm(page: PageHandle, listingUrl: string) {
  await page.navigate(listingUrl, 5000);
  await page.waitCfGone().catch(() => undefined);
  await page.acceptCookies();
  const clicked = await page.evaluate<string | null>(`(() => {
    const el = [...document.querySelectorAll('button, a, [role=button]')]
      .find(e => /^\\s*MESSAGE\\s*$/i.test((e.innerText||'').trim())
        || /message/i.test(e.getAttribute('aria-label')||''));
    if (!el) return null;
    el.click();
    return (el.innerText || el.getAttribute('aria-label') || '').trim();
  })()`);
  await pause(4000);
  const href = await page.evaluate<string>(`location.href`);
  if (/auth\.daft\.ie|\/auth\/signin/i.test(href)) {
    throw new Error("chrome enquiry: MESSAGE redirected to login");
  }
  if (!clicked) throw new Error("chrome enquiry: MESSAGE button not found");
}

async function fillAndSubmit(
  page: PageHandle,
  input: ChromeEnquiryInput
): Promise<{ submitted: boolean; reason?: string }> {
  const msg = JSON.stringify(input.message);
  const first = JSON.stringify(input.firstName ?? "");
  const last = JSON.stringify(input.lastName ?? "");
  const mail = JSON.stringify(input.contactEmail ?? input.email);
  const phone = JSON.stringify(input.phone ?? "");

  return page.evaluate(`(() => {
    const filled = {};
    const set = (el, v, key) => {
      if (!el || v === '') return;
      el.focus();
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      filled[key] = String(v).slice(0, 40);
    };
    const byName = (n) => document.querySelector('input[name=\"'+n+'\"], textarea[name=\"'+n+'\"]');
    set(byName('firstName'), ${first}, 'firstName');
    set(byName('lastName'), ${last}, 'lastName');
    set(byName('email'), ${mail}, 'email');
    set(byName('phone'), ${phone}, 'phone');
    const msgEl = byName('message') ||
      [...document.querySelectorAll('textarea')].find(t => !/recaptcha/i.test(t.name||t.id||''));
    if (!msgEl) return { submitted: false, reason: 'no message field', filled };
    set(msgEl, ${msg}, 'message');

    const tc = [...document.querySelectorAll('input[type=checkbox]')].find(c =>
      /term|agree|tc|privacy|accept/i.test((c.name||'')+(c.id||'')+(c.parentElement?.innerText||'')));
    if (tc && !tc.checked) tc.click();

    const btn = [...document.querySelectorAll('button, input[type=submit]')]
      .find(b => /send|submit|enquire|message/i.test((b.innerText||b.value||'')));
    if (!btn) return { submitted: false, reason: 'no submit', filled };
    btn.click();
    return { submitted: true, filled };
  })()`) as Promise<{ submitted: boolean; reason?: string }>;
}

/**
 * Hook fetch to capture /old/v4/reply status from the page JS context.
 */
async function installReplyProbe(page: PageHandle) {
  await page.evaluate(`(() => {
    if (window.__daftReplyProbe) return true;
    window.__daftReplyProbe = { status: null, body: null };
    const orig = window.fetch;
    window.fetch = async function() {
      const res = await orig.apply(this, arguments);
      try {
        const url = String(arguments[0]?.url || arguments[0] || '');
        if (/\\/old\\/v4\\/reply/i.test(url)) {
          window.__daftReplyProbe.status = res.status;
          window.__daftReplyProbe.body = await res.clone().text().then(t => t.slice(0, 200)).catch(() => '');
        }
      } catch (_) {}
      return res;
    };
    return true;
  })()`);
}

export async function sendEnquiryViaChrome(
  pool: ChromePool,
  input: ChromeEnquiryInput
): Promise<ChromeEnquiryResult> {
  pool.rememberPassword(input.email, input.password);

  return pool.withPage(input.email, input.password, async (page) => {
    await ensureWebLogin(page, input.email, input.password, input.listingUrl);
    await openMessageForm(page, input.listingUrl);
    await installReplyProbe(page);
    const submit = await fillAndSubmit(page, input);
    if (!submit.submitted) {
      return {
        ok: false,
        listingUrl: input.listingUrl,
        detail: submit.reason ?? "submit failed",
      };
    }

    let replyStatus: number | undefined;
    for (let i = 0; i < 20; i++) {
      await pause(500);
      const probe = await page.evaluate<{
        status: number | null;
        body: string | null;
      }>(`window.__daftReplyProbe || { status: null, body: null }`);
      if (probe.status != null) {
        replyStatus = probe.status;
        break;
      }
    }

    const successUi = await page.evaluate<boolean>(
      `/thank you|message sent|enquiry sent|successfully|ad_message_success/i.test(document.body?.innerText || '')`
    );

    const ok =
      (replyStatus != null && replyStatus >= 200 && replyStatus < 300) ||
      successUi;

    return {
      ok,
      listingUrl: input.listingUrl,
      replyStatus,
      detail: ok
        ? "sent"
        : `no success (replyStatus=${replyStatus ?? "none"})`,
    };
  });
}
