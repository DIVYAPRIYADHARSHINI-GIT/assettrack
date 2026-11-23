// Render a Markdown file in reports/ to PDF with the report styling.
// Usage: node md-to-pdf.mjs AssetTrack_Whats_New.md "Footer text"
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { launch } from './lib.mjs';

const [file, footer = 'AssetTrack'] = process.argv.slice(2);
const R = path.resolve('../reports');
const md = fs.readFileSync(path.join(R, file), 'utf8');
const css = `
  body { font: 10.5pt/1.5 -apple-system, 'Segoe UI', Inter, Helvetica, Arial, sans-serif; color: #0f172a; }
  h1 { font-size: 24pt; color: #4338ca; margin: 0 0 2pt; }
  h1 + p strong { font-size: 13pt; color: #475569; }
  h2 { font-size: 15pt; color: #312e81; border-bottom: 2px solid #c7d2fe; padding-bottom: 3pt; margin-top: 20pt; break-after: avoid; }
  h3 { font-size: 12pt; color: #1e293b; margin: 14pt 0 4pt; break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9pt; }
  th, td { border: 1px solid #cbd5e1; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #eef2ff; color: #312e81; }
  tr { break-inside: avoid; }
  code { background: #f1f5f9; padding: 0 3pt; border-radius: 3px; font-size: 8.8pt; }
  blockquote { margin: 10pt 0; padding: 8pt 12pt; background: #eef2ff; border-left: 4px solid #6366f1; border-radius: 4px; }
  blockquote p { margin: 0; }
  ul { padding-left: 16pt; } li { margin: 2pt 0; }
  hr { border: 0; border-top: 1px solid #e2e8f0; margin: 14pt 0; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; break-inside: avoid; margin: 6pt 0; }
  figure { margin: 0; break-inside: avoid; }
  figure img { width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; }
  .pair img { max-height: 200pt; object-fit: contain; object-position: top; background: #f8fafc; }
  .shot { margin: 8pt 0 12pt; } .shot img { max-height: 330pt; object-fit: contain; object-position: top left; }
  figcaption { font-size: 8pt; color: #64748b; margin-top: 2pt; }
  a { color: #4338ca; }
`;
const htmlPath = path.join(R, '.tmp-render.html');
fs.writeFileSync(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${marked.parse(md)}</body></html>`);
const browser = await launch();
const page = await browser.newPage();
await page.goto('file://' + htmlPath, { waitUntil: 'load' });
const missing = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')));
const out = path.join(R, file.replace(/\.md$/, '.pdf'));
await page.pdf({
  path: out,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `<div style="font-size:7.5pt;color:#94a3b8;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>${footer}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
});
await browser.close();
fs.unlinkSync(htmlPath);
console.log(`Wrote ${out}; missing images: ${missing.length ? missing.join(', ') : 0}`);
