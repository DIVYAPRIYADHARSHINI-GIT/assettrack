// AssetTrack acceptance checks in a real browser (installed Chrome via puppeteer-core).
// Usage: BASE_URL=http://localhost:5173 API_URL=http://localhost:4000 SHOT_PREFIX=local node acceptance.mjs
import fs from 'node:fs';
import path from 'node:path';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { BASE, DOWNLOADS, assert, clickText, fillByLabel, launch, login, makeChecker, newPage, overflowX, shot, sleep, text, waitText } from './lib.mjs';

const API = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const P = process.env.SHOT_PREFIX ? `${process.env.SHOT_PREFIX}-` : '';
const RUN = Date.now().toString(36).toUpperCase();
const openPages = [];
const { check, results } = makeChecker(() => openPages);
const browser = await launch();

const apiAs = (page, p, opts = {}) =>
  page.evaluate(
    async (url, opts) => {
      const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('assettrack-token') } });
      return { status: r.status, body: r.status === 204 ? null : await r.json() };
    },
    API + '/api' + p,
    opts,
  );

function latestDownload(ext, since) {
  const files = fs.readdirSync(DOWNLOADS).filter((f) => f.endsWith(ext)).map((f) => ({ f, t: fs.statSync(path.join(DOWNLOADS, f)).mtimeMs })).filter((x) => x.t >= since);
  return files.sort((a, b) => b.t - a.t)[0]?.f;
}
async function waitDownload(ext, since, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const f = latestDownload(ext, since);
    if (f && !fs.existsSync(path.join(DOWNLOADS, f + '.crdownload'))) return path.join(DOWNLOADS, f);
    await sleep(250);
  }
  throw new Error(`No ${ext} download`);
}

// ---------------------------------------------------------------- login
console.log('\nLogin');
const page = await newPage(browser);
openPages.push(page);
await check('login page shows the waking-up notice when the API is slow', async () => {
  // Delay /api/health to simulate a sleeping Render instance.
  await page.setRequestInterception(true);
  const handler = (req) => (req.url().includes('/api/health') ? setTimeout(() => req.continue().catch(() => {}), 4500) : req.continue().catch(() => {}));
  page.on('request', handler);
  await page.goto(BASE + '/login');
  await waitText(page, 'Waking up the server, please wait', 6000);
  await shot(page, `${P}login-waking-up`);
  page.off('request', handler);
  await page.setRequestInterception(false);
});
await check('wrong password shows an error', async () => {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
  await page.type('#email', 'admin@assettrack.com');
  await page.type('#password', 'wrong-password');
  await page.click('button[type=submit]');
  await waitText(page, 'Invalid email or password');
});
await check('login page (clean)', async () => {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
  await shot(page, `${P}01-login`);
});

// ---------------------------------------------------------------- viewer
console.log('\nViewer role');
const viewer = await newPage(browser);
openPages.push(viewer);
await login(viewer, 'viewer@assettrack.com', 'Viewer@123');
await check('viewer can log in and sees the dashboard', async () => {
  await waitText(viewer, 'Total assets');
  assert((await text(viewer)).includes('Read-only'), 'no read-only badge');
});
await check('viewer sees no edit actions on list and detail', async () => {
  await viewer.goto(BASE + '/assets', { waitUntil: 'networkidle2' });
  assert(!(await text(viewer)).includes('Add asset'), 'Add asset visible');
  await viewer.goto(BASE + '/assets/1', { waitUntil: 'networkidle2' });
  await waitText(viewer, 'AT-0001');
  const t = await text(viewer);
  for (const b of ['Assign', 'Return', 'Send to repair', 'Retire', 'Edit']) {
    const visible = await viewer.evaluate((b) => [...document.querySelectorAll('main button, main a')].some((e) => e.offsetParent && e.textContent.trim() === b), b);
    assert(!visible, `${b} button visible for viewer`);
  }
  assert(t.includes('Assignment history'), 'detail did not render');
  await shot(viewer, `${P}viewer-asset-detail-readonly`);
});
await check('viewer is redirected away from admin-only pages', async () => {
  for (const p of ['/users', '/assets/new', '/assets/1/edit']) {
    await viewer.goto(BASE + p, { waitUntil: 'networkidle2' });
    assert(new URL(viewer.url()).pathname === '/', `${p} not blocked (at ${viewer.url()})`);
  }
  assert(!(await text(viewer)).includes('Users\n'), 'Users nav visible');
});
await check('viewer import panel is locked, repairs has no Log repair', async () => {
  await viewer.goto(BASE + '/import-export', { waitUntil: 'networkidle2' });
  await waitText(viewer, 'Only admins can import');
  await viewer.goto(BASE + '/repairs', { waitUntil: 'networkidle2' });
  assert(!(await text(viewer)).includes('Log repair'), 'Log repair visible');
});
await check('API blocks viewer writes (403)', async () => {
  for (const [m, p] of [['POST', '/assets'], ['PATCH', '/assets/1'], ['POST', '/assets/1/retire'], ['POST', '/repairs'], ['GET', '/users']]) {
    const r = await apiAs(viewer, p, { method: m, body: m === 'GET' ? undefined : '{}' });
    assert(r.status === 403, `${m} ${p} -> ${r.status}`);
  }
});

