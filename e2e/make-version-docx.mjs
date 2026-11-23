// Word (.docx) version-comparison report in the shared template layout:
// centred bold title, three numbered bold headings, bullet points, screenshot links.
// Usage: node make-version-docx.mjs
import fs from 'node:fs';
import path from 'node:path';
import { AlignmentType, Document, ExternalHyperlink, LevelFormat, Packer, Paragraph, TextRun } from 'docx';

const OUT = path.resolve('../reports/AssetTrack_Version_Comparison_Report.docx');
const REPO = 'https://github.com/DIVYAPRIYADHARSHINI-GIT/assettrack';
const SHOT = (f) => `${REPO}/blob/main/reports/screenshots/${f}`;
// The repo has no release tags, so versions are identified by commit.
const PREV_ID = '4d3b9dd';
const CURR_ID = '7b53fc6';
const PREV = `${PREV_ID} (first GitHub push, 23 Nov 2026 11:28 IST)`;
const CURR = `${CURR_ID} (live release, 23 Nov 2026 12:29 IST)`;

const FONT = 'Calibri';
const run = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size ?? 20, bold: o.bold, italics: o.italics, color: o.color });
const link = (text, url) =>
  new ExternalHyperlink({ link: url, children: [new TextRun({ text, font: FONT, size: 20, bold: true, style: 'Hyperlink' })] });

const title = (t) =>
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 360 }, children: [run(t, { bold: true, size: 26 })] });
const heading = (n, t) => new Paragraph({ spacing: { before: 280, after: 80 }, children: [run(`${n}. ${t}`, { bold: true, size: 21 })] });
const note = (t) => new Paragraph({ indent: { left: 360 }, spacing: { after: 80 }, children: [run(t, { italics: true, size: 18, color: '444444' })] });
/** Bullet: bold lead-in, then plain text. Optional trailing screenshot link. */
const bullet = (lead, text, shot) =>
  new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 70 },
    children: [
      ...(lead ? [run(`${lead}: `, { bold: true })] : []),
      run(text),
      ...(shot ? [run(' '), link('Screenshot', SHOT(shot))] : []),
    ],
  });

const improved = [
  ['Live deployment', 'AssetTrack is now live on Render (free plan) at https://assettrack-99iv.onrender.com, health check /api/health. The older version was not deployed anywhere.', 'live-02-dashboard.png'],
  ['No-account database', 'Switched from PostgreSQL (needed a Neon account and connection strings) to SQLite through Prisma. The database is created, migrated and seeded automatically on first start, and sample data is added only when it is empty.'],
  ['One service, one URL', 'The Express backend now serves the built React website too, so the app and the API share one address. Direct links and refreshes of pages such as /assets/12 and scanned /scan/AT-0001 links work.', 'live-04-asset-detail-qr.png'],
  ['One-click deploy', 'Added render.yaml (Render Blueprint) and root build/start scripts. Render generates the JWT secret itself; no secrets are typed or shared.'],
  ['Security for the served website', 'Content-Security-Policy tuned for the app (script hash computed at start-up, data:/blob: for QR codes and camera); CORS always allows the site\u2019s own address.'],
  ['Fixed BUG-07 (High)', 'Refreshing an asset page returned HTTP 500 on the one-service build. Now fixed.', 'BUG-07-fixed.png'],
  ['Fixed BUG-08 (High)', 'The production build called the local test server, so sign-in would have failed on the live site. It now calls its own address.', 'BUG-08-fixed.png'],
  ['Documentation and reports', 'Added the README, the final report (PDF + Markdown), a bug log for all 8 bugs, a What\u2019s New report and 66 screenshots.'],
  ['Testing', 'The same 36 browser checks now pass on the local build, a fresh GitHub clone, the one-service production build and the live site; the 18 API tests pass on SQLite. Failed checks now save screenshots automatically.', 'live-08b-import-result.png'],
  ['Unchanged for users', 'Same 12 pages, 40 API endpoints, Admin/Viewer roles, workflows, light/dark mode and mobile layout.'],
];

const scope = [
  ['Persistent live data', 'On Render\u2019s free plan the SQLite file resets to the sample data on every restart, redeploy or wake from sleep. Add a Render disk (paid) or switch the Prisma provider back to PostgreSQL (the model was first built and tested on it).'],
  ['Cold start', 'The free instance sleeps after about 15 minutes idle and takes up to a minute to wake. The login page shows a notice, but a paid instance or keep-warm plan would remove the wait.'],
  ['Match the original brief', 'The brief asked for Neon PostgreSQL plus a separate static frontend host. The current version uses SQLite and one service at the owner\u2019s request; return to that layout when accounts are available.'],
  ['Email reminders', 'Notify admins about warranties expiring within 30 days and overdue returns.'],
  ['Attachments', 'Store invoices and photos per asset in object storage.'],
  ['Employee view', 'Add an employee directory with an \u201cassets held by person\u201d page and self-service acknowledgement.'],
  ['Depreciation', 'Calculate depreciation and show asset value over time on the dashboard.'],
  ['Audit export', 'Export the activity log and filter it per user.'],
  ['Bundle size', 'The PDF library (about 235 kB gzipped) already loads only when a PDF is created; the charts bundle (about 126 kB gzipped) could also be loaded on demand to speed up the first page.'],
];

const team = [
  ['Divya Priyadharshini', 'AssetTrack: full-stack build (React frontend, Express + Prisma API), testing, Render deployment and reports.', 'live-02-dashboard.png'],
];

const doc = new Document({
  creator: 'Divya Priyadharshini',
  title: 'AssetTrack Version Comparison Report (Software)',
  styles: { default: { document: { run: { font: FONT, size: 20 } } } },
  numbering: {
    config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 300 } } } }] }],
  },
  sections: [
    {
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children: [
        title('AssetTrack Version Comparison Report (Software)'),
        heading(1, `Improved areas in version ${CURR} compared to older version ${PREV}`),
        ...improved.map(([l, t, s]) => bullet(l, t, s)),
        heading(2, `Scope of improvement in version [${CURR_ID}]`),
        ...scope.map(([l, t]) => bullet(l, t)),
        heading(3, 'Products team members are working on'),
        note('One line per team member. Point each Screenshot link to that member\u2019s screenshot URL.'),
        ...team.map(([l, t, s]) => bullet(l, t, s)),
        new Paragraph({ spacing: { before: 360 }, children: [run('Repository: ', { bold: true, size: 18 }), new ExternalHyperlink({ link: REPO, children: [new TextRun({ text: REPO, font: FONT, size: 18, style: 'Hyperlink' })] })] }),
        new Paragraph({ children: [run('Live site: ', { bold: true, size: 18 }), new ExternalHyperlink({ link: 'https://assettrack-99iv.onrender.com', children: [new TextRun({ text: 'https://assettrack-99iv.onrender.com', font: FONT, size: 18, style: 'Hyperlink' })] })] }),
        new Paragraph({ children: [run('Prepared by Divya Priyadharshini \u00b7 23 November 2026', { italics: true, size: 18, color: '666666' })] }),
      ],
    },
  ],
});

fs.writeFileSync(OUT, await Packer.toBuffer(doc));
console.log('Wrote', OUT);
