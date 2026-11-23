// Diagnose horizontal overflow: list the deepest elements whose right edge exceeds the viewport.
import { BASE, launch, login, newPage, sleep } from './lib.mjs';

const paths = process.argv.slice(2);
const browser = await launch();
const page = await newPage(browser, { width: 390, height: 844, mobile: true });
await login(page, 'admin@assettrack.com', 'Admin@123');
for (const p of paths) {
  await page.goto(BASE + p, { waitUntil: 'networkidle2' });
  await sleep(400);
  const out = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const clipped = (e) => {
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') return true;
      }
      return false;
    };
    return [...document.querySelectorAll('body *')]
      .filter((e) => e.getBoundingClientRect().right > vw + 1 && e.offsetParent !== null && !clipped(e))
      .filter((e) => ![...e.children].some((c) => c.getBoundingClientRect().right > vw + 1))
      .slice(0, 6)
      .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 70)} right=${Math.round(e.getBoundingClientRect().right)} text="${e.textContent.trim().slice(0, 30)}"`);
  });
  console.log(p, '\n  ' + out.join('\n  '));
}
await browser.close();