// ---------------------------------------------------------------- admin
console.log('\nAdmin lifecycle');
const admin = await newPage(browser);
openPages.push(admin);
await login(admin, 'admin@assettrack.com', 'Admin@123');
await check('dashboard (clean)', async () => {
  await waitText(admin, 'Recent activity');
  await sleep(1200);
  await shot(admin, `${P}02-dashboard`);
});

await check('dashboard numbers match the asset data', async () => {
  const dash = (await apiAs(admin, '/dashboard')).body.data;
  const all = (await apiAs(admin, '/assets?pageSize=100')).body;
  const extra = all.meta.total > 100 ? (await apiAs(admin, '/assets?pageSize=100&page=2')).body.data : [];
  const rows = [...all.data, ...extra];
  const n = (s) => rows.filter((a) => a.status === s).length;
  const value = rows.reduce((s, a) => s + a.purchasePrice, 0);
  assert(dash.totals.totalAssets === all.meta.total, 'total mismatch');
  assert(dash.totals.assigned === n('ASSIGNED') && dash.totals.inStock === n('IN_STOCK') && dash.totals.underRepair === n('UNDER_REPAIR'), 'status mismatch');
  assert(Math.abs(dash.totals.totalValue - value) < 0.01, 'value mismatch');
  await admin.goto(BASE + '/', { waitUntil: 'networkidle2' });
  const ui = await admin.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid^=kpi-]')].map((e) => [e.dataset.testid, e.textContent])));
  assert(ui['kpi-total-assets'] === String(dash.totals.totalAssets), `UI total ${ui['kpi-total-assets']}`);
  assert(ui['kpi-assigned'] === String(dash.totals.assigned), 'UI assigned');
  assert(ui['kpi-in-stock'] === String(dash.totals.inStock), 'UI in stock');
  assert(ui['kpi-under-repair'] === String(dash.totals.underRepair), 'UI repair');
});

await check('assets list: search, filter, sort, pagination', async () => {
  await admin.goto(BASE + '/assets', { waitUntil: 'networkidle2' });
  await waitText(admin, 'Showing');
  await shot(admin, `${P}03-assets-list`);
  await admin.type('input[aria-label="Search assets"]', 'macbook');
  await admin.waitForFunction(() => location.search.includes('search=macbook'));
  await admin.waitForNetworkIdle({ idleTime: 300 });
  const names = await admin.$$eval('tbody tr td:nth-child(3) a', (as) => as.map((a) => a.textContent));
  assert(names.length >= 2 && names.every((n) => /macbook/i.test(n)), `search: ${names}`);
  await admin.goto(BASE + '/assets?status=ASSIGNED&sortBy=purchasePrice&order=desc', { waitUntil: 'networkidle2' });
  const badges = await admin.$$eval('tbody tr td:nth-child(5)', (t) => t.map((x) => x.textContent.trim()));
  assert(badges.length > 0 && badges.every((b) => b === 'Assigned'), 'status filter');
  const prices = await admin.$$eval('tbody tr td:last-child', (t) => t.map((x) => Number(x.textContent.replace(/[^\d]/g, ''))));
  assert(prices.join() === [...prices].sort((a, b) => b - a).join(), 'sort');
  await admin.goto(BASE + '/assets?page=2', { waitUntil: 'networkidle2' });
  assert((await text(admin)).includes('Showing 11–20'), 'pagination');
});

