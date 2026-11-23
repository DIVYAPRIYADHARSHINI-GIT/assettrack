// Integration tests against a disposable database (TEST_DATABASE_URL).
// Run: npm test   (the script migrates + seeds the test DB first)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a disposable database');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/lib/prisma.js');
const app = createApp();

let admin;
let viewer;
const today = new Date().toISOString().slice(0, 10);

async function login(email, password) {
  const r = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}
const as = (token) => ({ Authorization: `Bearer ${token}` });

before(async () => {
  admin = await login('admin@assettrack.com', 'Admin@123');
  viewer = await login('viewer@assettrack.com', 'Viewer@123');
});
after(() => prisma.$disconnect());

test('health check reports database ok', async () => {
  const r = await request(app).get('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
});

test('login rejects bad credentials and validates input', async () => {
  assert.equal((await request(app).post('/api/auth/login').send({ email: 'admin@assettrack.com', password: 'nope' })).status, 401);
  assert.equal((await request(app).post('/api/auth/login').send({ email: 'not-an-email' })).status, 400);
});

test('me returns the current user without the password hash', async () => {
  const r = await request(app).get('/api/auth/me').set(as(viewer));
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'VIEWER');
  assert.equal(r.body.user.passwordHash, undefined);
});

test('requests without a token are 401', async () => {
  assert.equal((await request(app).get('/api/assets')).status, 401);
  assert.equal((await request(app).get('/api/assets').set({ Authorization: 'Bearer garbage' })).status, 401);
});

test('seed has 40 assets across 6 categories', async () => {
  const r = await request(app).get('/api/assets?pageSize=100').set(as(viewer));
  assert.equal(r.body.meta.total, 40);
  const cats = await request(app).get('/api/categories').set(as(viewer));
  assert.deepEqual(cats.body.data.map((c) => c.name).sort(), ['Accessories', 'Furniture', 'Laptop', 'Monitor', 'Other', 'Phone']);
});

test('viewer is blocked from every mutating endpoint', async () => {
  const calls = [
    ['post', '/api/assets'],
    ['patch', '/api/assets/1'],
    ['delete', '/api/assets/1'],
    ['post', '/api/assets/1/assign'],
    ['post', '/api/assets/1/return'],
    ['post', '/api/assets/1/retire'],
    ['post', '/api/repairs'],
    ['post', '/api/repairs/1/close'],
    ['post', '/api/categories'],
    ['post', '/api/csv/import'],
    ['get', '/api/users'],
    ['post', '/api/users'],
  ];
  for (const [m, url] of calls) {
    const r = await request(app)[m](url).set(as(viewer)).send({});
    assert.equal(r.status, 403, `${m} ${url} returned ${r.status}`);
  }
});

