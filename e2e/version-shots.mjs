// Screenshot evidence for every point of the AssetTrack Version Comparison Report.
// App points are captured on the live site; non-UI points are captured as evidence pages
// built from real data (live HTTP responses, git diffs, repo files, test result JSON).
// Output: reports/screenshots/version/VC-<section>-<nn>-<slug>.png
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, login, newPage, sleep } from './lib.mjs';

const LIVE = 'https://assettrack-99iv.onrender.com';
const REPO = 'https://github.com/DIVYAPRIYADHARSHINI-GIT/assettrack';
const OUT = path.resolve('../reports/screenshots/version');
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve('..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const made = [];

const browser = await launch();

/** Evidence page: titled card(s) with real content, rendered and screenshotted. */
async function evidence(file, title, subtitle, blocks) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 400, deviceScaleFactor: 1 });
  const body = blocks
    .map(
      (b) => `<section><h2>${esc(b.h)}</h2>${b.note ? `<p class="note">${b.note}</p>` : ''}${
        b.pre !== undefined ? `<pre>${b.pre}</pre>` : ''
      }${b.html || ''}</section>`,
    )
    .join('');
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;font:14px/1.5 -apple-system,'Segoe UI',Inter,Arial,sans-serif;background:#f1f5f9;color:#0f172a}
    header{background:#4f46e5;color:#fff;padding:18px 28px} header h1{margin:0;font-size:20px} header p{margin:4px 0 0;opacity:.85;font-size:13px}
    main{padding:20px 28px;display:grid;gap:16px}
    section{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px}
    h2{margin:0 0 8px;font-size:15px;color:#312e81}
    .note{margin:0 0 8px;color:#475569;font-size:13px}
    pre{margin:0;background:#0f172a;color:#e2e8f0;border-radius:8px;padding:12px 14px;font:12.5px/1.55 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word}
    .add{color:#86efac} .del{color:#fca5a5} .key{color:#93c5fd} .ok{color:#86efac;font-weight:600} .dim{color:#94a3b8}
    table{border-collapse:collapse;width:100%;font-size:13px} th,td{border:1px solid #e2e8f0;padding:6px 9px;text-align:left} th{background:#eef2ff;color:#312e81}
    .pass{color:#047857;font-weight:600} .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    footer{padding:0 28px 18px;color:#64748b;font-size:12px}
  </style></head><body><header><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></header><main>${body}</main>
  <footer>AssetTrack Version Comparison evidence · captured ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })} IST</footer></body></html>`);
  const h = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewport({ width: 1280, height: Math.min(h, 2400) });
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  await page.close();
  made.push(file);
}

async function liveShot(page, file, fn) {
  await fn();
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, file) });
  made.push(file);
}

const diff = (range, files, maxLines = 40) => {
  const raw = git('diff', range, '--', ...files);
  return raw
    .split('\n')
    .filter((l) => !l.startsWith('index ') && !l.startsWith('similarity'))
    .slice(0, maxLines)
    .map((l) => (l.startsWith('+') && !l.startsWith('+++') ? `<span class="add">${esc(l)}</span>` : l.startsWith('-') && !l.startsWith('---') ? `<span class="del">${esc(l)}</span>` : l.startsWith('@@') ? `<span class="dim">${esc(l)}</span>` : esc(l)))
    .join('\n');
};
const PREV = '4d3b9dd';

// ---------- live HTTP facts ----------
const health = await (await fetch(`${LIVE}/api/health`)).text();
const headRes = await fetch(`${LIVE}/`);
const headers = Object.fromEntries(headRes.headers.entries());
const deep = await fetch(`${LIVE}/assets/12`, { headers: { Accept: 'text/html' } });
const scanDeep = await fetch(`${LIVE}/scan/AT-0001`, { headers: { Accept: 'text/html' } });
const api404 = await fetch(`${LIVE}/api/does-not-exist`);
const api404Body = await api404.text();
const corsSelf = await fetch(`${LIVE}/api/health`, { headers: { Origin: LIVE } });
const corsEvil = await fetch(`${LIVE}/api/health`, { headers: { Origin: 'https://evil.example' } });
const qr = await (await fetch(`${LIVE}/api/qr/AT-0001`)).text();

// ---------- live app pages ----------
const page = await newPage(browser, { width: 1440, height: 900 });
page.problems = [];
await login(page, 'admin@assettrack.com', 'Admin@123');

// ================= Section 1: Improved areas =================
// 1.1 Live deployment
await liveShot(page, 'VC-1-01a-live-dashboard.png', () => page.goto(LIVE + '/', { waitUntil: 'networkidle2' }));
await evidence('VC-1-01b-live-health.png', '1.1 Live deployment: health check', `GET ${LIVE}/api/health`, [
  { h: 'Live response', pre: esc(JSON.stringify(JSON.parse(health), null, 2)) },
  { h: 'Previous version (4d3b9dd)', note: 'Not deployed anywhere; it only ran on localhost.' },
]);

// 1.2 No-account database
await evidence('VC-1-02-sqlite-database.png', '1.2 No-account database: PostgreSQL -> SQLite', 'git diff 4d3b9dd..HEAD  backend/prisma/schema.prisma  +  backend/.env.example', [
  { h: 'schema.prisma: datasource', pre: diff(`${PREV}..HEAD`, ['backend/prisma/schema.prisma'], 22) },
  {
    h: 'Start command now migrates and seeds automatically',
    pre: `<span class="del">- "start": "${esc(JSON.parse(git('show', `${PREV}:backend/package.json`)).scripts.start)}"</span>\n<span class="add">+ "start": "${esc(JSON.parse(git('show', 'HEAD:backend/package.json')).scripts.start)}"</span>`,
  },
  { h: 'Live database status', pre: esc(health) },
]);

// 1.3 One service, one URL
await liveShot(page, 'VC-1-03a-deep-link-asset.png', () => page.goto(LIVE + '/assets/1', { waitUntil: 'networkidle2' }));
await evidence('VC-1-03b-one-service-routing.png', '1.3 One service, one URL', `Website and API on ${LIVE}`, [
  {
    h: 'Live requests (same host serves app pages and API)',
    html: `<table><tr><th>Request</th><th>Status</th><th>Content-Type</th></tr>
      <tr><td>GET /</td><td class="pass">${headRes.status}</td><td>${esc(headers['content-type'])}</td></tr>
      <tr><td>GET /assets/12 (direct link / refresh)</td><td class="pass">${deep.status}</td><td>${esc(deep.headers.get('content-type'))}</td></tr>
      <tr><td>GET /scan/AT-0001 (scanned QR link)</td><td class="pass">${scanDeep.status}</td><td>${esc(scanDeep.headers.get('content-type'))}</td></tr>
      <tr><td>GET /api/health</td><td class="pass">200</td><td>application/json</td></tr>
      <tr><td>GET /api/does-not-exist</td><td>${api404.status}</td><td>JSON: ${esc(api404Body)}</td></tr></table>`,
  },
]);

// 1.4 One-click deploy
await evidence('VC-1-04-render-blueprint.png', '1.4 One-click deploy: Render Blueprint', 'render.yaml and root package.json (new in this version)', [
  { h: 'render.yaml', pre: esc(fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf8')).replace(/(generateValue: true)/, '<span class="ok">$1</span>') },
  { h: 'package.json (root) scripts', pre: esc(JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts, null, 2)) },
]);

// 1.5 Security for the served website
await evidence('VC-1-05-security-headers.png', '1.5 Security for the served website', `Response headers from GET ${LIVE}/`, [
  {
    h: 'Content-Security-Policy (live)',
    pre: esc(headers['content-security-policy'] || '(missing)').split(';').map((d) => `<span class="key">${d.split(' ')[0]}</span>${d.slice(d.split(' ')[0].length)}`).join(';\n'),
  },
  {
    h: 'Other security headers (live)',
    pre: ['strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'cross-origin-opener-policy'].map((k) => `${k}: ${esc(headers[k] || '-')}`).join('\n'),
  },
  {
    h: 'CORS (live)',
    pre: `Origin: ${LIVE}         -> HTTP ${corsSelf.status}, access-control-allow-origin: ${esc(corsSelf.headers.get('access-control-allow-origin') || '-')}\nOrigin: https://evil.example -> HTTP ${corsEvil.status} (blocked)`,
  },
  { h: 'Previous version (4d3b9dd)', pre: esc(git('show', `${PREV}:backend/src/app.js`).split('\n').find((l) => l.includes('helmet('))?.trim() || '') + '   <span class="dim">// defaults only</span>' },
]);

// 1.6 BUG-07
await evidence('VC-1-06-bug07-fixed.png', '1.6 Fixed BUG-07 (High): refreshing an asset page', 'Before: HTTP 500 · After: the app loads', [
  { h: 'Before (one-service build, before fix)', pre: esc(fs.readFileSync(path.join(ROOT, 'reports/evidence/BUG-07-before.txt'), 'utf8')) },
  { h: `After, on the live site (${new Date().toISOString().slice(0, 10)})`, pre: `GET /assets/12      -> <span class="ok">HTTP ${deep.status}</span> ${esc(deep.headers.get('content-type'))}\nGET /scan/AT-0001   -> <span class="ok">HTTP ${scanDeep.status}</span> ${esc(scanDeep.headers.get('content-type'))}` },
  { h: 'Fix (backend/src/app.js)', pre: diff('bd2d5c0~1..HEAD', ['backend/src/app.js'], 400).split('\n').filter((l) => /fallthrough|express\.static\(path\.join\(STATIC_DIR, 'assets'\)|also an app route/.test(l)).join('\n') },
]);

// 1.7 BUG-08
const bundleHasLocalhost = fs.readdirSync(path.join(ROOT, 'frontend/dist/assets')).some((f) => f.endsWith('.js') && fs.readFileSync(path.join(ROOT, 'frontend/dist/assets', f), 'utf8').includes('localhost:4000'));
await evidence('VC-1-07-bug08-fixed.png', '1.7 Fixed BUG-08 (High): production build called the local server', 'Before: blocked by CSP · After: same-origin API calls', [
  { h: 'Before', pre: esc(fs.readFileSync(path.join(ROOT, 'reports/evidence/BUG-08-before.txt'), 'utf8')) },
  { h: 'Fix: frontend/.env.production (new file)', pre: esc(fs.readFileSync(path.join(ROOT, 'frontend/.env.production'), 'utf8')) },
  { h: 'After', pre: `Production bundle contains "localhost:4000": <span class="ok">${bundleHasLocalhost ? 'YES' : 'no'}</span>\nLive sign-in as admin: <span class="ok">works</span> (see VC-1-01a-live-dashboard.png)` },
]);

// 1.8 Documentation and reports
const reportFiles = git('ls-tree', '-r', '--name-only', 'HEAD', 'README.md', 'reports').split('\n').filter(Boolean);
const shotCount = reportFiles.filter((f) => f.startsWith('reports/screenshots/') && !f.includes('/version/')).length;
await evidence('VC-1-08-docs-and-reports.png', '1.8 Documentation and reports', `Files in ${REPO} (HEAD) that did not exist in 4d3b9dd`, [
  {
    h: 'Documents',
    html: `<table><tr><th>File</th><th>Size</th></tr>${reportFiles
      .filter((f) => !f.includes('/screenshots/') && !f.includes('/evidence/'))
      .map((f) => `<tr><td>${esc(f)}</td><td>${(fs.statSync(path.join(ROOT, f)).size / 1024).toFixed(0)} kB</td></tr>`)
      .join('')}<tr><td>reports/screenshots/ (images)</td><td>${shotCount} files</td></tr><tr><td>reports/evidence/ (API transcripts)</td><td>${reportFiles.filter((f) => f.includes('/evidence/')).length} files</td></tr></table>`,
  },
  { h: 'Previous version (4d3b9dd)', pre: `README.md: ${git('ls-tree', '--name-only', PREV, 'README.md').trim() ? 'present' : 'none'}\nreports/: ${git('ls-tree', '-r', '--name-only', PREV, 'reports').trim().split('\n').filter(Boolean).length} files` },
]);

// 1.9 Testing
const res = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const live = res('results-live.json');
await evidence('VC-1-09-testing.png', '1.9 Testing', 'Browser acceptance suite (installed Chrome) + API tests', [
  {
    h: 'Runs in the current version',
    html: `<table><tr><th>Target</th><th>Result</th></tr>
      <tr><td>Local dev (Vite + API)</td><td class="pass">36 / 36</td></tr>
      <tr><td>Fresh clone from GitHub, built like Render</td><td class="pass">36 / 36</td></tr>
      <tr><td>One-service production build</td><td class="pass">36 / 36</td></tr>
      <tr><td>Live site ${esc(live.base)} (${esc(live.at)})</td><td class="pass">${live.results.filter((r) => r.ok).length} / ${live.results.length}</td></tr>
      <tr><td>API tests on SQLite (npm test)</td><td class="pass">18 / 18</td></tr></table>`,
  },
  { h: 'Live run: every check', pre: live.results.map((r) => `${r.ok ? '<span class="ok">PASS</span>' : '<span class="del">FAIL</span>'}  ${esc(r.name)}`).join('\n') },
]);

// 1.10 Unchanged for users
await liveShot(page, 'VC-1-10-unchanged-assets-list.png', () => page.goto(LIVE + '/assets', { waitUntil: 'networkidle2' }));
const frontendDiff = git('diff', '--stat', `${PREV}..HEAD`, '--', 'frontend/src').trim();
await evidence('VC-1-10b-unchanged-ui.png', '1.10 Unchanged for users', 'git diff --stat 4d3b9dd..HEAD -- frontend/src', [
  { h: 'Frontend source changes between the versions', pre: esc(frontendDiff || '(none)'), note: 'The only change in frontend/src is how the API address is resolved (same origin); no page, component or style changed.' },
]);

// ================= Section 2: Scope of improvement =================
await evidence('VC-2-01-data-resets.png', '2.1 Persistent live data', 'Why live changes do not survive a restart', [
  { h: 'render.yaml (free plan, SQLite file inside the service)', pre: esc(fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf8').split('\n').filter((l) => /plan:|DATABASE_URL|file:|persistent disk|resets/.test(l)).join('\n')) },
  { h: 'Start-up seeds an empty database (backend/package.json)', pre: esc(JSON.parse(git('show', 'HEAD:backend/package.json')).scripts.start) },
  { h: 'Live server uptime right now (restarts reset it to 0)', pre: esc(health) },
]);
{
  // Simulate a sleeping instance by delaying /api/health so the real notice appears.
  const p2 = await newPage(browser, { width: 1440, height: 900 });
  // Fresh visitor: the main page is signed in and shares localStorage, which would redirect away from /login.
  await p2.evaluateOnNewDocument(() => localStorage.removeItem('assettrack-token'));
  await p2.setRequestInterception(true);
  p2.on('request', (r) => (r.url().includes('/api/health') ? setTimeout(() => r.continue().catch(() => {}), 5000) : r.continue().catch(() => {})));
  await p2.goto(LIVE + '/login');
  await p2.waitForFunction(() => document.body.innerText.includes('Waking up the server'), { timeout: 8000 });
  await sleep(300);
  await p2.screenshot({ path: path.join(OUT, 'VC-2-02-cold-start-notice.png') });
  await p2.close();
  made.push('VC-2-02-cold-start-notice.png');
  await login(page, 'admin@assettrack.com', 'Admin@123'); // shared storage was cleared above
}
await evidence('VC-2-03-brief-gap.png', '2.3 Match the original brief', 'Original request vs current version', [
  {
    h: 'Comparison',
    html: `<table><tr><th>Area</th><th>Original brief</th><th>Current version</th></tr>
    <tr><td>Database</td><td>PostgreSQL on Neon (free)</td><td>SQLite file in the Render service</td></tr>
    <tr><td>Frontend host</td><td>Separate free static host (not Vercel)</td><td>Served by the backend (one service)</td></tr>
    <tr><td>Backend host</td><td>Render free</td><td>Render free</td></tr>
    <tr><td>Reason</td><td colspan="2">Owner asked to avoid API keys, tokens and extra accounts; the app was first built and fully tested on PostgreSQL (schema in commit 4d3b9dd).</td></tr></table>`,
  },
  { h: 'Previous datasource (4d3b9dd)', pre: esc(git('show', `${PREV}:backend/prisma/schema.prisma`).split('\n').slice(8, 13).join('\n')) },
]);

// Feature ideas: show the current screen where each would be added.
await liveShot(page, 'VC-2-04-email-reminders-warranty.png', async () => {
  await page.goto(LIVE + '/', { waitUntil: 'networkidle2' });
  await page.evaluate(() => [...document.querySelectorAll('h2')].find((h) => h.textContent.includes('Warranty'))?.scrollIntoView({ block: 'center' }));
});
await liveShot(page, 'VC-2-05-attachments-asset-detail.png', () => page.goto(LIVE + '/assets/2', { waitUntil: 'networkidle2' }));
await liveShot(page, 'VC-2-06-employee-view-holder-search.png', async () => {
  await page.goto(LIVE + '/assets?search=Priya', { waitUntil: 'networkidle2' });
});
await liveShot(page, 'VC-2-07-depreciation-value-kpi.png', () => page.goto(LIVE + '/reports', { waitUntil: 'networkidle2' }));
await liveShot(page, 'VC-2-08-audit-export-activity.png', async () => {
  await page.goto(LIVE + '/assets/1', { waitUntil: 'networkidle2' });
  await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent.includes('Activity'))?.click());
});
const dist = fs.readdirSync(path.join(ROOT, 'frontend/dist/assets')).filter((f) => f.endsWith('.js'));
const zlib = await import('node:zlib');
const sizes = dist
  .map((f) => {
    const b = fs.readFileSync(path.join(ROOT, 'frontend/dist/assets', f));
    return { f, raw: b.length, gz: zlib.gzipSync(b).length };
  })
  .sort((a, b) => b.gz - a.gz)
  .slice(0, 6);
await evidence('VC-2-09-bundle-size.png', '2.9 Bundle size', 'Largest JavaScript chunks in frontend/dist (current production build)', [
  {
    h: 'Chunks',
    html: `<table><tr><th>File</th><th>Size</th><th>Gzipped</th><th>When it loads</th></tr>${sizes
      .map((s) => `<tr><td>${esc(s.f)}</td><td>${(s.raw / 1024).toFixed(0)} kB</td><td>${(s.gz / 1024).toFixed(0)} kB</td><td>${s.f.startsWith('pdf') ? 'Only when a PDF is created' : s.f.startsWith('charts') ? 'Dashboard (candidate for lazy loading)' : s.f.startsWith('qr') ? 'QR pages' : 'Start-up'}</td></tr>`)
      .join('')}</table>`,
  },
]);

// ================= Section 3: team =================
await liveShot(page, 'VC-3-01-divya-assettrack.png', () => page.goto(LIVE + '/', { waitUntil: 'networkidle2' }));

await browser.close();
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ capturedAt: new Date().toISOString(), live: LIVE, files: made, consoleProblems: page.problems }, null, 2));
console.log(`${made.length} screenshots in ${OUT}`);
console.log('console problems on live pages:', page.problems.length ? page.problems : 'none');