await check('assets list: bulk select and export selected', async () => {
  await admin.goto(BASE + '/assets', { waitUntil: 'networkidle2' });
  await admin.click('tbody tr:nth-child(1) input[type=checkbox]');
  await admin.click('tbody tr:nth-child(2) input[type=checkbox]');
  await waitText(admin, '2 selected');
  await shot(admin, `${P}assets-bulk-select`);
  const since = Date.now();
  await clickText(admin, 'Export selected');
  const f = await waitDownload('.csv', since);
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n');
  assert(lines.length === 3, `expected 2 rows, got ${lines.length - 1}`);
});

const SERIAL = `E2E-${RUN}`;
let assetId;
let assetTag;
await check('add asset form validates and creates the asset', async () => {
  await admin.goto(BASE + '/assets/new', { waitUntil: 'networkidle2' });
  await clickText(admin, 'Create asset');
  await waitText(admin, 'Name is required');
  await waitText(admin, 'Serial number is required');
  await shot(admin, `${P}05-asset-form-validation`);
  await admin.type('[name=name]', `E2E Laptop ${RUN}`);
  await admin.select('[name=categoryId]', '1');
  await admin.type('[name=serialNumber]', SERIAL);
  await admin.type('[name=brand]', 'Dell');
  await admin.type('[name=purchasePrice]', '65000');
  await admin.$eval('[name=purchaseDate]', (e) => e.focus());
  await fillByLabel(admin, 'Purchase date', '2026-01-15', 'form');
  await fillByLabel(admin, 'Warranty end date', '2029-01-15', 'form');
  await admin.type('[name=location]', 'Bengaluru HQ - Floor 2');
  await clickText(admin, 'Create asset');
  await admin.waitForFunction(() => /\/assets\/\d+$/.test(location.pathname), { timeout: 15000 });
  assetId = Number(admin.url().split('/').pop());
  await waitText(admin, 'Details');
  assetTag = await admin.$eval('main span.font-mono', (e) => e.textContent);
  assert(/^AT-\d{4}$/.test(assetTag), `tag ${assetTag}`);
});
await check('duplicate serial number is rejected with a clear message', async () => {
  await admin.goto(BASE + '/assets/new', { waitUntil: 'networkidle2' });
  await admin.type('[name=name]', 'Dup');
  await admin.select('[name=categoryId]', '1');
  await admin.type('[name=serialNumber]', SERIAL.toLowerCase());
  await clickText(admin, 'Create asset');
  await waitText(admin, `Already used by ${assetTag}`);
});

