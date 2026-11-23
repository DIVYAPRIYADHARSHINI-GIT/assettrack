// Word (.docx) version-comparison report in the shared template layout:
// centred bold title, three numbered bold headings, bullet points, screenshot links.
// Usage: node make-version-docx.mjs
import fs from 'node:fs';
import path from 'node:path';
import { AlignmentType, Document, ExternalHyperlink, ImageRun, LevelFormat, Packer, Paragraph, TextRun } from 'docx';

const OUT = path.resolve('../reports/AssetTrack_Version_Comparison_Report.docx');
const REPO = 'https://github.com/DIVYAPRIYADHARSHINI-GIT/assettrack';
const SHOT = (f) => `${REPO}/blob/main/reports/screenshots/version/${f}`;
const SHOT_DIR = path.resolve('../reports/screenshots/version');
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
/** PNG pixel size from the IHDR chunk. */
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

/** Bullet: bold lead-in, plain text, one "Screenshot" link per image; each image embedded below it. */
const bullet = (lead, text, shots = []) => {
  shots = [].concat(shots);
  const links = shots.flatMap((s, i) => [run(' '), link(shots.length > 1 ? `Screenshot ${i + 1}` : 'Screenshot', SHOT(s))]);
  const out = [
    new Paragraph({
      numbering: { reference: 'bullets', level: 0 },
      spacing: { after: 60 },
      children: [...(lead ? [run(`${lead}: `, { bold: true })] : []), run(text), ...links],
    }),
  ];
  for (const s of shots) {
    const data = fs.readFileSync(path.join(SHOT_DIR, s));
    const { w, h } = pngSize(data);
    const width = 440; // points-ish (docx uses pixels at 96 dpi); fits the 6.5 in text column
    const height = Math.min(Math.round((h / w) * width), 560);
    out.push(
      new Paragraph({
        indent: { left: 720 },
        spacing: { after: 40 },
        children: [new ImageRun({ type: 'png', data, transformation: { width: Math.round((height / ((h / w) * width)) * width), height } })],
      }),
      new Paragraph({ indent: { left: 720 }, spacing: { after: 160 }, children: [run(s, { italics: true, size: 16, color: '666666' })] }),
    );
  }
  return out;
};

const improved = [
  ['Live deployment', 'AssetTrack is now live on Render (free plan) at https://assettrack-99iv.onrender.com, health check /api/health. The older version was not deployed anywhere.', ['VC-1-01a-live-dashboard.png', 'VC-1-01b-live-health.png']],
  ['No-account database', 'Switched from PostgreSQL (needed a Neon account and connection strings) to SQLite through Prisma. The database is created, migrated and seeded automatically on first start, and sample data is added only when it is empty.', 'VC-1-02-sqlite-database.png'],
  ['One service, one URL', 'The Express backend now serves the built React website too, so the app and the API share one address. Direct links and refreshes of pages such as /assets/12 and scanned /scan/AT-0001 links work.', ['VC-1-03a-deep-link-asset.png', 'VC-1-03b-one-service-routing.png']],
  ['One-click deploy', 'Added render.yaml (Render Blueprint) and root build/start scripts. Render generates the JWT secret itself; no secrets are typed or shared.', 'VC-1-04-render-blueprint.png'],
  ['Security for the served website', 'Content-Security-Policy tuned for the app (script hash computed at start-up, data:/blob: for QR codes and camera); CORS always allows the site\u2019s own address and blocks other origins.', 'VC-1-05-security-headers.png'],
  ['Fixed BUG-07 (High)', 'Refreshing an asset page returned HTTP 500 on the one-service build. Now fixed.', 'VC-1-06-bug07-fixed.png'],
  ['Fixed BUG-08 (High)', 'The production build called the local test server, so sign-in would have failed on the live site. It now calls its own address.', 'VC-1-07-bug08-fixed.png'],
  ['Documentation and reports', 'Added the README, the final report (PDF + Markdown), a bug log for all 8 bugs, a What\u2019s New report and 66 screenshots.', 'VC-1-08-docs-and-reports.png'],
  ['Testing', 'The same 36 browser checks now pass on the local build, a fresh GitHub clone, the one-service production build and the live site; the 18 API tests pass on SQLite. Failed checks now save screenshots automatically.', 'VC-1-09-testing.png'],
  ['Unchanged for users', 'Same 12 pages, 40 API endpoints, Admin/Viewer roles, workflows, light/dark mode and mobile layout. The only frontend source change is how the API address is resolved.', ['VC-1-10-unchanged-assets-list.png', 'VC-1-10b-unchanged-ui.png']],
];

