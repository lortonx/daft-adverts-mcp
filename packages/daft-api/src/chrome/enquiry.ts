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
  await page.waitCfGone();
  await page.acceptCookies();
  await pause(1500);
  onAuth = await page.evaluate<boolean>(
    `location.hostname.includes('auth.daft.ie')`
  );
  if (onAuth) return;

  await page.navigate(listingUrl, 4000);
  await page.waitCfGone();
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
  await page.waitCfGone();
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
  await page.waitCfGone();
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

/** React-controlled inputs ignore plain .value — use native setter + InputEvent. */
async function setReactValue(page: PageHandle, selector: string, value: string) {
  if (!value) return;
  const sel = JSON.stringify(selector);
  const val = JSON.stringify(value);
  await page.evaluate(`(() => {
    const el = document.querySelector(${sel});
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    el.focus();
    if (setter) setter.call(el, ${val});
    else el.value = ${val};
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ${val}, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

async function fillAndSubmit(
  page: PageHandle,
  input: ChromeEnquiryInput
): Promise<{ submitted: boolean; reason?: string; alreadyEnquired?: boolean }> {
  const already = await page.evaluate<boolean>(
    `/already enquired/i.test(document.body?.innerText || '')`
  );

  await setReactValue(page, 'input[name="firstName"]', input.firstName ?? "");
  await setReactValue(page, 'input[name="lastName"]', input.lastName ?? "");
  await setReactValue(
    page,
    'input[name="email"]',
    input.contactEmail ?? input.email
  );
  await setReactValue(page, 'input[name="phone"]', input.phone ?? "");
  await setReactValue(page, 'textarea[name="message"]', input.message);

  // Optional pets radios — pick "No" when present so validation isn't stuck.
  await page.evaluate(`(() => {
    const no = [...document.querySelectorAll('input[type=radio]')].find(r =>
      /\\bno\\b/i.test((r.labels?.[0]?.innerText || r.parentElement?.innerText || '') + ' ' + r.value));
    if (no && !no.checked) no.click();
  })()`);

  await page.evaluate(`(() => {
    const tc = [...document.querySelectorAll('input[type=checkbox]')].find(c =>
      /term|agree|tc|privacy|accept/i.test((c.name||'')+(c.id||'')+(c.parentElement?.innerText||'')));
    if (tc && !tc.checked) tc.click();
  })()`);

  const result = await page.evaluate<{
    submitted: boolean;
    reason?: string;
    filled?: Record<string, string>;
  }>(`(() => {
    const byName = (n) => document.querySelector('input[name="'+n+'"], textarea[name="'+n+'"]');
    const filled = {
      firstName: byName('firstName')?.value || '',
      lastName: byName('lastName')?.value || '',
      email: byName('email')?.value || '',
      message: (byName('message')?.value || '').slice(0, 40),
    };
    if (!filled.message) return { submitted: false, reason: 'no message field', filled };
    const btn = [...document.querySelectorAll('button, input[type=submit]')]
      .find(b => /^\\s*SEND\\s*$/i.test((b.innerText||b.value||'').trim())
        || /send|submit|enquire/i.test((b.innerText||b.value||'')));
    if (!btn) return { submitted: false, reason: 'no submit', filled };
    btn.click();
    return { submitted: true, filled };
  })()`);

  return { ...result, alreadyEnquired: already };
}

/**
 * Hook fetch to capture /old/v4/reply status from the page JS context.
 */
async function installReplyProbe(page: PageHandle) {
  await page.evaluate(`(() => {
    if (window.__daftReplyProbe) return true;
    window.__daftReplyProbe = { status: null, body: null };
    const note = (url, status, body) => {
      if (!/\\/old\\/v4\\/reply/i.test(String(url||''))) return;
      window.__daftReplyProbe.status = status;
      window.__daftReplyProbe.body = String(body||'').slice(0, 200);
    };
    const orig = window.fetch;
    window.fetch = async function() {
      const res = await orig.apply(this, arguments);
      try {
        const url = String(arguments[0]?.url || arguments[0] || '');
        note(url, res.status, await res.clone().text().catch(() => ''));
      } catch (_) {}
      return res;
    };
    const XO = XMLHttpRequest.prototype.open;
    const XS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(m, u) {
      this.__daftUrl = u;
      return XO.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
      this.addEventListener('load', function() {
        try { note(this.__daftUrl, this.status, this.responseText); } catch (_) {}
      });
      return XS.apply(this, arguments);
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
    for (let i = 0; i < 30; i++) {
      await pause(500);
      const probe = await page.evaluate<{
        status: number | null;
        body: string | null;
      }>(`window.__daftReplyProbe || { status: null, body: null }`);
      if (probe.status != null && probe.status > 0) {
        replyStatus = probe.status;
        break;
      }
    }

    const ui = await page.evaluate<{
      success: boolean;
      already: boolean;
      required: boolean;
    }>(`({
      success: /thank you|message sent|enquiry sent|successfully|ad_message_success/i.test(document.body?.innerText || ''),
      already: /already enquired/i.test(document.body?.innerText || ''),
      required: /\\brequired\\b/i.test(
        [...document.querySelectorAll('[class*=error], [class*=Error], [role=alert]')]
          .map(e => e.innerText).join(' ')
      ),
    })`);

    if (ui.already && replyStatus == null) {
      return {
        ok: true,
        listingUrl: input.listingUrl,
        detail: "already_enquired",
      };
    }

    const ok =
      (replyStatus != null && replyStatus >= 200 && replyStatus < 300) ||
      ui.success;

    return {
      ok,
      listingUrl: input.listingUrl,
      replyStatus,
      detail: ok
        ? "sent"
        : ui.required
          ? "form validation failed (required fields)"
          : `no success (replyStatus=${replyStatus ?? "none"})`,
    };
  });
}