await check('assign dialog: validation, then assign', async () => {
  await admin.goto(`${BASE}/assets/${assetId}`, { waitUntil: 'networkidle2' });
  await clickText(admin, 'Assign', 'main button');
  await admin.waitForSelector('[role=dialog]');
  await clickText(admin, 'Assign asset', '[role=dialog] button');
  await waitText(admin, 'Employee name is required');
  await fillByLabel(admin, 'Employee name', 'Kavya Reddy');
  await fillByLabel(admin, 'Employee email', 'kavya.reddy@northwind.example');
  await fillByLabel(admin, 'Department', 'Design');
  await fillByLabel(admin, 'Condition notes', 'New, sealed box');
  await shot(admin, `${P}06-assign-dialog`);
  await clickText(admin, 'Assign asset', '[role=dialog] button');
  await admin.waitForFunction(() => !document.querySelector('[role=dialog]'));
  await waitText(admin, 'Kavya Reddy');
  const d = (await apiAs(admin, `/assets/${assetId}`)).body.data;
  assert(d.status === 'ASSIGNED' && d.currentAssignment.employeeName === 'Kavya Reddy', 'not assigned');
});
await check('assigning a non-In-Stock asset is blocked', async () => {
  const r = await apiAs(admin, `/assets/${assetId}/assign`, { method: 'POST', body: JSON.stringify({ employeeName: 'X', employeeEmail: 'x@x.com', department: 'X', assignedAt: new Date().toISOString().slice(0, 10) }) });
  assert(r.status === 409, `status ${r.status}`);
  const hasAssign = await admin.evaluate(() => [...document.querySelectorAll('main button')].some((b) => b.textContent.trim() === 'Assign'));
  assert(!hasAssign, 'Assign button shown for assigned asset');
});
await check('return dialog records the return', async () => {
  await clickText(admin, 'Return', 'main button');
  await admin.waitForSelector('[role=dialog]');
  await fillByLabel(admin, 'Condition on return', 'Good');
  await fillByLabel(admin, 'Notes', 'Returned after project');
  await shot(admin, `${P}return-dialog`);
  await clickText(admin, 'Record return', '[role=dialog] button');
  await admin.waitForFunction(() => !document.querySelector('[role=dialog]'));
  await waitText(admin, 'Returned:');
});
await check('send to repair, then close the repair', async () => {
  await clickText(admin, 'Send to repair', 'main button');
  await admin.waitForSelector('[role=dialog]');
  await fillByLabel(admin, 'Issue', 'Keyboard not responding');
  await fillByLabel(admin, 'Repair vendor', 'Dell Service Centre');
  await fillByLabel(admin, 'Estimated cost', '2500');
  await clickText(admin, 'Start repair', '[role=dialog] button');
  await admin.waitForFunction(() => !document.querySelector('[role=dialog]'));
  await waitText(admin, 'Under Repair');
  await clickText(admin, 'Close repair', 'main button');
  await admin.waitForSelector('[role=dialog]');
  await fillByLabel(admin, 'Final cost', '2800');
  await fillByLabel(admin, 'Resolution notes', 'Keyboard replaced');
  await clickText(admin, 'Close repair', '[role=dialog] button');
  await admin.waitForFunction(() => !document.querySelector('[role=dialog]'));
  await admin.waitForNetworkIdle({ idleTime: 300 });
  const d = (await apiAs(admin, `/assets/${assetId}`)).body.data;
  assert(d.status === 'IN_STOCK', `status after close ${d.status}`);
  assert(d.repairs[0].status === 'COMPLETED' && d.repairs[0].cost === 2800, 'repair not closed');
});
await check('every step appears in history and the activity log', async () => {
  await admin.goto(`${BASE}/assets/${assetId}`, { waitUntil: 'networkidle2' });
  const hist = await text(admin);
  assert(hist.includes('Kavya Reddy') && hist.includes('Returned: Good'), 'assignment history');
  await shot(admin, `${P}04-asset-detail-qr`);
  await clickText(admin, 'Repairs (1)');
  await waitText(admin, 'Keyboard not responding');
  await clickText(admin, 'Activity log');
  await waitText(admin, 'Repair closed');
  const t = await text(admin);
  for (const s of ['Created', 'Assigned', 'Returned', 'Repair started', 'Repair closed']) assert(t.includes(s), `missing ${s}`);
  assert(t.includes('Asha Admin'), 'user not shown');
  await shot(admin, `${P}asset-activity-log`);
  const dash = (await apiAs(admin, '/dashboard')).body.data.recentActivity.map((a) => a.message).join('\n');
  assert(dash.includes(`Closed repair for ${assetTag}`), 'dashboard feed');
});
await check('edit asset saves changes and logs an update', async () => {
  await admin.goto(`${BASE}/assets/${assetId}/edit`, { waitUntil: 'networkidle2' });
  await admin.waitForSelector('[name=location]');
  await fillByLabel(admin, 'Location', 'Chennai Office', 'form');
  await clickText(admin, 'Save changes');
  await admin.waitForFunction(() => /\/assets\/\d+$/.test(location.pathname));
  await waitText(admin, 'Chennai Office');
  const act = (await apiAs(admin, `/assets/${assetId}/activity`)).body.data;
  assert(act[0].action === 'UPDATE' && act[0].message.includes('location'), 'no update log');
});
await check('retire asks for confirmation and retires', async () => {
  await clickText(admin, 'Retire', 'main button');
  await waitText(admin, `Retire ${assetTag}?`);
  await shot(admin, `${P}confirm-retire-dialog`);
  await clickText(admin, 'Retire asset', '[role=dialog] button');
  await admin.waitForFunction(() => !document.querySelector('[role=dialog]'));
  await waitText(admin, 'Reactivate');
  const d = (await apiAs(admin, `/assets/${assetId}`)).body.data;
  assert(d.status === 'RETIRED', 'not retired');
  await clickText(admin, 'Reactivate', 'main button');
  await clickText(admin, 'Reactivate', '[role=dialog] button');
  await admin.waitForFunction(() => !document.querySelector('[role=dialog]'));
});

