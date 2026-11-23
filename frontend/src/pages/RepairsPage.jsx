import { useState } from 'react';
import { Link } from 'react-router';
import { Plus, Search, Wrench, CheckCircle2, IndianRupee, Clock } from 'lucide-react';
import { useApi, useDebounced } from '../lib/useApi';
import { useAuth } from '../context/AuthContext';
import { date, money } from '../lib/format';
import { EmptyState, ErrorState, PageHeader, Pagination, RepairBadge, Skeleton, TableSkeleton } from '../components/ui';
import { CloseRepairDialog, RepairDialog } from '../components/AssetDialogs';

export default function RepairsPage() {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dialog, setDialog] = useState(null);
  const { data, meta, loading, error, reload } = useApi('/repairs', { status, search, page, pageSize });
  const inStock = useApi('/assets', { status: 'IN_STOCK', pageSize: 100, sortBy: 'assetTag' }, { enabled: dialog === 'new' });

  const totals = meta?.totals;
  const done = () => {
    setDialog(null);
    reload();
  };

  return (
    <div>
      <PageHeader
        title="Repairs"
        subtitle="Maintenance log and repair costs"
        actions={isAdmin && <button className="btn-primary" onClick={() => setDialog('new')}><Plus className="size-4" /> Log repair</button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          ['Total repair cost', totals && money(totals.totalCost), IndianRupee, 'bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300'],
          ['Active repairs', totals?.activeCount, Clock, 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300'],
          ['Cost of active', totals && money(totals.activeCost), Wrench, 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300'],
          ['Completed cost', totals && money(totals.completedCost), CheckCircle2, 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'],
        ].map(([label, value, Icon, tone]) => (
          <div key={label} className="card flex items-center gap-3 p-4">
            <div className={`grid size-10 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="size-5" /></div>
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
              {value === undefined ? <Skeleton className="mt-1 h-6 w-16" /> : <p className="truncate text-xl font-semibold tabular-nums">{value}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center dark:border-slate-800">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search issue, vendor, asset tag…" value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(1); }} aria-label="Search repairs" />
          </div>
          <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
            {[['', 'All'], ['ACTIVE', 'Active'], ['COMPLETED', 'Completed']].map(([v, l]) => (
              <button key={v} role="tab" aria-selected={status === v} onClick={() => { setStatus(v); setPage(1); }} className={`rounded-md px-3 py-1 text-sm font-medium ${status === v ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-500 dark:text-slate-400'}`}>{l}</button>
            ))}
          </div>
        </div>

        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <TableSkeleton cols={6} /> : data.length === 0 ? (
          <EmptyState icon={Wrench} title="No repairs found" message={status || search ? 'Try another filter.' : 'Logged repairs will appear here.'} />
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60">
                  <tr>
                    <th className="th">Asset</th>
                    <th className="th">Issue</th>
                    <th className="th">Vendor</th>
                    <th className="th">Dates</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Cost</th>
                    {isAdmin && <th className="th text-right"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="td">
                        <Link to={`/assets/${r.asset.id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{r.asset.assetTag}</Link>
                        <p className="max-w-48 truncate text-xs text-slate-500 dark:text-slate-400">{r.asset.name}</p>
                      </td>
                      <td className="td max-w-64">{r.issue}{r.notes && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.notes}</p>}</td>
                      <td className="td text-slate-600 dark:text-slate-300">{r.vendor || '—'}</td>
                      <td className="td text-xs whitespace-nowrap text-slate-600 dark:text-slate-300">{date(r.startDate)}<br />→ {r.endDate ? date(r.endDate) : 'ongoing'}</td>
                      <td className="td"><RepairBadge status={r.status} /></td>
                      <td className="td text-right font-medium tabular-nums">{money(r.cost, true)}</td>
                      {isAdmin && (
                        <td className="td text-right">
                          {r.status !== 'COMPLETED' && <button className="btn-secondary py-1 text-xs" onClick={() => setDialog(r)}><CheckCircle2 className="size-3.5" /> Close</button>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 dark:border-slate-800">
                  <tr>
                    <td className="td font-medium" colSpan={5}>Total on this page</td>
                    <td className="td text-right font-semibold tabular-nums">{money(data.reduce((s, r) => s + r.cost, 0), true)}</td>
                    {isAdmin && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
            <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} pageSize={meta.pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        )}
      </div>

      <RepairDialog open={dialog === 'new'} assets={inStock.data} onClose={() => setDialog(null)} onDone={done} />
      <CloseRepairDialog repair={typeof dialog === 'object' ? dialog : null} open={Boolean(dialog && typeof dialog === 'object')} onClose={() => setDialog(null)} onDone={done} />
    </div>
  );
}
