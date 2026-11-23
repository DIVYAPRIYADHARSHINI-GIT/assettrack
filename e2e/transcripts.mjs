// Render API-bug transcripts (reports/evidence/*.txt) as screenshots for the report.
import fs from 'node:fs';
import { launch, SHOTS } from './lib.mjs';
const ev = '../reports/evidence';
const items = [
  ['BUG-01-before.txt', 'BUG-01-assign-optional-notes-400.png', 'BUG-01 (before) - POST /api/assets/:id/assign without conditionNotes', '#b91c1c'],
  ['BUG-01-after.txt', 'BUG-01-fixed.png', 'BUG-01 (after fix) - same request returns 201 Created', '#047857'],
  ['BUG-02-before.txt', 'BUG-02-csv-date-error-unclear.png', 'BUG-02 (before) - CSV import error for an invalid date', '#b91c1c'],
  ['BUG-02-after.txt', 'BUG-02-fixed.png', 'BUG-02 (after fix) - clear date error message', '#047857'],
];
const b = await launch(); const p = await b.newPage();
await p.setViewport({ width: 1100, height: 300, deviceScaleFactor: 1 });
for (const [src, out, title, color] of items) {
  const body = fs.readFileSync(`${ev}/${src}`, 'utf8').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  await p.setContent(`<body style="margin:0;font-family:-apple-system,Segoe UI,sans-serif;background:#0f172a"><div style="padding:14px 20px;background:${color};color:#fff;font-weight:600">${title}</div><pre style="margin:0;padding:20px;color:#e2e8f0;font:13px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all">${body}</pre></body>`);
  const h = await p.evaluate(() => document.body.scrollHeight);
  await p.setViewport({ width: 1100, height: h });
  await p.screenshot({ path: `${SHOTS}/${out}` });
}
await b.close();