// ---------------------------------------------------------------- QR
console.log('\nQR');
await check('QR on the detail page decodes to this asset and opens it when scanned', async () => {
  await admin.goto(`${BASE}/assets/${assetId}`, { waitUntil: 'networkidle2' });
  const src = await admin.$eval('img[alt^="QR code"]', (i) => i.src);
  const png = PNG.sync.read(Buffer.from(src.split(',')[1], 'base64'));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
  assert(decoded && decoded.endsWith(`/scan/${assetTag}`), `decoded ${decoded}`);
  // Opening the scanned URL resolves to the asset.
  await admin.goto(decoded.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle2' });
  await admin.waitForFunction((id) => location.pathname === `/assets/${id}`, { timeout: 15000 }, assetId);
  // Scan page "upload photo" path: feed it the QR image file.
  fs.writeFileSync(path.join(DOWNLOADS, 'qr.png'), PNG.sync.write(png));
  await admin.goto(BASE + '/scan', { waitUntil: 'networkidle2' });
  await shot(admin, `${P}scan-page`);
  const input = await admin.$('input[type=file]');
  await input.uploadFile(path.join(DOWNLOADS, 'qr.png'));
  await admin.waitForFunction((id) => location.pathname === `/assets/${id}`, { timeout: 15000 }, assetId);
});
await check('scan page reads a QR from the camera', async () => {
  // Chrome's fake camera shows a test pattern; inject a stream that paints our QR instead.
  const src = await (async () => {
    await admin.goto(`${BASE}/assets/${assetId}`, { waitUntil: 'networkidle2' });
    return admin.$eval('img[alt^="QR code"]', (i) => i.src);
  })();
  await admin.goto(BASE + '/scan', { waitUntil: 'networkidle2' });
  await admin.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 480;
    const ctx = c.getContext('2d');
    const paint = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 640, 480);
      ctx.drawImage(img, 200, 120, 240, 240);
      requestAnimationFrame(paint);
    };
    paint();
    const stream = c.captureStream(15);
    navigator.mediaDevices.getUserMedia = async () => stream;
  }, src);
  await clickText(admin, 'Start camera');
  await admin.waitForFunction((id) => location.pathname === `/assets/${id}`, { timeout: 20000 }, assetId);
});
await check('unknown tag shows a clear error', async () => {
  await admin.goto(BASE + '/scan/AT-9999', { waitUntil: 'networkidle2' });
  await waitText(admin, 'No asset found with tag AT-9999');
});
await check('QR labels sheet and PDF download', async () => {
  await admin.goto(`${BASE}/qr-labels?ids=1,2,3,4,5,6,${assetId}`, { waitUntil: 'networkidle2' });
  await waitText(admin, 'Preview');
  await sleep(500);
  await shot(admin, `${P}07-qr-labels`);
  const since = Date.now();
  await clickText(admin, 'Download PDF');
  const f = await waitDownload('.pdf', since);
  const buf = fs.readFileSync(f);
  assert(buf.subarray(0, 5).toString() === '%PDF-' && buf.length > 5000, 'bad pdf');
});

// ---------------------------------------------------------------- CSV
console.log('\nImport / export');
await check('CSV import with a bad row shows the error and imports the valid rows', async () => {
  const csv = [
    'name,category,brand,serialNumber,purchaseDate,purchasePrice,warrantyEnd,location,status',
    `CSV Monitor ${RUN},Monitor,LG,CSV-${RUN}-1,2026-03-01,15000,2029-03-01,Chennai Office,In Stock`,
    `CSV Bad Row,Spaceship,X,CSV-${RUN}-2,2026-13-45,abc,,Chennai Office,Assigned`,
    `CSV Chair ${RUN},Furniture,Featherlite,CSV-${RUN}-3,05/04/2026,9000,,Hyderabad Office,`,
    `CSV Duplicate,Laptop,Dell,${SERIAL},,1000,,,`,
  ].join('\n');
  const file = path.join(DOWNLOADS, `import-${RUN}.csv`);
  fs.writeFileSync(file, csv);
  await admin.goto(BASE + '/import-export', { waitUntil: 'networkidle2' });
  const input = await admin.$('[data-testid=csv-input]');
  await input.uploadFile(file);
  await waitText(admin, '2 with errors');
  const t = await text(admin);
  assert(t.includes('Unknown category "Spaceship"'), 'category error');
  assert(t.includes('is not a valid date'), 'date error');
  assert(t.includes('Serial number already exists'), 'duplicate error');
  await shot(admin, `${P}08-import-preview-errors`, { fullPage: true });
  await clickText(admin, 'Import 2 valid rows');
  await waitText(admin, 'Imported 2 of 4 rows');
  await shot(admin, `${P}08b-import-result`, { fullPage: true });
  const r = (await apiAs(admin, `/assets?search=CSV-${RUN}`)).body;
  assert(r.meta.total === 2, `imported ${r.meta.total}`);
});
await check('download template and export filtered list', async () => {
  let since = Date.now();
  await clickText(admin, 'Download template');
  const tpl = fs.readFileSync(await waitDownload('.csv', since), 'utf8');
  assert(tpl.includes('serialNumber'), 'template');
  await admin.select('select[aria-label=Status]', 'RETIRED');
  since = Date.now();
  await clickText(admin, 'Export CSV');
  const rows = fs.readFileSync(await waitDownload('.csv', since), 'utf8').trim().split('\n').slice(1);
  assert(rows.length > 0 && rows.every((l) => l.includes(',Retired,')), 'export filter');
});

