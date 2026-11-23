# AssetTrack: Final Report

**Office asset and inventory tracker**

| | |
| --- | --- |
| Version | 1.0.0 |
| Date | 23 November 2026 |
| Built by | Divya Priyadharshini |
| Repository | https://github.com/DIVYAPRIYADHARSHINI-GIT/assettrack |
| Live site | **https://assettrack-99iv.onrender.com** (health: https://assettrack-99iv.onrender.com/api/health) |
| Demo logins | admin@assettrack.com / Admin@123 (Admin) · viewer@assettrack.com / Viewer@123 (Viewer) |

---

## 1. Project summary

AssetTrack is a full-stack web application for tracking office assets: laptops, monitors, phones, furniture and accessories. It records who holds each asset, its warranty and repair history, and what the inventory is worth. Admins manage everything; viewers have read-only access to assets, the dashboard and reports.

**Tech stack**

| Layer | Tools |
| --- | --- |
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router 7, Recharts, `qrcode`, `jsqr`, jsPDF + autotable, sonner, lucide-react |
| Backend | Node.js 20+, Express 5 (REST), Prisma 6, zod validation, JWT (jsonwebtoken), bcryptjs, helmet (CSP), cors, express-rate-limit, multer, csv-parse/stringify |
| Database | SQLite through Prisma, migrated and seeded automatically on start |
| Tests | 18 API integration tests (node:test + supertest); 36 browser acceptance checks (puppeteer-core in installed Google Chrome) plus a 104-view exploratory page sweep |
| Hosting | Render free web service; one service serves the API and the built frontend |

**Change from the original brief:** the brief specified PostgreSQL on Neon, plus a separate static frontend host. The app was built and fully tested on PostgreSQL first. At the owner's request (no API keys or accounts to create) it was then moved to **SQLite** with the backend serving the frontend, so deployment is a single click-through on Render with no secrets to handle. The Prisma models are unchanged apart from the provider. The full test suites were re-run and pass on the new setup.

**Folder structure**

```
assettrack/
├── backend/     Express API: prisma/ (schema, migrations, seed), src/ (routes, middleware, lib), test/
├── frontend/    React app: src/ (pages, components, context, api, lib)
├── e2e/         browser acceptance suite and page sweep
├── reports/     this report, BUG_LOG.md, screenshots/, evidence/
├── render.yaml  Render Blueprint (free plan)
└── package.json root build/start scripts
```

## 2. Features: asked vs built

| Requirement | Status | Notes |
| --- | --- | --- |
| React + Vite + Tailwind + React Router + Recharts | Done | |
| Node + Express REST, JWT, bcrypt | Done | JWT expiry `JWT_EXPIRES_IN` (8 h); logout revokes the token id |
| PostgreSQL (Neon) + Prisma + seed | **Changed** | Prisma + seed kept; provider switched to SQLite at the owner's request (see section 1) |
| Separate `/frontend` and `/backend` projects, `.env.example` for both | Done | |
| CORS reading the frontend URL from env | Done | `CORS_ORIGIN`; same-origin is always allowed |
| Roles Admin / Viewer; seed admin + viewer + 40 assets | Done | 6 categories, 40 assets, assignment and repair history |
| Auth: login, logout, me, change password | Done | Password change signs out other sessions |
| Users: create, edit, deactivate, set role | Done | Last active admin is protected |
| Categories CRUD (6 defaults) | Done | Delete is blocked while in use |
| Assets CRUD with all fields, auto tag AT-0001, unique serial | Done | Atomic counter for tags; serial uniqueness is case-insensitive |
| Assignments, return flow, block if not In Stock, full history | Done | 409 with a clear reason |
| Repairs: start -> Under Repair, close -> In Stock | Done | Cost totals |
| Dashboard endpoint (totals, assigned vs free, warranty 30/60/90, activity, value) | Done | |
| Activity log of every action with user and time | Done | Includes changed fields on update |
| Search, filters (category, status, location, warranty), sort, pagination | Done | |
| CSV import with per-row error report; CSV export | Done | Preview (dry run), error-report download, filtered export |
| QR data endpoint by tag | Done | Public, non-sensitive fields only |
| `/api/health` | Done | Includes a DB check |
| Validation, status codes, central errors, login rate limit, helmet, CORS | Done | |
| Login page with "Waking up the server" notice | Done | Shown when health or login takes more than ~3 s |
| Dashboard: KPIs, donut, bar chart, warranty tabs, activity feed | Done | |
| Assets list: search, filters, sort, pagination, badges, bulk select and export, Add (admin) | Done | Mobile card layout |
| Asset detail: fields, QR, holder, timeline, repairs, activity, actions | Done | |
| Add/Edit form with validation | Done | Client- and server-side |
| Assign and Return dialogs | Done | |
| Repairs page: list, add, close, cost totals | Done | |
| QR labels sheet + PDF; camera scan page | Done | A4, 24 per page; camera, photo upload or typed tag |
| Import/Export page | Done | |
| Reports page with printable PDF | Done | Four sections |
| Users page (admin) | Done | |
| Settings / change password | Done | |
| Sidebar, top bar, user menu, responsive, light/dark | Done | |
| Skeletons, empty states, toasts, confirm dialogs | Done | |
| Viewer read-only in UI and blocked in API | Done | 12 endpoints tested for 403 |
| GitHub repo with clean commits | Done | Small, focused commits on `main` (backend setup, auth, assets, dashboard, CSV/QR, frontend pages, fixes, deploy, docs) |
| Live site | Done | https://assettrack-99iv.onrender.com on the Render free plan; 36 / 36 live browser checks pass |

