// Print widths of each ancestor of the first `selector` match (overflow diagnosis).
import { BASE, launch, login, newPage, sleep } from './lib.mjs';

const [p, selector] = process.argv.slice(2);
const browser = await launch();
const page = await newPage(browser, { width: 390, height: 844, mobile: true });
await login(page, 'admin@assettrack.com', 'Admin@123');
await page.goto(BASE + p, { waitUntil: 'networkidle2' });
await sleep(400);
console.log(
  await page.evaluate((sel) => {
    const out = [`scrollWidth=${document.documentElement.scrollWidth} client=${document.documentElement.clientWidth}`];
    for (let e = document.querySelector(sel); e; e = e.parentElement) {
      const r = e.getBoundingClientRect();
      out.push(`${e.tagName.toLowerCase()}.${String(e.className).slice(0, 60)} w=${Math.round(r.width)} sw=${e.scrollWidth} ox=${getComputedStyle(e).overflowX} disp=${getComputedStyle(e).display}`);
    }
    return out.join('\n');
  }, selector),
);
await browser.close();