// ---------------------------------------------------------------- repairs / reports / users
console.log('\nRepairs, reports, users');
await check('repairs page lists repairs with cost totals', async () => {
  await admin.goto(BASE + '/repairs', { waitUntil: 'networkidle2' });
  await waitText(admin, 'Total repair cost');
  const api = (await apiAs(admin, '/repairs')).body.meta.totals;
  const ui = await text(admin);
  assert(ui.includes(new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(api.totalCost)), 'total cost not shown');
  await shot(admin, `${P}09-repairs`);
});
await check('log a repair from the repairs page', async () => {
  await clickText(admin, 'Log repair');
  await admin.waitForSelector('[role=dialog] select');
  await admin.waitForFunction(() => document.querySelectorAll('[role=dialog] select option').length > 1);
  const val = await admin.$eval('[role=dialog] select', (s) => s.options[1].value);
  await fillByLabel(admin, 'Asset', val);
  await fillByLabel(admin, 'Issue', 'E2E fan noise');
  await shot(admin, `${P}repair-dialog`);
  await clickText(admin, 'Start repair', '[role=dialog] button');
  await admin.waitForFunction(() => !document.querySelector('[role=dialog]'));
  await waitText(admin, 'E2E fan noise');
  await clickText(admin, 'Close', 'tbody button');
  await admin.waitForSelector('[role=dialog]');
  await clickText(admin, 'Close repair', '[role=dialog] button');
  await admin.waitForFunction(() => !document.querySelector('[role=dialog]'));
});
await check('reports page and PDF download', async () => {
  await admin.goto(BASE + '/reports', { waitUntil: 'networkidle2' });
  await waitText(admin, 'Repair cost summary');
  await shot(admin, `${P}10-reports`);
  const since = Date.now();
  await clickText(admin, 'Download PDF');
  const buf = fs.readFileSync(await waitDownload('.pdf', since));
  assert(buf.subarray(0, 5).toString() === '%PDF-' && buf.length > 5000, 'bad report pdf');
});
const NEW_EMAIL = `e2e.${RUN.toLowerCase()}@assettrack.com`;
await check('users: add, change role, deactivate', async () => {
  await admin.goto(BASE + '/users', { waitUntil: 'networkidle2' });
  await waitText(admin, 'viewer@assettrack.com');
  await shot(admin, `${P}11-users`);
  await clickText(admin, 'Add user');
  await fillByLabel(admin, 'Full name', `E2E Tester ${RUN}`);
  await fillByLabel(admin, 'Email', NEW_EMAIL);
  await fillByLabel(admin, 'Temporary password', 'Passw0rd99');
  await clickText(admin, 'Create user', '[role=dialog] button');
  await admin.waitForFunction(() => !document.querySelector('[role=dialog]'));
  await waitText(admin, NEW_EMAIL);
  // The list reloads after the create; wait for the new row's controls (slower over the network).
  await admin.waitForSelector(`select[aria-label="Role for E2E Tester ${RUN}"]`, { timeout: 20000 });
  await admin.select(`select[aria-label="Role for E2E Tester ${RUN}"]`, 'ADMIN');
  // Wait for the server to confirm the role change (toast), not for network idle.
  await waitText(admin, `E2E Tester ${RUN} is now an Admin`, 20000);
  await admin.click(`button[aria-label="Deactivate E2E Tester ${RUN}"]`);
  await waitText(admin, `Deactivate E2E Tester ${RUN}?`);
  await clickText(admin, 'Deactivate', '[role=dialog] button');
  await admin.waitForFunction(() => !document.querySelector('[role=dialog]'));
  await admin.waitForFunction(
    (n) => [...document.querySelectorAll('tbody tr')].some((r) => r.innerText.includes(n) && r.innerText.includes('Deactivated')),
    { timeout: 20000 },
    NEW_EMAIL,
  );
  const u = (await apiAs(admin, '/users')).body.data.find((x) => x.email === NEW_EMAIL);
  assert(u.role === 'ADMIN' && !u.isActive, 'user state');
});
await check('settings: change password validates mismatch', async () => {
  await admin.goto(BASE + '/settings', { waitUntil: 'networkidle2' });
  await fillByLabel(admin, 'Current password', 'Admin@123', 'form');
  await fillByLabel(admin, 'New password', 'NewPass123', 'form');
  await fillByLabel(admin, 'Confirm new password', 'Different123', 'form');
  await clickText(admin, 'Update password');
  await waitText(admin, 'Passwords do not match');
  await shot(admin, `${P}12-settings`);
});