## 3. API list

All paths are under `/api`. "Signed in" means any active user (Admin or Viewer).

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | /health | Public | Liveness + DB check |
| POST | /auth/login | Public, rate limited | Email + password -> JWT |
| POST | /auth/logout | Signed in | Revoke current token |
| GET | /auth/me | Signed in | Current user |
| POST | /auth/change-password | Signed in | New password; new token |
| GET | /users | Admin | List/search users |
| POST | /users | Admin | Create user |
| GET | /users/:id | Admin | User detail |
| PATCH | /users/:id | Admin | Edit name/email/role/active/password |
| DELETE | /users/:id | Admin | Deactivate |
| GET | /categories | Signed in | List with asset counts |
| POST | /categories | Admin | Create |
| PATCH | /categories/:id | Admin | Rename/describe |
| DELETE | /categories/:id | Admin | Delete (blocked if in use) |
| GET | /assets | Signed in | List: search, categoryId, status, location, warranty, ids, sortBy, order, page, pageSize |
| GET | /assets/locations | Signed in | Distinct locations |
| GET | /assets/by-tag/:tag | Signed in | Resolve a scanned tag |
| GET | /assets/:id | Signed in | Detail with assignments and repairs |
| GET | /assets/:id/assignments | Signed in | Assignment history |
| GET | /assets/:id/repairs | Signed in | Repair history |
| GET | /assets/:id/activity | Signed in | Activity log |
| POST | /assets | Admin | Create (tag auto-generated) |
| PATCH | /assets/:id | Admin | Edit fields (not status) |
| DELETE | /assets/:id | Admin | Delete (blocked if assigned or in repair) |
| POST | /assets/:id/assign | Admin | Assign (In Stock only) |
| POST | /assets/:id/return | Admin | Return |
| POST | /assets/:id/retire | Admin | Retire (In Stock only) |
| POST | /assets/:id/reactivate | Admin | Retired -> In Stock |
| GET | /repairs | Signed in | List + cost totals |
| GET | /repairs/:id | Signed in | Detail |
| POST | /repairs | Admin | Start repair |
| PATCH | /repairs/:id | Admin | Edit repair |
| POST | /repairs/:id/close | Admin | Close repair |
| GET | /dashboard | Signed in | KPIs, charts, warranty lists, activity |
| GET | /activity | Signed in | Global activity log |
| GET | /csv/template | Signed in | Import template |
| GET | /csv/export | Signed in | Filtered CSV export |
| POST | /csv/import | Admin | Import (`?dryRun=true` previews) |
| GET | /reports/summary | Signed in | Report data |
| GET | /qr/:tag | Public | Non-sensitive asset details |