test('full lifecycle: create, assign, block double-assign, return, repair, close', async () => {
  const create = await request(app)
    .post('/api/assets')
    .set(as(admin))
    .send({ name: 'Lifecycle Laptop', categoryId: 1, serialNumber: `LIFE-${Date.now()}`, purchasePrice: '45000.50', purchaseDate: '2026-01-05', warrantyEnd: '2028-01-05' });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const asset = create.body.data;
  assert.match(asset.assetTag, /^AT-\d{4}$/);
  assert.equal(asset.status, 'IN_STOCK');
  assert.equal(asset.purchasePrice, 45000.5);

  const assign = await request(app)
    .post(`/api/assets/${asset.id}/assign`)
    .set(as(admin))
    .send({ employeeName: 'Test Person', employeeEmail: 'test@example.com', department: 'QA', assignedAt: today });
  assert.equal(assign.status, 201, JSON.stringify(assign.body));

  const again = await request(app)
    .post(`/api/assets/${asset.id}/assign`)
    .set(as(admin))
    .send({ employeeName: 'Other', employeeEmail: 'o@example.com', department: 'QA', assignedAt: today });
  assert.equal(again.status, 409);
  assert.match(again.body.error.message, /not|cannot/i);

  const repairWhileAssigned = await request(app).post('/api/repairs').set(as(admin)).send({ assetId: asset.id, issue: 'x', startDate: today });
  assert.equal(repairWhileAssigned.status, 409);

  const ret = await request(app).post(`/api/assets/${asset.id}/return`).set(as(admin)).send({ returnedAt: today, returnCondition: 'Good' });
  assert.equal(ret.status, 200, JSON.stringify(ret.body));

  const rep = await request(app).post('/api/repairs').set(as(admin)).send({ assetId: asset.id, issue: 'Screen flicker', vendor: 'Dell', cost: 1200, startDate: today });
  assert.equal(rep.status, 201, JSON.stringify(rep.body));
  let detail = await request(app).get(`/api/assets/${asset.id}`).set(as(viewer));
  assert.equal(detail.body.data.status, 'UNDER_REPAIR');

  const close = await request(app).post(`/api/repairs/${rep.body.data.id}/close`).set(as(admin)).send({ endDate: today, cost: 1500 });
  assert.equal(close.status, 200, JSON.stringify(close.body));
  detail = await request(app).get(`/api/assets/${asset.id}`).set(as(viewer));
  assert.equal(detail.body.data.status, 'IN_STOCK');
  assert.equal(detail.body.data.assignments.length, 1);
  assert.equal(detail.body.data.assignments[0].returnCondition, 'Good');
  assert.equal(detail.body.data.repairs[0].cost, 1500);

  const act = await request(app).get(`/api/assets/${asset.id}/activity`).set(as(viewer));
  const actions = act.body.data.map((a) => a.action).reverse();
  assert.deepEqual(actions, ['CREATE', 'ASSIGN', 'RETURN', 'REPAIR_START', 'REPAIR_CLOSE']);
  assert.ok(act.body.data.every((a) => a.user?.email === 'admin@assettrack.com'));

  const retire = await request(app).post(`/api/assets/${asset.id}/retire`).set(as(admin)).send({ reason: 'test' });
  assert.equal(retire.status, 200);
  assert.equal(retire.body.data.status, 'RETIRED');
  const assignRetired = await request(app)
    .post(`/api/assets/${asset.id}/assign`)
    .set(as(admin))
    .send({ employeeName: 'X', employeeEmail: 'x@example.com', department: 'QA', assignedAt: today });
  assert.equal(assignRetired.status, 409);
});

test('asset validation: required fields, duplicate serial, date order, direct status edit', async () => {
  const empty = await request(app).post('/api/assets').set(as(admin)).send({});
  assert.equal(empty.status, 400);
  assert.ok(empty.body.error.details.fields.name);
  assert.ok(empty.body.error.details.fields.serialNumber);

  const existing = (await request(app).get('/api/assets/1').set(as(admin))).body.data;
  const dup = await request(app).post('/api/assets').set(as(admin)).send({ name: 'Dup', categoryId: 1, serialNumber: existing.serialNumber.toLowerCase() });
  assert.equal(dup.status, 409);

  const order = await request(app).post('/api/assets').set(as(admin)).send({ name: 'Bad', categoryId: 1, serialNumber: 'ORDER-1', purchaseDate: '2026-05-01', warrantyEnd: '2026-01-01' });
  assert.equal(order.status, 400);

  const status = await request(app).patch('/api/assets/1').set(as(admin)).send({ status: 'RETIRED' });
  assert.equal(status.status, 400);

  assert.equal((await request(app).get('/api/assets/999999').set(as(admin))).status, 404);
  assert.equal((await request(app).get('/api/assets/abc').set(as(admin))).status, 400);
});