// ---------------------------------------------------------------- responsive + dark
console.log('\nResponsive and dark mode');
const mobile = await newPage(browser, { width: 390, height: 844, mobile: true, dark: true });
openPages.push(mobile);
await login(mobile, 'admin@assettrack.com', 'Admin@123');
await check('mobile + dark: every page renders without horizontal scroll', async () => {
  for (const p of ['/', '/assets', `/assets/${assetId}`, '/repairs', '/qr-labels?ids=1,2', '/scan', '/import-export', '/reports', '/users', '/settings']) {
    await mobile.goto(BASE + p, { waitUntil: 'networkidle2' });
    await sleep(300);
    const ox = await overflowX(mobile);
    assert(ox <= 1, `${p} overflows by ${ox}px`);
  }
  await mobile.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await sleep(800);
  await shot(mobile, `${P}mobile-dark-dashboard`);
  await mobile.goto(BASE + '/assets', { waitUntil: 'networkidle2' });
  await shot(mobile, `${P}mobile-dark-assets`);
  await mobile.click('button[aria-label="Open menu"]');
  await sleep(300);
  await shot(mobile, `${P}mobile-dark-menu`);
});
await check('theme toggle switches and persists', async () => {
  await mobile.close(); // background tabs are throttled in headless Chrome
  await admin.bringToFront();
  await admin.goto(BASE + '/', { waitUntil: 'networkidle2' });
  const before = await admin.evaluate(() => document.documentElement.classList.contains('dark'));
  await admin.click('button[title="Toggle theme"]');
  await admin.reload({ waitUntil: 'networkidle2' });
  const after = await admin.evaluate(() => document.documentElement.classList.contains('dark'));
  assert(before !== after, 'theme did not persist');
  await sleep(800);
  await shot(admin, `${P}dark-dashboard`);
  await admin.click('button[title="Toggle theme"]');
});
await check('sign out returns to login and protects pages', async () => {
  await admin.click('button[aria-haspopup=menu]');
  await clickText(admin, 'Sign out');
  await admin.waitForFunction(() => location.pathname === '/login');
  await admin.goto(BASE + '/assets', { waitUntil: 'networkidle2' });
  assert(new URL(admin.url()).pathname === '/login', 'not redirected');
});

// ---------------------------------------------------------------- console hygiene
// Expected: 401 wrong password, 403 viewer blocked, 404 unknown tag, 409 duplicate serial / assigning a non-In-Stock asset.
const problems = [page, viewer, admin, mobile].flatMap((p) => p.problems).filter((p) => !/status of 40[1349]/.test(p));
await check('no console errors or failed requests during the run', async () => {
  assert(problems.length === 0, problems.slice(0, 5).join('\n'));
});

await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
fs.writeFileSync(`results-${process.env.SHOT_PREFIX || 'local'}.json`, JSON.stringify({ run: RUN, base: BASE, at: new Date().toISOString(), results }, null, 2));
process.exit(passed === results.length ? 0 : 1);