## 4. Database design

| Table | Key columns | Relations |
| --- | --- | --- |
| **User** | id, name, email (unique), passwordHash, role (ADMIN/VIEWER), isActive, tokenVersion, lastLoginAt | creates Assets, Assignments, Repairs; writes ActivityLog |
| **Category** | id, name (unique), description | 1-to-many Asset (delete restricted) |
| **Asset** | id, assetTag (unique), name, categoryId, brand, model, serialNumber (unique), purchaseDate, purchasePrice, vendor, warrantyEnd, location, status, notes, createdById | belongs to Category; has many Assignments, Repairs, ActivityLog |
| **Assignment** | id, assetId, employeeName, employeeEmail, department, assignedAt, conditionNotes, returnedAt, returnCondition, returnNotes, assignedById, returnedById | belongs to Asset; an open assignment has `returnedAt` = null |
| **Repair** | id, assetId, issue, vendor, cost, startDate, endDate, status (OPEN/IN_PROGRESS/COMPLETED), notes, createdById | belongs to Asset |
| **ActivityLog** | id, action, entityType, entityId, assetId, userId, message, details (JSON), createdAt | optional links to Asset and User |
| **Counter** | name, value | gap-free asset tag sequence |
| **RevokedToken** | jti, expiresAt | logout blacklist |

Indexes on asset status, category, location and warranty end; assignment asset and return date; repair asset and status; activity asset and time. Status changes happen only inside transactions with a conditional update (`WHERE status = 'IN_STOCK'`), so two admins cannot assign the same asset at once.

## 5. Testing summary

**Automated suites**

| Suite | Result |
| --- | --- |
| Backend API tests (`cd backend && npm test`), on PostgreSQL and again on SQLite | 18 / 18 pass |
| Browser acceptance, local dev (Vite + API) | 36 / 36 pass |
| Browser acceptance, single-service production build | 36 / 36 pass |
| Browser acceptance, fresh clone from GitHub, built like Render (`npm run build`, `npm start`, no `.env`) | 36 / 36 pass |
| Page sweep: 13 pages x 2 roles x desktop/mobile x light/dark (104 views) | 0 console errors, 0 failed requests, 0 horizontal overflow (after fixes) |
| **Live site** https://assettrack-99iv.onrender.com, browser acceptance (23 Nov 2026, 12:20 IST) | **36 / 36 pass** |

**Acceptance checks (from the brief)**

| Check | Result | How it was verified |
| --- | --- | --- |
| Login works for both roles | Pass | Browser login as admin and viewer |
| Viewer cannot modify anything | Pass | No edit buttons on any page; admin-only routes redirect; 12 write endpoints return 403 |
| Add an asset | Pass | Form validation shown, AT-00xx generated, duplicate serial rejected |
| Assign it | Pass | Assign dialog; status Assigned; double-assign blocked (409) |
| Return it | Pass | Return dialog; condition recorded; In Stock |
| Send to repair | Pass | Status Under Repair |
| Close the repair | Pass | Status In Stock, final cost saved |
| Each step in history and the activity log | Pass | Timeline, repair tab and activity log show Created, Assigned, Returned, Repair started, Repair closed, with user "Asha Admin" |
| QR opens the correct asset when scanned | Pass | QR image decoded with jsQR -> `/scan/AT-00xx` opens the asset; camera stream test; photo upload test |
| CSV import with a bad row shows a clear error and imports the valid rows | Pass | 4-row file: 2 imported, 2 rejected with field errors (unknown category, invalid date, bad price, status, duplicate serial) |
| Dashboard numbers match the asset data | Pass | API and UI KPIs compared with counts and sums over all assets |
| Frontend and backend run locally together with seed data | Pass | |
| README steps work from a clean clone | Pass | Fresh `git clone` from GitHub, followed the steps, 36 / 36 |
| Desktop and mobile width, light and dark mode | Pass | 104-view sweep + mobile dark checks |
| QR labels PDF, Reports PDF, CSV export | Pass | Files downloaded and checked (`%PDF-` header, row counts) |

