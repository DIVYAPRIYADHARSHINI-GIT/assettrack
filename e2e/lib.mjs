// Shared helpers for the AssetTrack browser checks (puppeteer-core + installed Chrome).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

export const BASE = process.env.BASE_URL || 'http://localhost:5173';
export const SHOTS = path.resolve(process.env.SHOTS_DIR || '../reports/screenshots');
export const DOWNLOADS = path.resolve('.downloads');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(DOWNLOADS, { recursive: true });

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: path.resolve('.chrome-profile-' + process.pid),
    protocolTimeout: 120_000,
    args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--window-size=1440,900'],
  });
}

/** New page with console/network error capture. */
export async function newPage(browser, { width = 1440, height = 900, dark = false, mobile = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  page.problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error') page.problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText || '';
    if (!f.includes('ERR_ABORTED')) page.problems.push(`requestfailed: ${r.url()} ${f}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 500) page.problems.push(`HTTP ${r.status()}: ${r.url()}`);
    else if (r.status() >= 400) (page.clientErrors ||= []).push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  // Accept "leave site?" (beforeunload) and confirm prompts so navigation never blocks.
  page.dialogs = [];
  page.on('dialog', async (d) => {
    page.dialogs.push(`${d.type()}: ${d.message()}`);
    await d.accept().catch(() => {});
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS, eventsEnabled: true }).catch(() => {});
  // Set the starting theme once per tab (sessionStorage survives reloads), so the app's own toggle can persist.
  await page.evaluateOnNewDocument((d) => {
    if (!sessionStorage.getItem('e2e-theme-init')) {
      localStorage.setItem('assettrack-theme', d ? 'dark' : 'light');
      sessionStorage.setItem('e2e-theme-init', '1');
    }
  }, dark);
  return page;
}

export async function shot(page, name, { fullPage = false } = {}) {
  await new Promise((r) => setTimeout(r, 250));
  const file = path.join(SHOTS, name.endsWith('.png') ? name : `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  return file;
}

export async function login(page, email, password) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.removeItem('assettrack-token'));
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
  await page.type('#email', email);
  await page.type('#password', password);
  await Promise.all([page.waitForFunction(() => location.pathname !== '/login', { timeout: 90_000 }), page.click('button[type=submit]')]);
  await page.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click the first visible button/link whose text includes `text`. */
export async function clickText(page, text, selector = 'button, a, [role=tab], label') {
  const ok = await page.evaluate(
    (text, selector) => {
      const els = [...document.querySelectorAll(selector)].filter((e) => e.offsetParent !== null && e.textContent.trim().includes(text));
      const el = els.find((e) => !e.disabled) || els[0];
      if (!el) return false;
      el.click();
      return true;
    },
    text,
    selector,
  );
  if (!ok) throw new Error(`No clickable element with text "${text}"`);
  await sleep(150);
}

export async function text(page) {
  return page.evaluate(() => document.body.innerText);
}

export async function waitText(page, t, timeout = 15_000) {
  // innerText applies CSS text-transform, so compare case-insensitively.
  await page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, t);
}

/** Fill an input/select/textarea inside the open dialog by its label text. */
export async function fillByLabel(page, label, value, scope = '[role=dialog]') {
  const ok = await page.evaluate(
    (label, value, scope) => {
      const root = document.querySelector(scope) || document;
      const lab = [...root.querySelectorAll('label')].find((l) => l.textContent.trim().replace(/\s*\*$/, '').startsWith(label));
      const el = lab?.parentElement?.querySelector('input,select,textarea');
      if (!el) return false;
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    label,
    value,
    scope,
  );
  if (!ok) throw new Error(`No field labelled "${label}"`);
}

/** Checker; pass `pages()` returning the open pages so a failure screenshots each of them. */
export function makeChecker(pages = () => []) {
  const results = [];
  let n = 0;
  return {
    results,
    async check(name, fn) {
      try {
        await fn();
        results.push({ name, ok: true });
        console.log(`  PASS ${name}`);
      } catch (e) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
        const prefix = process.env.SHOT_PREFIX ? `${process.env.SHOT_PREFIX}-` : '';
        const files = [];
        for (const [i, p] of pages().entries()) {
          if (!p || p.isClosed()) continue;
          const f = `${prefix}FAIL-${String(++n).padStart(2, '0')}-${slug}-${i}.png`;
          await p.screenshot({ path: path.join(SHOTS, f) }).then(() => files.push(f)).catch(() => {});
        }
        results.push({ name, ok: false, error: e.message, screenshots: files });
        console.log(`  FAIL ${name}: ${e.message.split('\n')[0]}`);
      }
    },
  };
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Horizontal overflow in px (layout bug detector for mobile). */
export async function overflowX(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
