// Exploratory pass: visit every page as admin and viewer, at desktop + mobile, light + dark.
// Prints console errors, failed requests and horizontal overflow per page; saves screenshots to .explore/.
import { BASE, launch, login, newPage, overflowX, sleep } from './lib.mjs';
import fs from 'node:fs';

const OUT = '.explore';
fs.mkdirSync(OUT, { recursive: true });
const PAGES = ['/', '/assets', '/assets/1', '/assets/new', '/assets/1/edit', '/repairs', '/qr-labels?ids=1,2,3', '/scan', '/import-export', '/reports', '/users', '/settings', '/nope'];

const browser = await launch();
for (const [role, email, pw] of [['admin', 'admin@assettrack.com', 'Admin@123'], ['viewer', 'viewer@assettrack.com', 'Viewer@123']]) {
  for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844, mobile: true }]) {
    for (const dark of [false, true]) {
      const page = await newPage(browser, { ...vp, dark });
      await login(page, email, pw);
      for (const p of PAGES) {
        page.problems.length = 0;
        await page.goto(BASE + p, { waitUntil: 'networkidle2' });
        await sleep(400);
        const ox = await overflowX(page);
        const tag = `${role}-${vp.name}-${dark ? 'dark' : 'light'}${p.replace(/[/?=,]/g, '_') || '_root'}`;
        await page.screenshot({ path: `${OUT}/${tag}.png` });
        const issues = [...page.problems, ...(ox > 1 ? [`overflow-x ${ox}px`] : [])];
        const final = new URL(page.url()).pathname;
        console.log(`${issues.length ? 'ISSUE' : 'ok   '} ${tag} -> ${final}${issues.length ? '\n      ' + issues.join('\n      ') : ''}`);
      }
      await page.close();
    }
  }
}
await browser.close();