const scope = [
  ['Persistent live data', 'On Render\u2019s free plan the SQLite file resets to the sample data on every restart, redeploy or wake from sleep. Add a Render disk (paid) or switch the Prisma provider back to PostgreSQL (the model was first built and tested on it).', 'VC-2-01-data-resets.png'],
  ['Cold start', 'The free instance sleeps after about 15 minutes idle and takes up to a minute to wake. The login page shows a notice (screenshot), but a paid instance or keep-warm plan would remove the wait.', 'VC-2-02-cold-start-notice.png'],
  ['Match the original brief', 'The brief asked for Neon PostgreSQL plus a separate static frontend host. The current version uses SQLite and one service at the owner\u2019s request; return to that layout when accounts are available.', 'VC-2-03-brief-gap.png'],
  ['Email reminders', 'Notify admins about warranties expiring within 30 days and overdue returns. Today the expiry list is only on the dashboard (screenshot).', 'VC-2-04-email-reminders-warranty.png'],
  ['Attachments', 'Store invoices and photos per asset in object storage. The asset page (screenshot) has no attachments section yet.', 'VC-2-05-attachments-asset-detail.png'],
  ['Employee view', 'Add an employee directory with an \u201cassets held by person\u201d page and self-service acknowledgement. Today you search by name in the assets list (screenshot).', 'VC-2-06-employee-view-holder-search.png'],
  ['Depreciation', 'Calculate depreciation and show asset value over time. Today reports show purchase value only (screenshot).', 'VC-2-07-depreciation-value-kpi.png'],
  ['Audit export', 'Export the activity log and filter it per user. Today the log is viewable per asset only (screenshot).', 'VC-2-08-audit-export-activity.png'],
  ['Bundle size', 'The PDF library already loads only when a PDF is created; the charts bundle could also be loaded on demand to speed up the first page (sizes in the screenshot).', 'VC-2-09-bundle-size.png'],
];

const team = [
  ['Divya Priyadharshini', 'AssetTrack: full-stack build (React frontend, Express + Prisma API), testing, Render deployment and reports.', 'VC-3-01-divya-assettrack.png'],
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
        ...improved.flatMap(([l, t, s]) => bullet(l, t, s)),
        heading(2, `Scope of improvement in version [${CURR_ID}]`),
        ...scope.flatMap(([l, t, s]) => bullet(l, t, s)),
        heading(3, 'Products team members are working on'),
        note('One line per team member. Point each Screenshot link to that member\u2019s screenshot URL.'),
        ...team.flatMap(([l, t, s]) => bullet(l, t, s)),
        new Paragraph({ spacing: { before: 360 }, children: [run('Repository: ', { bold: true, size: 18 }), new ExternalHyperlink({ link: REPO, children: [new TextRun({ text: REPO, font: FONT, size: 18, style: 'Hyperlink' })] })] }),
        new Paragraph({ children: [run('Live site: ', { bold: true, size: 18 }), new ExternalHyperlink({ link: 'https://assettrack-99iv.onrender.com', children: [new TextRun({ text: 'https://assettrack-99iv.onrender.com', font: FONT, size: 18, style: 'Hyperlink' })] })] }),
        new Paragraph({ children: [run('Prepared by Divya Priyadharshini \u00b7 23 November 2026', { italics: true, size: 18, color: '666666' })] }),
      ],
    },
  ],
});

fs.writeFileSync(OUT, await Packer.toBuffer(doc));
console.log('Wrote', OUT);
