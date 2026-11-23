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

### BUG-01: Assign fails when optional "condition notes" is omitted

- **Page / endpoint:** `POST /api/assets/:id/assign`; also affects every endpoint with optional text or date fields (assets, repairs, return).
- **Steps to reproduce:** log in as admin; `POST /api/assets/1/assign` with employeeName, employeeEmail, department and assignedAt but no `conditionNotes`.
- **Expected:** 201 Created (condition notes are optional).
- **Actual:** 400 `conditionNotes: Invalid input: expected nonoptional, received undefined`.
- **Cause:** in Zod 4, a schema ending in `.transform()` is not optional, so a missing key fails even though the inner union allows `undefined`.
- **Fix:** `zOptionalText` and `zOptionalDate` in `backend/src/lib/validate.js` now end with `.optional()`.
- **Re-test:** the same request returns 201, and the return call returns 200 (see `evidence/BUG-01-after.txt`).
- **Severity:** High (the core assign flow was blocked).
- **Status:** Fixed

<div class="pair"><figure><img src="screenshots/BUG-01-assign-optional-notes-400.png"><figcaption>Before: BUG-01-assign-optional-notes-400.png</figcaption></figure><figure><img src="screenshots/BUG-01-fixed.png"><figcaption>After fix: BUG-01-fixed.png</figcaption></figure></div>


### BUG-02: CSV row error for a bad date only says "Invalid input"

