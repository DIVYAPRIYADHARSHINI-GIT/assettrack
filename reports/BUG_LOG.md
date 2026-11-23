# AssetTrack bug log

Running log kept during development and testing. Screenshots are in `reports/screenshots/`; API-only bugs also have request/response transcripts in `reports/evidence/`.

| ID | Page / endpoint | Severity | Status |
| --- | --- | --- | --- |
| BUG-01 | `POST /api/assets/:id/assign` (all optional text fields) | High | Fixed |
| BUG-02 | `POST /api/csv/import` date error message | Low | Fixed |
| BUG-03 | `/repairs` mobile layout (also Users, Reports) | Medium | Fixed |
| BUG-04 | `/qr-labels`, `/assets/:id` mobile layout | Medium | Fixed |
| BUG-05 | Dashboard Total value KPI truncated | Medium | Fixed |
| BUG-06 | `/import-export` preview error column cramped | Low | Fixed |
| BUG-07 | SPA deep links `/assets/:id` return 500 (single service) | High | Fixed |
| BUG-08 | Production build calls localhost API (CSP block) | High | Fixed |

## BUG-01: Assign fails when optional "condition notes" is omitted

- **Page / endpoint:** `POST /api/assets/:id/assign`; also affects every endpoint with optional text or date fields (assets, repairs, return).
- **Steps to reproduce:** log in as admin; `POST /api/assets/1/assign` with employeeName, employeeEmail, department and assignedAt but no `conditionNotes`.
- **Expected:** 201 Created (condition notes are optional).
- **Actual:** 400 `conditionNotes: Invalid input: expected nonoptional, received undefined`.
- **Cause:** in Zod 4, a schema ending in `.transform()` is not optional, so a missing key fails even though the inner union allows `undefined`.
- **Fix:** `zOptionalText` and `zOptionalDate` in `backend/src/lib/validate.js` now end with `.optional()`.
- **Re-test:** the same request returns 201, and the return call returns 200 (see `evidence/BUG-01-after.txt`).
- **Severity:** High (the core assign flow was blocked).
- **Evidence:** `evidence/BUG-01-before.txt`, `evidence/BUG-01-after.txt`; screenshots `screenshots/BUG-01-assign-optional-notes-400.png` and `screenshots/BUG-01-fixed.png` (rendered from the transcripts).
- **Status:** Fixed

## BUG-02: CSV row error for a bad date only says "Invalid input"

