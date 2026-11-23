// Build reports/AssetTrack_Final_Report.{md,pdf} from the template, BUG_LOG.md and screenshots.
// Usage: node build-report.mjs   (template: reports/report-template.md)
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { launch } from './lib.mjs';

const R = path.resolve('../reports');
const template = fs.readFileSync(path.join(R, 'report-template.md'), 'utf8');
const bugLog = fs.readFileSync(path.join(R, 'BUG_LOG.md'), 'utf8');
const shots = fs.readdirSync(path.join(R, 'screenshots'));

// --- Bug details: each "## BUG-xx" section from BUG_LOG.md plus its before/after images side by side.
const sections = bugLog.split(/\n(?=## BUG-\d+)/).slice(1);
const bugDetails = sections
  .map((s) => {
    const id = s.match(/## (BUG-\d+)/)[1];
    const before = shots.find((f) => f.startsWith(id + '-') && !f.endsWith('-fixed.png'));
    const after = shots.find((f) => f === `${id}-fixed.png`);
    const body = s.replace(/^## /, '### ').replace(/\n- \*\*(Screenshots|Evidence):\*\*[^\n]*/g, '');
    const imgs = `\n\n<div class="pair"><figure><img src="screenshots/${before}"><figcaption>Before: ${before}</figcaption></figure><figure><img src="screenshots/${after}"><figcaption>After fix: ${after}</figcaption></figure></div>\n`;
    return body.trim() + imgs;
  })
  .join('\n\n');

// --- Working screenshots, in page order (prefix chosen by SHOT_SET, default local).
const set = process.env.SHOT_SET || 'local';
const PAGES = [
  ['01-login', 'Login page (demo-account buttons)'],
  ['login-waking-up', 'Login: "Waking up the server, please wait…" on a slow first request'],
  ['02-dashboard', 'Dashboard: KPI cards, category donut, status bars, warranty tabs, activity feed'],
  ['03-assets-list', 'Assets list: search, filters, sortable columns, status badges, pagination'],
  ['assets-bulk-select', 'Assets list: bulk selection with Export selected and QR labels'],
  ['04-asset-detail-qr', 'Asset detail: fields, QR code, current holder, assignment timeline'],
  ['asset-activity-log', 'Asset detail: activity log after create, assign, return, repair, close'],
  ['05-asset-form-validation', 'Add asset form with validation messages'],
  ['06-assign-dialog', 'Assign dialog'],
  ['return-dialog', 'Return dialog'],
  ['repair-dialog', 'Log repair dialog'],
  ['confirm-retire-dialog', 'Confirm dialog for a destructive action (retire)'],
  ['09-repairs', 'Repairs: list, cost totals, close action'],
  ['07-qr-labels', 'QR labels: selection and printable sheet preview (PDF download)'],
  ['scan-page', 'Scan QR page (camera, photo upload, typed tag)'],
  ['08-import-preview-errors', 'Import/Export: CSV preview with row errors'],
  ['08b-import-result', 'Import result: valid rows imported, bad rows skipped'],
  ['10-reports', 'Reports page (print / PDF)'],
  ['11-users', 'Users (admin only)'],
  ['12-settings', 'Settings / change password'],
  ['viewer-asset-detail-readonly', 'Viewer: asset detail with no edit actions'],
  ['dark-dashboard', 'Dark mode: dashboard'],
  ['mobile-dark-dashboard', 'Mobile (390 px), dark: dashboard'],
  ['mobile-dark-assets', 'Mobile, dark: assets as cards'],
  ['mobile-dark-menu', 'Mobile, dark: navigation drawer'],
];
const screenshotSection = PAGES.filter(([k]) => shots.includes(`${set}-${k}.png`))
  .map(([k, cap]) => `<figure class="shot"><img src="screenshots/${set}-${k}.png"><figcaption>${cap}</figcaption></figure>`)
  .join('\n');

let md = template.replace('{{BUG_DETAILS}}', bugDetails).replace('{{SCREENSHOTS}}', screenshotSection);
// Live-site screenshots: the main flows only (section 7 already shows every page).
const LIVE = ['01-login', '02-dashboard', '03-assets-list', '04-asset-detail-qr', '06-assign-dialog', '09-repairs', '07-qr-labels', '08b-import-result', '10-reports', '11-users', 'viewer-asset-detail-readonly', 'mobile-dark-dashboard'];
const liveSection = LIVE.filter((k) => shots.includes(`live-${k}.png`))
  .map((k) => `<figure class="shot"><img src="screenshots/live-${k}.png"><figcaption>Live: ${(PAGES.find(([p]) => p === k) || [k, k])[1]}</figcaption></figure>`)
  .join('\n');
md = md.replace('{{LIVE_SCREENSHOTS}}', liveSection || '_No live screenshots yet._');
fs.writeFileSync(path.join(R, 'AssetTrack_Final_Report.md'), md);

// --- PDF via Chrome
const css = `
  @page { size: A4; margin: 16mm 14mm 18mm; }
  body { font: 10.5pt/1.5 -apple-system, 'Segoe UI', Inter, Helvetica, Arial, sans-serif; color: #0f172a; }
  h1 { font-size: 24pt; color: #4338ca; margin: 0 0 2pt; }
  h1 + p strong { font-size: 13pt; color: #475569; }
  h2 { font-size: 15pt; color: #312e81; border-bottom: 2px solid #c7d2fe; padding-bottom: 3pt; margin-top: 22pt; break-after: avoid; }
  h3 { font-size: 12pt; color: #1e293b; margin: 18pt 0 4pt; break-after: avoid; }
  h2:not(:first-of-type) { break-before: page; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9pt; break-inside: auto; }
  th, td { border: 1px solid #cbd5e1; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #eef2ff; color: #312e81; }
  tr { break-inside: avoid; }
  code { background: #f1f5f9; padding: 0 3pt; border-radius: 3px; font-size: 8.8pt; }
  pre { background: #0f172a; color: #e2e8f0; padding: 8pt 10pt; border-radius: 6px; font-size: 8.5pt; white-space: pre-wrap; }
  pre code { background: none; color: inherit; padding: 0; }
  ul { padding-left: 16pt; } li { margin: 1pt 0; }
  hr { border: 0; border-top: 1px solid #e2e8f0; margin: 14pt 0; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; break-inside: avoid; margin: 6pt 0 4pt; }
  figure { margin: 0; break-inside: avoid; }
  figure img { width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; }
  .pair img { max-height: 250pt; object-fit: contain; object-position: top; background: #f8fafc; }
  figcaption { font-size: 8pt; color: #64748b; margin-top: 2pt; }
  .shot { margin: 8pt 0 14pt; }
  .shot img { max-height: 470pt; object-fit: contain; object-position: top left; }
  a { color: #4338ca; }
`;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>AssetTrack Final Report</title><style>${css}</style></head><body>${marked.parse(md)}</body></html>`;
const htmlPath = path.join(R, '.report.html');
fs.writeFileSync(htmlPath, html);
const browser = await launch();
const page = await browser.newPage();
await page.goto('file://' + htmlPath, { waitUntil: 'load' });
await page.evaluate(async () => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r))))));
const missing = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')));
if (missing.length) console.warn('Missing images:', missing);
await page.pdf({
  path: path.join(R, 'AssetTrack_Final_Report.pdf'),
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: '<div style="font-size:7.5pt;color:#94a3b8;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>AssetTrack v1.0.0 · Final Report · Divya Priyadharshini</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
  margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
});
await browser.close();
fs.unlinkSync(htmlPath);
console.log(`Report written: ${sections.length} bugs, ${screenshotSection.split('<figure').length - 1} page screenshots, missing images: ${missing.length}`);