- **Page / endpoint:** `POST /api/csv/import` (and the Import/Export page preview)
- **Steps to reproduce:** import a CSV row with `purchaseDate` = `2026-13-40`.
- **Expected:** a clear message naming the bad value and the expected format.
- **Actual:** `purchaseDate: Invalid input` (Zod's generic union error).
- **Fix:** `zOptionalDate` now validates the string itself and reports `"2026-13-40" is not a valid date (use YYYY-MM-DD)`.
- **Re-test:** see `evidence/BUG-02-after.txt`.
- **Severity:** Low
- **Status:** Fixed

<div class="pair"><figure><img src="screenshots/BUG-02-csv-date-error-unclear.png"><figcaption>Before: BUG-02-csv-date-error-unclear.png</figcaption></figure><figure><img src="screenshots/BUG-02-fixed.png"><figcaption>After fix: BUG-02-fixed.png</figcaption></figure></div>


### BUG-03: Repairs page scrolls sideways on mobile (416 px overflow)

- **Page:** `/repairs` at 390 px width (also Users and Reports tables)
- **Steps to reproduce:** open Repairs on a phone-width screen and swipe left.
- **Expected:** only the table scrolls inside its card; the page itself fits the screen.
- **Actual:** the whole page was 806 px wide, and the header, KPI cards and sidebar toggle scrolled away with the table.
- **Cause:** the table's `sr-only` "Actions" header (absolutely positioned) escaped the `overflow-x-auto` wrapper, because the wrapper was not a positioning context.
- **Fix:** table wrappers are now `relative overflow-x-auto` (Repairs, Users, Reports).
- **Severity:** Medium
- **Status:** Fixed

<div class="pair"><figure><img src="screenshots/BUG-03-repairs-mobile-overflow.png"><figcaption>Before: BUG-03-repairs-mobile-overflow.png</figcaption></figure><figure><img src="screenshots/BUG-03-fixed.png"><figcaption>After fix: BUG-03-fixed.png</figcaption></figure></div>


### BUG-04: QR labels and asset detail pages overflow on mobile

- **Page:** `/qr-labels` (12 px) and `/assets/:id` (94 px) at 390 px width
- **Steps to reproduce:** open QR labels or any asset on a phone-width screen.
- **Expected:** no horizontal scroll.
- **Actual:** the page scrolled sideways; on the asset page the Details card was cut off on the right.
- **Cause:** CSS grid items default to `min-width: auto`, so the scrollable tab bar and the long label rows forced the single grid column wider than the screen.
- **Fix:** grids use `grid-cols-1` with `min-w-0` columns (asset detail, QR labels, dashboard, import/export, settings).
- **Severity:** Medium
- **Status:** Fixed

<div class="pair"><figure><img src="screenshots/BUG-04-qr-labels-mobile-overflow.png"><figcaption>Before: BUG-04-qr-labels-mobile-overflow.png</figcaption></figure><figure><img src="screenshots/BUG-04-fixed.png"><figcaption>After fix: BUG-04-fixed.png</figcaption></figure></div>


### BUG-05: Dashboard "Total value" KPI is truncated

- **Page:** `/` (Dashboard), desktop 1440 px
- **Steps to reproduce:** log in as admin and look at the Total value card.
- **Expected:** the full total asset value is readable.
- **Actual:** it showed `₹17,06,0...`, so the KPI could not be read and could not be checked against the data.
- **Fix:** the card shows a compact Indian figure (`₹17.06 L`) with the exact amount in the subtitle and tooltip.
- **Severity:** Medium (wrong-looking number on the main KPI)
- **Status:** Fixed

<div class="pair"><figure><img src="screenshots/BUG-05-dashboard-total-value-truncated.png"><figcaption>Before: BUG-05-dashboard-total-value-truncated.png</figcaption></figure><figure><img src="screenshots/BUG-05-fixed.png"><figcaption>After fix: BUG-05-fixed.png</figcaption></figure></div>


### BUG-06: Import preview error column is too narrow to read

- **Page:** `/import-export`, preview table after choosing a CSV with errors
- **Steps to reproduce:** upload a CSV with an unknown category, a bad date and a bad status in one row.
- **Expected:** row errors are easy to read next to the row.
- **Actual:** the Result column was squeezed to about 70 px, so each message wrapped to one or two words per line and the row was taller than the screen.
- **Fix:** the Result column has a fixed 20 rem width and the table scrolls horizontally inside its card.
- **Severity:** Low
- **Status:** Fixed

<div class="pair"><figure><img src="screenshots/BUG-06-import-errors-cramped.png"><figcaption>Before: BUG-06-import-errors-cramped.png</figcaption></figure><figure><img src="screenshots/BUG-06-fixed.png"><figcaption>After fix: BUG-06-fixed.png</figcaption></figure></div>


### BUG-07: Refreshing an asset page returns HTTP 500 on the single-service build

- **Page:** any `/assets/:id` deep link (refresh, a shared link, or opening a scanned QR) when the backend serves the frontend
- **Steps to reproduce:** build with `npm run build`, run `npm start`, open `/assets/12` directly.
- **Expected:** the app loads and shows asset 12.
- **Actual:** HTTP 500 `ENOENT ... frontend/dist/assets/12`.
- **Cause:** the app route `/assets/...` shares its prefix with Vite's `/assets/` build folder, and the static handler had `fallthrough: false`, so a miss became an error instead of reaching the SPA fallback.
- **Fix:** the static handler falls through, so built files are still served and other `/assets/*` paths load the app.
- **Severity:** High (QR links and refreshes broke)
- **Status:** Fixed

<div class="pair"><figure><img src="screenshots/BUG-07-deep-link-500.png"><figcaption>Before: BUG-07-deep-link-500.png</figcaption></figure><figure><img src="screenshots/BUG-07-fixed.png"><figcaption>After fix: BUG-07-fixed.png</figcaption></figure></div>


### BUG-08: Production build calls `localhost:4000` and the CSP blocks it

- **Page:** `/login` on the single-service production build
- **Steps to reproduce:** build the frontend while `frontend/.env` has the dev `VITE_API_URL`, serve it from the backend, try to sign in.
- **Expected:** the app calls its own origin.
- **Actual:** console: `Connecting to http://localhost:4000/api/health violates the Content Security Policy`, and sign-in never completed.
- **Fix:** a committed `frontend/.env.production` sets `VITE_API_URL=` (same origin) for production builds; the API client resolves relative URLs against `window.location.origin`.
- **Severity:** High (the live site would not have worked)
- **Status:** Fixed

<div class="pair"><figure><img src="screenshots/BUG-08-prod-build-calls-localhost.png"><figcaption>Before: BUG-08-prod-build-calls-localhost.png</figcaption></figure><figure><img src="screenshots/BUG-08-fixed.png"><figcaption>After fix: BUG-08-fixed.png</figcaption></figure></div>


## 7. Working screenshots

Screenshots of the running app (local build). The live-site screenshots follow in section 7b.

<figure class="shot"><img src="screenshots/local-01-login.png"><figcaption>Login page (demo-account buttons)</figcaption></figure>
<figure class="shot"><img src="screenshots/local-login-waking-up.png"><figcaption>Login: "Waking up the server, please wait…" on a slow first request</figcaption></figure>
<figure class="shot"><img src="screenshots/local-02-dashboard.png"><figcaption>Dashboard: KPI cards, category donut, status bars, warranty tabs, activity feed</figcaption></figure>
<figure class="shot"><img src="screenshots/local-03-assets-list.png"><figcaption>Assets list: search, filters, sortable columns, status badges, pagination</figcaption></figure>
<figure class="shot"><img src="screenshots/local-assets-bulk-select.png"><figcaption>Assets list: bulk selection with Export selected and QR labels</figcaption></figure>
<figure class="shot"><img src="screenshots/local-04-asset-detail-qr.png"><figcaption>Asset detail: fields, QR code, current holder, assignment timeline</figcaption></figure>
<figure class="shot"><img src="screenshots/local-asset-activity-log.png"><figcaption>Asset detail: activity log after create, assign, return, repair, close</figcaption></figure>
<figure class="shot"><img src="screenshots/local-05-asset-form-validation.png"><figcaption>Add asset form with validation messages</figcaption></figure>
<figure class="shot"><img src="screenshots/local-06-assign-dialog.png"><figcaption>Assign dialog</figcaption></figure>
<figure class="shot"><img src="screenshots/local-return-dialog.png"><figcaption>Return dialog</figcaption></figure>
<figure class="shot"><img src="screenshots/local-repair-dialog.png"><figcaption>Log repair dialog</figcaption></figure>
<figure class="shot"><img src="screenshots/local-confirm-retire-dialog.png"><figcaption>Confirm dialog for a destructive action (retire)</figcaption></figure>
<figure class="shot"><img src="screenshots/local-09-repairs.png"><figcaption>Repairs: list, cost totals, close action</figcaption></figure>
<figure class="shot"><img src="screenshots/local-07-qr-labels.png"><figcaption>QR labels: selection and printable sheet preview (PDF download)</figcaption></figure>
<figure class="shot"><img src="screenshots/local-scan-page.png"><figcaption>Scan QR page (camera, photo upload, typed tag)</figcaption></figure>
<figure class="shot"><img src="screenshots/local-08-import-preview-errors.png"><figcaption>Import/Export: CSV preview with row errors</figcaption></figure>
<figure class="shot"><img src="screenshots/local-08b-import-result.png"><figcaption>Import result: valid rows imported, bad rows skipped</figcaption></figure>
<figure class="shot"><img src="screenshots/local-10-reports.png"><figcaption>Reports page (print / PDF)</figcaption></figure>
<figure class="shot"><img src="screenshots/local-11-users.png"><figcaption>Users (admin only)</figcaption></figure>
<figure class="shot"><img src="screenshots/local-12-settings.png"><figcaption>Settings / change password</figcaption></figure>
<figure class="shot"><img src="screenshots/local-viewer-asset-detail-readonly.png"><figcaption>Viewer: asset detail with no edit actions</figcaption></figure>
<figure class="shot"><img src="screenshots/local-dark-dashboard.png"><figcaption>Dark mode: dashboard</figcaption></figure>
<figure class="shot"><img src="screenshots/local-mobile-dark-dashboard.png"><figcaption>Mobile (390 px), dark: dashboard</figcaption></figure>
<figure class="shot"><img src="screenshots/local-mobile-dark-assets.png"><figcaption>Mobile, dark: assets as cards</figcaption></figure>
<figure class="shot"><img src="screenshots/local-mobile-dark-menu.png"><figcaption>Mobile, dark: navigation drawer</figcaption></figure>

### 7b. Live site screenshots

Taken on https://assettrack-99iv.onrender.com during the live acceptance run.

<figure class="shot"><img src="screenshots/live-01-login.png"><figcaption>Live: Login page (demo-account buttons)</figcaption></figure>
<figure class="shot"><img src="screenshots/live-02-dashboard.png"><figcaption>Live: Dashboard: KPI cards, category donut, status bars, warranty tabs, activity feed</figcaption></figure>
<figure class="shot"><img src="screenshots/live-03-assets-list.png"><figcaption>Live: Assets list: search, filters, sortable columns, status badges, pagination</figcaption></figure>
<figure class="shot"><img src="screenshots/live-04-asset-detail-qr.png"><figcaption>Live: Asset detail: fields, QR code, current holder, assignment timeline</figcaption></figure>
<figure class="shot"><img src="screenshots/live-06-assign-dialog.png"><figcaption>Live: Assign dialog</figcaption></figure>
<figure class="shot"><img src="screenshots/live-09-repairs.png"><figcaption>Live: Repairs: list, cost totals, close action</figcaption></figure>
<figure class="shot"><img src="screenshots/live-07-qr-labels.png"><figcaption>Live: QR labels: selection and printable sheet preview (PDF download)</figcaption></figure>
<figure class="shot"><img src="screenshots/live-08b-import-result.png"><figcaption>Live: Import result: valid rows imported, bad rows skipped</figcaption></figure>
<figure class="shot"><img src="screenshots/live-10-reports.png"><figcaption>Live: Reports page (print / PDF)</figcaption></figure>
<figure class="shot"><img src="screenshots/live-11-users.png"><figcaption>Live: Users (admin only)</figcaption></figure>
<figure class="shot"><img src="screenshots/live-viewer-asset-detail-readonly.png"><figcaption>Live: Viewer: asset detail with no edit actions</figcaption></figure>
<figure class="shot"><img src="screenshots/live-mobile-dark-dashboard.png"><figcaption>Live: Mobile (390 px), dark: dashboard</figcaption></figure>

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