- **Page / endpoint:** `POST /api/csv/import` (and the Import/Export page preview)
- **Steps to reproduce:** import a CSV row with `purchaseDate` = `2026-13-40`.
- **Expected:** a clear message naming the bad value and the expected format.
- **Actual:** `purchaseDate: Invalid input` (Zod's generic union error).
- **Fix:** `zOptionalDate` now validates the string itself and reports `"2026-13-40" is not a valid date (use YYYY-MM-DD)`.
- **Re-test:** see `evidence/BUG-02-after.txt`.
- **Screenshots:** `BUG-02-csv-date-error-unclear.png` -> `BUG-02-fixed.png`
- **Severity:** Low
- **Status:** Fixed

## BUG-03: Repairs page scrolls sideways on mobile (416 px overflow)

- **Page:** `/repairs` at 390 px width (also Users and Reports tables)
- **Steps to reproduce:** open Repairs on a phone-width screen and swipe left.
- **Expected:** only the table scrolls inside its card; the page itself fits the screen.
- **Actual:** the whole page was 806 px wide, and the header, KPI cards and sidebar toggle scrolled away with the table.
- **Cause:** the table's `sr-only` "Actions" header (absolutely positioned) escaped the `overflow-x-auto` wrapper, because the wrapper was not a positioning context.
- **Fix:** table wrappers are now `relative overflow-x-auto` (Repairs, Users, Reports).
- **Severity:** Medium
- **Screenshots:** `BUG-03-repairs-mobile-overflow.png` -> `BUG-03-fixed.png`
- **Status:** Fixed

## BUG-04: QR labels and asset detail pages overflow on mobile

- **Page:** `/qr-labels` (12 px) and `/assets/:id` (94 px) at 390 px width
- **Steps to reproduce:** open QR labels or any asset on a phone-width screen.
- **Expected:** no horizontal scroll.
- **Actual:** the page scrolled sideways; on the asset page the Details card was cut off on the right.
- **Cause:** CSS grid items default to `min-width: auto`, so the scrollable tab bar and the long label rows forced the single grid column wider than the screen.
- **Fix:** grids use `grid-cols-1` with `min-w-0` columns (asset detail, QR labels, dashboard, import/export, settings).
- **Severity:** Medium
- **Screenshots:** `BUG-04-qr-labels-mobile-overflow.png` -> `BUG-04-fixed.png`
- **Status:** Fixed

## BUG-05: Dashboard "Total value" KPI is truncated

- **Page:** `/` (Dashboard), desktop 1440 px
- **Steps to reproduce:** log in as admin and look at the Total value card.
- **Expected:** the full total asset value is readable.
- **Actual:** it showed `₹17,06,0...`, so the KPI could not be read and could not be checked against the data.
- **Fix:** the card shows a compact Indian figure (`₹17.06 L`) with the exact amount in the subtitle and tooltip.
- **Severity:** Medium (wrong-looking number on the main KPI)
- **Screenshots:** `BUG-05-dashboard-total-value-truncated.png` -> `BUG-05-fixed.png`
- **Status:** Fixed

## BUG-06: Import preview error column is too narrow to read

- **Page:** `/import-export`, preview table after choosing a CSV with errors
- **Steps to reproduce:** upload a CSV with an unknown category, a bad date and a bad status in one row.
- **Expected:** row errors are easy to read next to the row.
- **Actual:** the Result column was squeezed to about 70 px, so each message wrapped to one or two words per line and the row was taller than the screen.
- **Fix:** the Result column has a fixed 20 rem width and the table scrolls horizontally inside its card.
- **Severity:** Low
- **Screenshots:** `BUG-06-import-errors-cramped.png` -> `BUG-06-fixed.png`
- **Status:** Fixed

## BUG-07: Refreshing an asset page returns HTTP 500 on the single-service build

- **Page:** any `/assets/:id` deep link (refresh, a shared link, or opening a scanned QR) when the backend serves the frontend
- **Steps to reproduce:** build with `npm run build`, run `npm start`, open `/assets/12` directly.
- **Expected:** the app loads and shows asset 12.
- **Actual:** HTTP 500 `ENOENT ... frontend/dist/assets/12`.
- **Cause:** the app route `/assets/...` shares its prefix with Vite's `/assets/` build folder, and the static handler had `fallthrough: false`, so a miss became an error instead of reaching the SPA fallback.
- **Fix:** the static handler falls through, so built files are still served and other `/assets/*` paths load the app.
- **Severity:** High (QR links and refreshes broke)
- **Screenshots:** `BUG-07-deep-link-500.png` -> `BUG-07-fixed.png`
- **Status:** Fixed

## BUG-08: Production build calls `localhost:4000` and the CSP blocks it

- **Page:** `/login` on the single-service production build
- **Steps to reproduce:** build the frontend while `frontend/.env` has the dev `VITE_API_URL`, serve it from the backend, try to sign in.
- **Expected:** the app calls its own origin.
- **Actual:** console: `Connecting to http://localhost:4000/api/health violates the Content Security Policy`, and sign-in never completed.
- **Fix:** a committed `frontend/.env.production` sets `VITE_API_URL=` (same origin) for production builds; the API client resolves relative URLs against `window.location.origin`.
- **Severity:** High (the live site would not have worked)
- **Screenshots:** `BUG-08-prod-build-calls-localhost.png` -> `BUG-08-fixed.png`
- **Status:** Fixed
