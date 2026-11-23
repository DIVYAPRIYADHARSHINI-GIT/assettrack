export const STATUS = {
  IN_STOCK: { label: 'In Stock', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300', color: '#10b981' },
  ASSIGNED: { label: 'Assigned', cls: 'bg-blue-100 text-blue-800 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300', color: '#3b82f6' },
  UNDER_REPAIR: { label: 'Under Repair', cls: 'bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300', color: '#f59e0b' },
  RETIRED: { label: 'Retired', cls: 'bg-slate-200 text-slate-700 ring-slate-500/20 dark:bg-slate-500/20 dark:text-slate-300', color: '#94a3b8' },
};
export const STATUS_KEYS = Object.keys(STATUS);

export const REPAIR_STATUS = {
  OPEN: { label: 'Open', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
};

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n, decimals = false) => (decimals ? inr2 : inr).format(Number(n) || 0);
/** Short Indian-style amount for tight spaces: ₹17.06 L, ₹1.2 Cr, ₹85,000. */
export function moneyCompact(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return money(v);
}
/** Plain "Rs 1,23,456" for jsPDF, whose built-in fonts have no ₹ glyph. */
export const moneyPdf = (n) => 'Rs ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(n) || 0);

/** 'YYYY-MM-DD' -> '12 Mar 2026' without timezone drift. */
export function date(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y) return '—';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function dateTime(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(s) {
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} d ago`;
  return date(new Date(s).toISOString());
}

/** Local calendar date as YYYY-MM-DD (for default form values). */
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const ACTION_META = {
  CREATE: { label: 'Created', cls: 'bg-emerald-500' },
  UPDATE: { label: 'Updated', cls: 'bg-slate-400' },
  DELETE: { label: 'Deleted', cls: 'bg-red-500' },
  ASSIGN: { label: 'Assigned', cls: 'bg-blue-500' },
  RETURN: { label: 'Returned', cls: 'bg-indigo-500' },
  REPAIR_START: { label: 'Repair started', cls: 'bg-amber-500' },
  REPAIR_UPDATE: { label: 'Repair updated', cls: 'bg-amber-400' },
  REPAIR_CLOSE: { label: 'Repair closed', cls: 'bg-teal-500' },
  RETIRE: { label: 'Retired', cls: 'bg-slate-600' },
  IMPORT: { label: 'Imported', cls: 'bg-purple-500' },
};

/** URL the QR code encodes: opens the scan page which resolves the tag. */
export const qrUrlFor = (tag) => `${window.location.origin}/scan/${encodeURIComponent(tag)}`;

/** Extract an asset tag from any scanned text (our URL, or a bare tag). */
export function tagFromScan(text) {
  const m = String(text || '').toUpperCase().match(/AT-\d{4,}/);
  return m ? m[0] : null;
}