## 6. Bug log

Eight bugs were found while testing. All are fixed and re-tested.

| ID | Page / endpoint | Severity | Status |
| --- | --- | --- | --- |
| BUG-01 | POST /api/assets/:id/assign (optional fields) | High | Fixed |
| BUG-02 | POST /api/csv/import date error message | Low | Fixed |
| BUG-03 | /repairs mobile layout (also Users, Reports) | Medium | Fixed |
| BUG-04 | /qr-labels and /assets/:id mobile layout | Medium | Fixed |
| BUG-05 | Dashboard Total value KPI truncated | Medium | Fixed |
| BUG-06 | /import-export error column cramped | Low | Fixed |
| BUG-07 | Deep links /assets/:id return 500 (single service) | High | Fixed |
| BUG-08 | Production build calls localhost API (CSP block) | High | Fixed |

{{BUG_DETAILS}}

## 7. Working screenshots

Screenshots of the running app (local build). The live-site screenshots follow in section 7b.

{{SCREENSHOTS}}

### 7b. Live site screenshots

Taken on https://assettrack-99iv.onrender.com during the live acceptance run.

{{LIVE_SCREENSHOTS}}

## 8. Deployment details

| Item | Value |
| --- | --- |
| Live site (frontend + API, one URL) | https://assettrack-99iv.onrender.com |
| Health check | https://assettrack-99iv.onrender.com/api/health returns `{"status":"ok","database":"ok"}` |
| Database | SQLite file `backend/prisma/data/assettrack.db` inside the Render service, migrated and seeded on start (no Neon project) |
| GitHub | https://github.com/DIVYAPRIYADHARSHINI-GIT/assettrack (branch `main`) |
| Host | Render free web service from `render.yaml` (auto-deploys on push to `main`) |

**How it was deployed (reproducible)**

1. Sign in at https://dashboard.render.com (free plan, GitHub sign-in; no card).
2. **New +** -> **Blueprint** -> connect GitHub -> choose **DIVYAPRIYADHARSHINI-GIT/assettrack**.
3. Keep branch `main` and path `render.yaml`, name it `assettrack`, then **Apply / Deploy Blueprint**. `JWT_SECRET` is generated by Render; nothing needs to be typed in.
4. The service went **Live** at https://assettrack-99iv.onrender.com. The same 36-check browser suite was then run against it (all pass), and the README and this report were updated with the link.

**Environment variables (names only)**

- Backend: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `PORT`, `NODE_ENV`, `LOGIN_RATE_LIMIT`, `TEST_DATABASE_URL` (tests only). On Render, also `NODE_VERSION`.
- Frontend: `VITE_API_URL` (local dev only; empty in production).

**Local run**

```
cd backend && cp .env.example .env && npm install && npx prisma migrate deploy && npm run seed && npm run dev
cd frontend && cp .env.example .env && npm install && npm run dev      # http://localhost:5173
```

Or as one service from the repo root: `npm run build && npm start`.

**Demo logins:** admin@assettrack.com / Admin@123 (Admin), viewer@assettrack.com / Viewer@123 (Viewer).

## 9. Known limitations and next improvements

**Limitations**

- On Render's free plan there is no persistent disk, so the SQLite database is recreated from the seed data on every restart, redeploy or wake from sleep. Changes made on the live demo are temporary.
- Free instances sleep after about 15 minutes idle and take up to a minute to wake. The login page shows a notice while this happens.
- Camera scanning needs HTTPS and camera permission; photo upload and typed tags are the fallbacks.
- Single currency (INR). No email notifications.

**Suggested next improvements**

1. Persistent data: a Render disk (paid) or switching the Prisma provider back to PostgreSQL (the schema was first built and tested on it).
2. Email reminders for warranties expiring within 30 days and for overdue returns.
3. Attachments (invoices, photos) stored in object storage.
4. An employee directory with an "assets held by person" view, and self-service acknowledgement.
5. Depreciation calculation and a value-over-time chart.
6. Audit-log export and a detailed per-user activity filter.

---

*Prepared by Divya Priyadharshini · AssetTrack v1.0.0 · 23 November 2026*
