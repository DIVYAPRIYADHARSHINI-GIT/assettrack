import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, UserPlus, Undo2, Wrench, Archive, Trash2, Printer, RotateCcw, User, Calendar, History, Activity as ActivityIcon, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import { useApi } from '../lib/useApi';
import { useAuth } from '../context/AuthContext';
import { ACTION_META, date, dateTime, money } from '../lib/format';
import { ConfirmDialog, EmptyState, ErrorState, RepairBadge, Skeleton, StatusBadge } from '../components/ui';
import { AssignDialog, CloseRepairDialog, RepairDialog, ReturnDialog } from '../components/AssetDialogs';
import QrImage from '../components/QrImage';

function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-slate-900 dark:text-slate-100">{children || '—'}</dd>
    </div>
  );
}

function warrantyText(end) {
  if (!end) return null;
  const days = Math.round((new Date(end + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000);
  if (days < 0) return <span className="text-red-600 dark:text-red-400">Expired {Math.abs(days)} days ago</span>;
  if (days <= 90) return <span className="text-amber-600 dark:text-amber-400">{days} days left</span>;
  return <span className="text-emerald-600 dark:text-emerald-400">{days} days left</span>;
}

export default function AssetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: a, loading, error, reload } = useApi(`/assets/${id}`);
  const activity = useApi(`/assets/${id}/activity`);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('assignments');

  const refresh = () => {
    setDialog(null);
    reload();
    activity.reload();
  };

  async function act(path, method, success, after) {
    setBusy(true);
    try {
      await api(path, { method });
      toast.success(success);
      if (after) after();
      else refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      setDialog(null);
    }
  }

  if (error) {
    return (
      <div className="card">
        {error.status === 404 ? (
          <EmptyState title="Asset not found" message="It may have been deleted." action={<Link className="btn-primary" to="/assets">Back to assets</Link>} />
        ) : (
          <ErrorState error={error} onRetry={reload} />
        )}
      </div>
    );
  }
  if (loading && !a) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const holder = a.currentAssignment;
  const s = a.status;

  return (
    <div>
      <Link to="/assets" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="size-4" /> Assets
      </Link>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{a.assetTag}</span>
            <StatusBadge status={s} />
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{a.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{[a.category?.name, a.brand, a.model].filter(Boolean).join(' · ')}</p>
        </div>
        {isAdmin && (
          <div className="no-print flex flex-wrap gap-2">
            {s === 'IN_STOCK' && <button className="btn-primary" onClick={() => setDialog('assign')}><UserPlus className="size-4" /> Assign</button>}
            {s === 'ASSIGNED' && <button className="btn-primary" onClick={() => setDialog('return')}><Undo2 className="size-4" /> Return</button>}
            {s === 'IN_STOCK' && <button className="btn-secondary" onClick={() => setDialog('repair')}><Wrench className="size-4" /> Send to repair</button>}
            {s === 'UNDER_REPAIR' && a.openRepair && <button className="btn-primary" onClick={() => setDialog('close')}><CheckCircle2 className="size-4" /> Close repair</button>}
            <Link to={`/assets/${a.id}/edit`} className="btn-secondary"><Pencil className="size-4" /> Edit</Link>
            {s === 'IN_STOCK' && <button className="btn-secondary" onClick={() => setDialog('retire')}><Archive className="size-4" /> Retire</button>}
            {s === 'RETIRED' && <button className="btn-secondary" onClick={() => setDialog('reactivate')}><RotateCcw className="size-4" /> Reactivate</button>}
            {(s === 'IN_STOCK' || s === 'RETIRED') && <button className="btn-ghost text-red-600 dark:text-red-400" onClick={() => setDialog('delete')} aria-label="Delete asset"><Trash2 className="size-4" /></button>}
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="card p-5">
            <h2 className="mb-4 font-semibold">Details</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Info label="Asset tag"><span className="font-mono">{a.assetTag}</span></Info>
              <Info label="Category">{a.category?.name}</Info>
              <Info label="Status"><StatusBadge status={s} /></Info>
              <Info label="Brand">{a.brand}</Info>
              <Info label="Model">{a.model}</Info>
              <Info label="Serial number"><span className="font-mono text-xs">{a.serialNumber}</span></Info>
              <Info label="Purchase date">{date(a.purchaseDate)}</Info>
              <Info label="Purchase price">{money(a.purchasePrice, true)}</Info>
              <Info label="Vendor">{a.vendor}</Info>
              <Info label="Warranty ends">{a.warrantyEnd ? <>{date(a.warrantyEnd)}<br /><span className="text-xs">{warrantyText(a.warrantyEnd)}</span></> : null}</Info>
              <Info label="Location">{a.location}</Info>
              <Info label="Repair spend">{money(a.repairCostTotal, true)}</Info>
              <div className="col-span-2 sm:col-span-3"><Info label="Notes"><span className="whitespace-pre-wrap">{a.notes}</span></Info></div>
            </dl>
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-slate-800">
              Added {dateTime(a.createdAt)}{a.createdBy ? ` by ${a.createdBy.name}` : ''} · Updated {dateTime(a.updatedAt)}
            </p>
          </div>

          <div className="card">
            <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 dark:border-slate-800" role="tablist">
              {[
                ['assignments', `Assignment history (${a.assignments.length})`, History],
                ['repairs', `Repairs (${a.repairs.length})`, Wrench],
                ['activity', 'Activity log', ActivityIcon],
              ].map(([k, label, Icon]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap ${tab === k ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}>
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>

            {tab === 'assignments' && (a.assignments.length === 0 ? <EmptyState icon={User} title="Never assigned" message="Assignment history appears here." /> : (
              <ol className="relative space-y-0 px-5 py-5">
                {a.assignments.map((x, i) => (
                  <li key={x.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < a.assignments.length - 1 && <span className="absolute top-6 left-[11px] h-full w-px bg-slate-200 dark:bg-slate-700" />}
                    <span className={`relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${x.returnedAt ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' : 'bg-blue-600 text-white'}`}>
                      <User className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{x.employeeName}</span>
                        <span className="text-slate-500 dark:text-slate-400">{x.department}</span>
                        {!x.returnedAt && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">Current</span>}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{x.employeeEmail}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                        <Calendar className="size-3.5" /> {date(x.assignedAt)} → {x.returnedAt ? date(x.returnedAt) : 'present'}
                      </p>
                      {x.conditionNotes && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300"><b>Out:</b> {x.conditionNotes}</p>}
                      {x.returnedAt && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300"><b>Returned:</b> {x.returnCondition}{x.returnNotes ? ` - ${x.returnNotes}` : ''}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            ))}

            {tab === 'repairs' && (a.repairs.length === 0 ? <EmptyState icon={Wrench} title="No repairs" message="Repair history appears here." /> : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {a.repairs.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.issue}</span><RepairBadge status={r.status} /></div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{r.vendor || 'No vendor'} · {date(r.startDate)} → {r.endDate ? date(r.endDate) : 'ongoing'}</p>
                      {r.notes && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{r.notes}</p>}
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{money(r.cost, true)}</span>
                  </li>
                ))}
              </ul>
            ))}

            {tab === 'activity' && (activity.loading && !activity.data ? <div className="p-5"><Skeleton className="h-24" /></div> : !activity.data?.length ? <EmptyState title="No activity" /> : (
              <ul className="px-5 py-4">
                {activity.data.map((x) => (
                  <li key={x.id} className="flex gap-3 pb-4 last:pb-0">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${ACTION_META[x.action]?.cls || 'bg-slate-400'}`} />
                    <div className="text-sm">
                      <p><span className="font-medium">{ACTION_META[x.action]?.label || x.action}</span> · {x.message}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{x.user?.name || 'System'} · {dateTime(x.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Current holder</h2>
            {holder ? (
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  {holder.employeeName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{holder.employeeName}</p>
                  <p className="truncate text-slate-500 dark:text-slate-400">{holder.employeeEmail}</p>
                  <p className="text-slate-500 dark:text-slate-400">{holder.department} · since {date(holder.assignedAt)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {s === 'IN_STOCK' ? 'Not assigned. Available in stock.' : s === 'UNDER_REPAIR' ? `At repair${a.openRepair?.vendor ? ` with ${a.openRepair.vendor}` : ''} since ${date(a.openRepair?.startDate)}.` : 'Retired. No longer in use.'}
              </p>
            )}
          </div>

          <div className="card p-5 text-center">
            <h2 className="mb-3 text-left font-semibold">QR code</h2>
            <div className="inline-block rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700">
              <QrImage tag={a.assetTag} size={168} />
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{a.assetTag}</p>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Scan to open this asset</p>
            <Link to={`/qr-labels?ids=${a.id}`} className="btn-secondary no-print mt-3 w-full"><Printer className="size-4" /> Print label</Link>
          </div>
        </div>
      </div>

      <AssignDialog asset={a} open={dialog === 'assign'} onClose={() => setDialog(null)} onDone={refresh} />
      <ReturnDialog asset={a} open={dialog === 'return'} onClose={() => setDialog(null)} onDone={refresh} />
      <RepairDialog asset={a} open={dialog === 'repair'} onClose={() => setDialog(null)} onDone={refresh} />
      <CloseRepairDialog repair={a.openRepair ? { ...a.openRepair, asset: a } : null} open={dialog === 'close'} onClose={() => setDialog(null)} onDone={refresh} />
      <ConfirmDialog open={dialog === 'retire'} title={`Retire ${a.assetTag}?`} message="Retired assets can no longer be assigned or repaired. You can reactivate it later if needed." confirmLabel="Retire asset" danger busy={busy} onClose={() => setDialog(null)} onConfirm={() => act(`/assets/${a.id}/retire`, 'POST', `${a.assetTag} retired`)} />
      <ConfirmDialog open={dialog === 'reactivate'} title={`Reactivate ${a.assetTag}?`} message="The asset will return to In Stock." confirmLabel="Reactivate" busy={busy} onClose={() => setDialog(null)} onConfirm={() => act(`/assets/${a.id}/reactivate`, 'POST', `${a.assetTag} is back In Stock`)} />
      <ConfirmDialog open={dialog === 'delete'} title={`Delete ${a.assetTag}?`} message="This permanently deletes the asset with its assignment and repair history. This cannot be undone. Consider retiring it instead." confirmLabel="Delete permanently" danger busy={busy} onClose={() => setDialog(null)} onConfirm={() => act(`/assets/${a.id}`, 'DELETE', `${a.assetTag} deleted`, () => navigate('/assets'))} />
    </div>
  );
}
