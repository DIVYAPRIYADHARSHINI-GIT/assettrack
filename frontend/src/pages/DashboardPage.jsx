import { useState } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Package, UserCheck, Archive, Wrench, IndianRupee, ShieldAlert, Activity, RefreshCw } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { ACTION_META, STATUS, date, money, moneyCompact, timeAgo } from '../lib/format';
import { EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '../components/ui';
import { useTheme } from '../context/ThemeContext';

const CAT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];

function Kpi({ icon: Icon, label, value, sub, tone, to, title }) {
  const body = (
    <div className="card flex h-full items-start gap-3 p-4 transition-shadow hover:shadow-md">
      <div className={`grid size-10 shrink-0 place-items-center rounded-lg ${tone}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-2xl font-semibold tabular-nums" title={title} data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-800">
      <p className="font-medium">{p.name || p.label}</p>
      <p className="text-slate-500 dark:text-slate-400">{p.count} assets · {money(p.value)}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useApi('/dashboard');
  const [tab, setTab] = useState(30);
  const { theme } = useTheme();
  const axis = theme === 'dark' ? '#94a3b8' : '#64748b';
  const grid = theme === 'dark' ? '#1e293b' : '#e2e8f0';

  if (error) return <div className="card"><ErrorState error={error} onRetry={reload} /></div>;

  const t = data?.totals;
  const pct = (n) => (t?.totalAssets ? Math.round((n / t.totalAssets) * 100) : 0);
  const categories = (data?.byCategory || []).filter((c) => c.count > 0);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of all office assets"
        actions={<button className="btn-secondary" onClick={reload} disabled={loading}><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {loading && !data
          ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="card p-4"><Skeleton className="mb-2 h-3 w-20" /><Skeleton className="h-7 w-16" /></div>)
          : (
            <>
              <Kpi icon={Package} label="Total assets" value={t.totalAssets} sub={`${t.retired} retired`} tone="bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" to="/assets" />
              <Kpi icon={UserCheck} label="Assigned" value={t.assigned} sub={`${pct(t.assigned)}% of all assets`} tone="bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300" to="/assets?status=ASSIGNED" />
              <Kpi icon={Archive} label="In stock" value={t.inStock} sub="Free to assign" tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" to="/assets?status=IN_STOCK" />
              <Kpi icon={Wrench} label="Under repair" value={t.underRepair} sub={`${money(t.repairCost)} repair spend`} tone="bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" to="/assets?status=UNDER_REPAIR" />
              <Kpi icon={IndianRupee} label="Total value" value={moneyCompact(t.totalValue)} title={money(t.totalValue)} sub={`${money(t.totalValue)} exact · ${moneyCompact(t.activeValue)} excl. retired`} tone="bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300" />
            </>
          )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="card min-w-0 p-5">
          <h2 className="font-semibold">Assets by category</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Share of all assets</p>
          {loading && !data ? <Skeleton className="mt-4 h-64" /> : categories.length === 0 ? (
            <EmptyState title="No assets yet" />
          ) : (
            <div className="mt-2 flex flex-col items-center gap-4 sm:flex-row">
              <div className="h-60 w-full sm:w-1/2">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={categories} dataKey="count" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none">
                      {categories.map((c, i) => <Cell key={c.categoryId} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full space-y-2 text-sm sm:w-1/2">
                {categories.map((c, i) => (
                  <li key={c.categoryId}>
                    <Link to={`/assets?categoryId=${c.categoryId}`} className="flex items-center gap-2 rounded px-1 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <span className="size-2.5 rounded-sm" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                      <span className="flex-1">{c.name}</span>
                      <span className="font-medium tabular-nums">{c.count}</span>
                      <span className="w-10 text-right text-xs text-slate-400 tabular-nums">{pct(c.count)}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card min-w-0 p-5">
          <h2 className="font-semibold">Assets by status</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Assigned {t?.assigned ?? '–'} vs free {t?.inStock ?? '–'}</p>
          {loading && !data ? <Skeleton className="mt-4 h-64" /> : (
            <div className="mt-4 h-60">
              <ResponsiveContainer>
                <BarChart data={data.byStatus} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: theme === 'dark' ? '#1e293b' : '#f1f5f9' }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={56}>
                    {data.byStatus.map((s) => <Cell key={s.status} fill={STATUS[s.status].color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="card min-w-0 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <h2 className="flex items-center gap-2 font-semibold"><ShieldAlert className="size-4 text-amber-500" /> Warranty expiring</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Active assets whose warranty ends soon</p>
            </div>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
              {[30, 60, 90].map((d) => (
                <button key={d} role="tab" aria-selected={tab === d} onClick={() => setTab(d)} className={`rounded-md px-3 py-1 text-sm font-medium ${tab === d ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-500 dark:text-slate-400'}`}>
                  {d} days <span className="ml-1 text-xs text-slate-400">{data?.warranty.counts[d] ?? ''}</span>
                </button>
              ))}
            </div>
          </div>
          {loading && !data ? (
            <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : data.warranty[tab].length === 0 ? (
            <EmptyState icon={ShieldAlert} title={`Nothing expiring in ${tab} days`} message="All warranties are safe for this window." />
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {data.warranty[tab].map((a) => (
                <li key={a.id}>
                  <Link to={`/assets/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{a.assetTag} · {a.category?.name} · ends {date(a.warrantyEnd)}</p>
                    </div>
                    <StatusBadge status={a.status} />
                    <span className={`w-16 text-right text-sm font-semibold tabular-nums ${a.daysLeft <= 30 ? 'text-red-600 dark:text-red-400' : a.daysLeft <= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
                      {a.daysLeft === 0 ? 'today' : `${a.daysLeft} d`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card min-w-0 lg:col-span-2">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="flex items-center gap-2 font-semibold"><Activity className="size-4 text-brand-500" /> Recent activity</h2>
          </div>
          {loading && !data ? (
            <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : data.recentActivity.length === 0 ? (
            <EmptyState icon={Activity} title="No activity yet" />
          ) : (
            <ul className="max-h-96 overflow-y-auto px-5 py-3">
              {data.recentActivity.map((a) => (
                <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${ACTION_META[a.action]?.cls || 'bg-slate-400'}`} />
                  <div className="min-w-0 text-sm">
                    <p className="text-slate-800 dark:text-slate-200">
                      {a.asset ? <Link className="hover:underline" to={`/assets/${a.asset.id}`}>{a.message}</Link> : a.message}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{a.user?.name || 'System'} · {timeAgo(a.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