test('list supports search, filter, sort and pagination', async () => {
  const page = await request(app).get('/api/assets?page=2&pageSize=5&sortBy=purchasePrice&order=desc').set(as(viewer));
  assert.equal(page.body.data.length, 5);
  assert.equal(page.body.meta.page, 2);
  const prices = page.body.data.map((a) => a.purchasePrice);
  assert.deepEqual(prices, [...prices].sort((a, b) => b - a));

  const laptops = await request(app).get('/api/assets?status=ASSIGNED&categoryId=1&pageSize=100').set(as(viewer));
  assert.ok(laptops.body.data.every((a) => a.status === 'ASSIGNED' && a.category.name === 'Laptop'));

  const search = await request(app).get('/api/assets?search=macbook').set(as(viewer));
  assert.ok(search.body.data.length >= 2);
  assert.ok(search.body.data.every((a) => /macbook/i.test(a.name)));

  const w = await request(app).get('/api/assets?warranty=30&pageSize=100').set(as(viewer));
  const limit = new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10);
  assert.ok(w.body.data.every((a) => a.warrantyEnd >= today && a.warrantyEnd <= limit));

  assert.equal((await request(app).get('/api/assets?status=BROKEN').set(as(viewer))).status, 400);
  assert.equal((await request(app).get('/api/assets?sortBy=password').set(as(viewer))).status, 400);
});

test('dashboard numbers match the asset data', async () => {
  const d = (await request(app).get('/api/dashboard').set(as(viewer))).body.data;
  const all = (await request(app).get('/api/assets?pageSize=100').set(as(viewer))).body;
  const count = (s) => all.data.filter((a) => a.status === s).length;
  assert.equal(d.totals.totalAssets, all.meta.total);
  assert.equal(d.totals.assigned, count('ASSIGNED'));
  assert.equal(d.totals.inStock, count('IN_STOCK'));
  assert.equal(d.totals.underRepair, count('UNDER_REPAIR'));
  const value = all.data.reduce((s, a) => s + a.purchasePrice, 0);
  assert.ok(Math.abs(d.totals.totalValue - value) < 0.01);
  assert.equal(d.byCategory.reduce((s, c) => s + c.count, 0), all.meta.total);
  assert.ok(d.warranty.counts[30] <= d.warranty.counts[60] && d.warranty.counts[60] <= d.warranty.counts[90]);
});

test('CSV import reports bad rows and imports the valid ones', async () => {
  const s = Date.now();
  const csv = [
    'Name,Category,Serial Number,Purchase Price,Purchase Date,Warranty End,Status',
    `Good A,Laptop,CSV-A-${s},1000,2026-02-01,2027-02-01,In Stock`,
    `Bad,Spaceship,CSV-B-${s},abc,2026-13-40,,Assigned`,
    `Good B,monitor,CSV-C-${s},"2,500",15/03/2026,,`,
    `Dupe,Laptop,CSV-A-${s},1,,,`,
  ].join('\n');
  const preview = await request(app).post('/api/csv/import?dryRun=true').set(as(admin)).attach('file', Buffer.from(csv), 'a.csv');
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.data.importedCount, 0);
  assert.equal(preview.body.data.validCount, 2);

  const r = await request(app).post('/api/csv/import').set(as(admin)).attach('file', Buffer.from(csv), 'a.csv');
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.importedCount, 2);
  assert.equal(r.body.data.errorCount, 2);
  const bad = r.body.data.rows.find((x) => x.row === 3);
  assert.ok(bad.errors.some((e) => e.field === 'category' && /Unknown category/.test(e.message)));
  assert.ok(bad.errors.some((e) => e.field === 'purchaseDate' && /not a valid date/.test(e.message)));
  const dupe = r.body.data.rows.find((x) => x.row === 5);
  assert.ok(dupe.errors.some((e) => /Duplicate serial number in this file/.test(e.message)));

  const missingCol = await request(app).post('/api/csv/import').set(as(admin)).attach('file', Buffer.from('foo,bar\n1,2'), 'b.csv');
  assert.equal(missingCol.status, 400);
});

test('CSV export honours filters', async () => {
  const r = await request(app).get('/api/csv/export?status=RETIRED').set(as(viewer));
  assert.equal(r.status, 200);
  const lines = r.text.trim().split('\n');
  assert.ok(lines.length > 1);
  assert.ok(lines.slice(1).every((l) => l.includes(',Retired,')));
});

