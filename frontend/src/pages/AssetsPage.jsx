import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Filter, Plus, QrCode, Search, X, PackageSearch } from 'lucide-react';
import { useApi, useDebounced } from '../lib/useApi';
import { download } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { STATUS, STATUS_KEYS, date, money } from '../lib/format';
import { EmptyState, ErrorState, PageHeader, Pagination, StatusBadge, TableSkeleton, Spinner } from '../components/ui';

const COLUMNS = [
  { key: 'assetTag', label: 'Tag' },
  { key: 'name', label: 'Asset' },
  { key: 'category', label: 'Category' },
  { key: 'status', label: 'Status' },
  { key: 'holder', label: 'Holder', sortable: false },
  { key: 'location', label: 'Location' },
  { key: 'warrantyEnd', label: 'Warranty' },
  { key: 'purchasePrice', label: 'Price', align: 'right' },
];

export const FILTER_KEYS = ['search', 'categoryId', 'status', 'location', 'warranty'];

export default function AssetsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState(() => new Set());
  const [showFilters, setShowFilters] = useState(() => FILTER_KEYS.slice(1).some((k) => params.get(k)));
  const [exporting, setExporting] = useState(false);
  const [searchInput, setSearchInput] = useState(params.get('search') || '');
  const search = useDebounced(searchInput, 300);

  const get = (k, d = '') => params.get(k) ?? d;
  const update = (patch, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v == null) next.delete(k);
      else next.set(k, String(v));
    }
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  };

  // Keep the debounced search in the URL.
  useEffect(() => {
    if ((params.get('search') || '') !== search) update({ search });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query = {
    search: get('search'),
    categoryId: get('categoryId'),
    status: get('status'),
    location: get('location'),
    warranty: get('warranty'),
    sortBy: get('sortBy', 'assetTag'),
    order: get('order', 'asc'),
    page: get('page', '1'),
    pageSize: get('pageSize', '10'),
  };
  const { data, meta, loading, error, reload } = useApi('/assets', query);
  const { data: categories } = useApi('/categories');
  const { data: locations } = useApi('/assets/locations');

  const activeFilters = FILTER_KEYS.filter((k) => query[k]).length;
  const rows = data || [];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleSort(key) {
    if (query.sortBy === key) update({ order: query.order === 'asc' ? 'desc' : 'asc' }, false);
    else update({ sortBy: key, order: 'asc' }, false);
  }
  function toggleRow(id) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function togglePage() {
    setSelected((s) => {
      const n = new Set(s);
      rows.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id)));
      return n;
    });
  }

  async function exportCsv(selection) {
    setExporting(true);
    try {
      const q = selection ? { ids: [...selected], sortBy: query.sortBy, order: query.order } : { ...query, page: undefined, pageSize: undefined };
      const r = await download('/csv/export', q);
      toast.success(`Exported ${r.count ?? ''} assets to ${r.name}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setExporting(false);
    }
  }

  const clearFilters = () => {
    setSearchInput('');
    const next = new URLSearchParams(params);
    FILTER_KEYS.forEach((k) => next.delete(k));
    next.delete('page');
    setParams(next, { replace: true });
  };

  const sortIcon = (key) =>
    query.sortBy !== key ? <ArrowUpDown className="size-3.5 opacity-40" /> : query.order === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;

  const categoryName = useMemo(() => Object.fromEntries((categories || []).map((c) => [String(c.id), c.name])), [categories]);

  return (
    <div>
      <PageHeader
        title="Assets"
        subtitle={meta ? `${meta.total} assets · ${money(meta.totalValue)} total value` : 'All tracked office assets'}
        actions={
          <>
            <button className="btn-secondary" onClick={() => exportCsv(false)} disabled={exporting}>
              {exporting ? <Spinner /> : <Download className="size-4" />} Export
            </button>
            {isAdmin && (
              <Link to="/assets/new" className="btn-primary">
                <Plus className="size-4" /> Add asset
              </Link>
            )}
          </>
        }
      />

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center dark:border-slate-800">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search tag, name, serial, brand, holder…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search assets"
            />
          </div>
          <div className="flex gap-2">
            <button className={`btn-secondary ${showFilters ? 'ring-2 ring-brand-500/30' : ''}`} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
              <Filter className="size-4" /> Filters {activeFilters > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">{activeFilters}</span>}
            </button>
            {activeFilters > 0 && (
              <button className="btn-ghost" onClick={clearFilters}>
                <X className="size-4" /> Clear
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="grid gap-3 border-b border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800 dark:bg-slate-900/40">
            <select className="input" value={query.categoryId} onChange={(e) => update({ categoryId: e.target.value })} aria-label="Category filter">
              <option value="">All categories</option>
              {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.assetCount})</option>)}
            </select>
            <select className="input" value={query.status} onChange={(e) => update({ status: e.target.value })} aria-label="Status filter">
              <option value="">All statuses</option>
              {STATUS_KEYS.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
            <select className="input" value={query.location} onChange={(e) => update({ location: e.target.value })} aria-label="Location filter">
              <option value="">All locations</option>
              {(locations || []).map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <select className="input" value={query.warranty} onChange={(e) => update({ warranty: e.target.value })} aria-label="Warranty filter">
              <option value="">Any warranty</option>
              <option value="30">Expiring in 30 days</option>
              <option value="60">Expiring in 60 days</option>
              <option value="90">Expiring in 90 days</option>
              <option value="active">Under warranty</option>
              <option value="expired">Expired</option>
              <option value="none">No warranty date</option>
            </select>
          </div>
        )}

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-brand-200 bg-brand-50 px-3 py-2 text-sm dark:border-brand-500/30 dark:bg-brand-500/10">
            <span className="font-medium text-brand-800 dark:text-brand-200">{selected.size} selected</span>
            <button className="btn-secondary py-1" onClick={() => exportCsv(true)} disabled={exporting}><Download className="size-4" /> Export selected</button>
            <button className="btn-secondary py-1" onClick={() => navigate(`/qr-labels?ids=${[...selected].join(',')}`)}><QrCode className="size-4" /> QR labels</button>
            <button className="btn-ghost py-1" onClick={() => setSelected(new Set())}>Clear selection</button>
          </div>
        )}

        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title={activeFilters ? 'No assets match these filters' : 'No assets yet'}
            message={activeFilters ? 'Try a different search or clear the filters.' : 'Add your first asset or import a CSV.'}
            action={activeFilters ? <button className="btn-secondary" onClick={clearFilters}>Clear filters</button> : isAdmin ? <Link className="btn-primary" to="/assets/new"><Plus className="size-4" /> Add asset</Link> : null}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className={`hidden overflow-x-auto md:block ${loading ? 'opacity-60' : ''}`}>
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60">
                  <tr>
                    <th className="w-10 px-3"><input type="checkbox" className="size-4 accent-brand-600" checked={allOnPage} onChange={togglePage} aria-label="Select all on page" /></th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className={`th ${c.align === 'right' ? 'text-right' : ''}`}>
                        {c.sortable === false ? c.label : (
                          <button className={`inline-flex items-center gap-1 uppercase hover:text-slate-800 dark:hover:text-slate-200 ${c.align === 'right' ? 'flex-row-reverse' : ''}`} onClick={() => toggleSort(c.key)}>
                            {c.label} {sortIcon(c.key)}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((a) => (
                    <tr key={a.id} className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 ${selected.has(a.id) ? 'bg-brand-50/50 dark:bg-brand-500/5' : ''}`} onClick={() => navigate(`/assets/${a.id}`)}>
                      <td className="px-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="size-4 accent-brand-600" checked={selected.has(a.id)} onChange={() => toggleRow(a.id)} aria-label={`Select ${a.assetTag}`} />
                      </td>
                      <td className="td font-mono text-xs font-semibold text-brand-700 dark:text-brand-300">{a.assetTag}</td>
                      <td className="td">
                        <Link to={`/assets/${a.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{a.name}</Link>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{[a.brand, a.serialNumber].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="td text-slate-600 dark:text-slate-300">{a.category?.name}</td>
                      <td className="td"><StatusBadge status={a.status} /></td>
                      <td className="td text-slate-600 dark:text-slate-300">{a.currentAssignment ? <><span className="block">{a.currentAssignment.employeeName}</span><span className="text-xs text-slate-400">{a.currentAssignment.department}</span></> : <span className="text-slate-400">—</span>}</td>
                      <td className="td text-slate-600 dark:text-slate-300">{a.location || '—'}</td>
                      <td className="td whitespace-nowrap text-slate-600 dark:text-slate-300">{date(a.warrantyEnd)}</td>
                      <td className="td text-right tabular-nums">{money(a.purchasePrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
              <li className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                <input type="checkbox" className="size-4 accent-brand-600" checked={allOnPage} onChange={togglePage} aria-label="Select all on page" /> Select page
                <select className="input ml-auto w-auto py-1 text-xs" value={`${query.sortBy}:${query.order}`} onChange={(e) => { const [s, o] = e.target.value.split(':'); update({ sortBy: s, order: o }, false); }} aria-label="Sort">
                  <option value="assetTag:asc">Tag ↑</option>
                  <option value="assetTag:desc">Tag ↓</option>
                  <option value="name:asc">Name A–Z</option>
                  <option value="purchasePrice:desc">Price high–low</option>
                  <option value="warrantyEnd:asc">Warranty soonest</option>
                </select>
              </li>
              {rows.map((a) => (
                <li key={a.id} className="flex gap-3 px-3 py-3">
                  <input type="checkbox" className="mt-1 size-4 accent-brand-600" checked={selected.has(a.id)} onChange={() => toggleRow(a.id)} aria-label={`Select ${a.assetTag}`} />
                  <Link to={`/assets/${a.id}`} className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium">{a.name}</p>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400"><span className="font-mono font-semibold text-brand-700 dark:text-brand-300">{a.assetTag}</span> · {a.category?.name} · {money(a.purchasePrice)}</p>
                    {a.currentAssignment && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Held by {a.currentAssignment.employeeName}</p>}
                  </Link>
                </li>
              ))}
            </ul>

            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              pageSize={meta.pageSize}
              onPage={(p) => update({ page: p }, false)}
              onPageSize={(n) => update({ pageSize: n })}
            />
          </>
        )}
      </div>
      {query.categoryId && categoryName[query.categoryId] && <span className="sr-only">Filtered by {categoryName[query.categoryId]}</span>}
    </div>
  );
}