test('public QR endpoint returns non-sensitive details by tag', async () => {
  const r = await request(app).get('/api/qr/at-0001');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.assetTag, 'AT-0001');
  assert.equal(r.body.data.purchasePrice, undefined);
  assert.equal(r.body.data.serialNumber, undefined);
  assert.equal((await request(app).get('/api/qr/AT-9999')).status, 404);
  assert.equal((await request(app).get('/api/qr/hello')).status, 400);
});

test('users: admin creates, edits role, deactivates; deactivated user cannot log in', async () => {
  const email = `user${Date.now()}@example.com`;
  const c = await request(app).post('/api/users').set(as(admin)).send({ name: 'New User', email, password: 'Passw0rd!', role: 'VIEWER' });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const weak = await request(app).post('/api/users').set(as(admin)).send({ name: 'W', email: `w${email}`, password: 'short' });
  assert.equal(weak.status, 400);
  const token = await login(email, 'Passw0rd!');
  const p = await request(app).patch(`/api/users/${c.body.data.id}`).set(as(admin)).send({ role: 'ADMIN' });
  assert.equal(p.body.data.role, 'ADMIN');
  // Role change invalidates the old token
  assert.equal((await request(app).get('/api/auth/me').set(as(token))).status, 401);
  const d = await request(app).delete(`/api/users/${c.body.data.id}`).set(as(admin));
  assert.equal(d.body.data.isActive, false);
  assert.equal((await request(app).post('/api/auth/login').send({ email, password: 'Passw0rd!' })).status, 401);
  // Cannot deactivate yourself
  const me = (await request(app).get('/api/auth/me').set(as(admin))).body.user;
  assert.equal((await request(app).delete(`/api/users/${me.id}`).set(as(admin))).status, 400);
});

test('change password and logout revoke tokens', async () => {
  const email = `pw${Date.now()}@example.com`;
  await request(app).post('/api/users').set(as(admin)).send({ name: 'Pw User', email, password: 'Passw0rd!' });
  const t1 = await login(email, 'Passw0rd!');
  const wrong = await request(app).post('/api/auth/change-password').set(as(t1)).send({ currentPassword: 'x', newPassword: 'NewPassw0rd' });
  assert.equal(wrong.status, 400);
  const ok = await request(app).post('/api/auth/change-password').set(as(t1)).send({ currentPassword: 'Passw0rd!', newPassword: 'NewPassw0rd' });
  assert.equal(ok.status, 200);
  assert.equal((await request(app).get('/api/auth/me').set(as(t1))).status, 401);
  const t2 = ok.body.token;
  assert.equal((await request(app).get('/api/auth/me').set(as(t2))).status, 200);
  assert.equal((await request(app).post('/api/auth/logout').set(as(t2))).status, 200);
  assert.equal((await request(app).get('/api/auth/me').set(as(t2))).status, 401);
});

test('categories: duplicate name rejected, in-use category cannot be deleted', async () => {
  assert.equal((await request(app).post('/api/categories').set(as(admin)).send({ name: 'laptop' })).status, 409);
  assert.equal((await request(app).delete('/api/categories/1').set(as(admin))).status, 409);
  const c = await request(app).post('/api/categories').set(as(admin)).send({ name: `Temp ${Date.now()}` });
  assert.equal(c.status, 201);
  assert.equal((await request(app).delete(`/api/categories/${c.body.data.id}`).set(as(admin))).status, 204);
});

test('reports summary and repairs totals', async () => {
  const r = await request(app).get('/api/reports/summary?warrantyDays=60').set(as(viewer));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.warrantyDays, 60);
  const rep = await request(app).get('/api/repairs').set(as(viewer));
  const sum = (await prisma.repair.aggregate({ _sum: { cost: true } }))._sum.cost;
  assert.ok(Math.abs(rep.body.meta.totals.totalCost - Number(sum)) < 0.01);
});

test('unknown routes are 404 JSON; malformed JSON is 400', async () => {
  const r = await request(app).get('/api/nope');
  assert.equal(r.status, 404);
  assert.ok(r.body.error.message);
  const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
  assert.equal(bad.status, 400);
});
