import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../api/client';
import { Field, Modal, Spinner } from './ui';
import { date, todayStr } from '../lib/format';

const DEPARTMENTS = ['Engineering', 'Design', 'Finance', 'Sales', 'Marketing', 'Human Resources', 'Operations', 'Customer Success', 'IT'];
const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Damaged', 'Not working'];

function useForm(initial, open) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(initial);
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };
  return { form, set, errors, setErrors, busy, setBusy };
}

async function submitWith(f, validate, call, onDone, successMsg) {
  const fe = validate(f.form);
  f.setErrors(fe);
  if (Object.keys(fe).length) return;
  f.setBusy(true);
  try {
    const r = await call(f.form);
    toast.success(successMsg);
    onDone?.(r);
  } catch (err) {
    f.setErrors(err.fields || {});
    toast.error(err.message);
  } finally {
    f.setBusy(false);
  }
}

const cls = (err) => `input ${err ? 'input-error' : ''}`;

export function AssignDialog({ asset, open, onClose, onDone }) {
  const f = useForm({ employeeName: '', employeeEmail: '', department: '', assignedAt: todayStr(), conditionNotes: '' }, open);
  const validate = (v) => {
    const e = {};
    if (!v.employeeName.trim()) e.employeeName = 'Employee name is required';
    if (!v.employeeEmail.trim()) e.employeeEmail = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(v.employeeEmail.trim())) e.employeeEmail = 'Enter a valid email';
    if (!v.department.trim()) e.department = 'Department is required';
    if (!v.assignedAt) e.assignedAt = 'Date is required';
    else if (v.assignedAt > todayStr()) e.assignedAt = 'Cannot be in the future';
    else if (asset?.purchaseDate && v.assignedAt < asset.purchaseDate) e.assignedAt = `Cannot be before purchase (${date(asset.purchaseDate)})`;
    return e;
  };
  const submit = (e) => {
    e.preventDefault();
    submitWith(f, validate, (v) => api(`/assets/${asset.id}/assign`, { method: 'POST', body: v }), onDone, `${asset.assetTag} assigned to ${f.form.employeeName}`);
  };
  return (
    <Modal
      open={open}
      onClose={f.busy ? undefined : onClose}
      title={`Assign ${asset?.assetTag}`}
      description={asset?.name}
      footer={<><button className="btn-secondary" onClick={onClose} disabled={f.busy}>Cancel</button><button className="btn-primary" form="assign-form" disabled={f.busy}>{f.busy && <Spinner />} Assign asset</button></>}
    >
      <form id="assign-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
        <Field label="Employee name" required error={f.errors.employeeName} className="sm:col-span-2">
          <input className={cls(f.errors.employeeName)} value={f.form.employeeName} onChange={f.set('employeeName')} placeholder="e.g. Priya Raman" />
        </Field>
        <Field label="Employee email" required error={f.errors.employeeEmail}>
          <input type="email" className={cls(f.errors.employeeEmail)} value={f.form.employeeEmail} onChange={f.set('employeeEmail')} placeholder="name@company.com" />
        </Field>
        <Field label="Department" required error={f.errors.department}>
          <input list="departments" className={cls(f.errors.department)} value={f.form.department} onChange={f.set('department')} placeholder="Choose or type" />
          <datalist id="departments">{DEPARTMENTS.map((d) => <option key={d} value={d} />)}</datalist>
        </Field>
        <Field label="Assignment date" required error={f.errors.assignedAt}>
          <input type="date" max={todayStr()} className={cls(f.errors.assignedAt)} value={f.form.assignedAt} onChange={f.set('assignedAt')} />
        </Field>
        <Field label="Condition notes" error={f.errors.conditionNotes} className="sm:col-span-2">
          <textarea rows={3} className={cls(f.errors.conditionNotes)} value={f.form.conditionNotes} onChange={f.set('conditionNotes')} placeholder="e.g. Good condition, charger included" />
        </Field>
      </form>
    </Modal>
  );
}

export function ReturnDialog({ asset, open, onClose, onDone }) {
  const holder = asset?.currentAssignment;
  const f = useForm({ returnedAt: todayStr(), returnCondition: 'Good', returnNotes: '' }, open);
  const validate = (v) => {
    const e = {};
    if (!v.returnedAt) e.returnedAt = 'Return date is required';
    else if (v.returnedAt > todayStr()) e.returnedAt = 'Cannot be in the future';
    else if (holder && v.returnedAt < holder.assignedAt) e.returnedAt = `Cannot be before ${date(holder.assignedAt)}`;
    if (!v.returnCondition) e.returnCondition = 'Condition is required';
    return e;
  };
  const submit = (e) => {
    e.preventDefault();
    submitWith(f, validate, (v) => api(`/assets/${asset.id}/return`, { method: 'POST', body: v }), onDone, `${asset.assetTag} returned and back In Stock`);
  };
  return (
    <Modal
      open={open}
      onClose={f.busy ? undefined : onClose}
      title={`Return ${asset?.assetTag}`}
      description={holder ? `Currently with ${holder.employeeName} since ${date(holder.assignedAt)}` : asset?.name}
      footer={<><button className="btn-secondary" onClick={onClose} disabled={f.busy}>Cancel</button><button className="btn-primary" form="return-form" disabled={f.busy}>{f.busy && <Spinner />} Record return</button></>}
    >
      <form id="return-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
        <Field label="Return date" required error={f.errors.returnedAt}>
          <input type="date" max={todayStr()} min={holder?.assignedAt} className={cls(f.errors.returnedAt)} value={f.form.returnedAt} onChange={f.set('returnedAt')} />
        </Field>
        <Field label="Condition on return" required error={f.errors.returnCondition}>
          <select className={cls(f.errors.returnCondition)} value={f.form.returnCondition} onChange={f.set('returnCondition')}>
            {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Notes" className="sm:col-span-2" error={f.errors.returnNotes}>
          <textarea rows={3} className={cls(f.errors.returnNotes)} value={f.form.returnNotes} onChange={f.set('returnNotes')} placeholder="Any damage or missing items" />
        </Field>
      </form>
    </Modal>
  );
}

export function RepairDialog({ asset, open, onClose, onDone, assets }) {
  const f = useForm({ assetId: asset?.id ? String(asset.id) : '', issue: '', vendor: '', cost: '', startDate: todayStr(), status: 'OPEN', notes: '' }, open);
  const validate = (v) => {
    const e = {};
    if (!v.assetId) e.assetId = 'Choose an asset';
    if (!v.issue.trim()) e.issue = 'Describe the issue';
    if (v.cost !== '' && (!Number.isFinite(Number(v.cost)) || Number(v.cost) < 0)) e.cost = 'Enter a valid amount';
    if (!v.startDate) e.startDate = 'Start date is required';
    else if (v.startDate > todayStr()) e.startDate = 'Cannot be in the future';
    return e;
  };
  const submit = (e) => {
    e.preventDefault();
    submitWith(
      f,
      validate,
      (v) => api('/repairs', { method: 'POST', body: { ...v, assetId: Number(v.assetId), cost: v.cost === '' ? 0 : Number(v.cost) } }),
      onDone,
      'Repair logged; asset is now Under Repair',
    );
  };
  return (
    <Modal
      open={open}
      onClose={f.busy ? undefined : onClose}
      title={asset ? `Send ${asset.assetTag} to repair` : 'Log a repair'}
      description={asset ? asset.name : 'Only In Stock assets can be sent to repair'}
      footer={<><button className="btn-secondary" onClick={onClose} disabled={f.busy}>Cancel</button><button className="btn-primary" form="repair-form" disabled={f.busy}>{f.busy && <Spinner />} Start repair</button></>}
    >
      <form id="repair-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
        {!asset && (
          <Field label="Asset" required error={f.errors.assetId} className="sm:col-span-2" hint={assets && assets.length === 0 ? 'No assets are In Stock right now.' : undefined}>
            <select className={cls(f.errors.assetId)} value={f.form.assetId} onChange={f.set('assetId')}>
              <option value="">Select an In Stock asset…</option>
              {(assets || []).map((a) => <option key={a.id} value={a.id}>{a.assetTag} · {a.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Issue" required error={f.errors.issue} className="sm:col-span-2">
          <input className={cls(f.errors.issue)} value={f.form.issue} onChange={f.set('issue')} placeholder="e.g. Battery not charging" />
        </Field>
        <Field label="Repair vendor" error={f.errors.vendor}>
          <input className={cls(f.errors.vendor)} value={f.form.vendor} onChange={f.set('vendor')} placeholder="Service centre" />
        </Field>
        <Field label="Estimated cost (₹)" error={f.errors.cost}>
          <input type="number" min="0" step="0.01" inputMode="decimal" className={cls(f.errors.cost)} value={f.form.cost} onChange={f.set('cost')} placeholder="0" />
        </Field>
        <Field label="Start date" required error={f.errors.startDate}>
          <input type="date" max={todayStr()} className={cls(f.errors.startDate)} value={f.form.startDate} onChange={f.set('startDate')} />
        </Field>
        <Field label="Status">
          <select className="input" value={f.form.status} onChange={f.set('status')}>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
          </select>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea rows={2} className="input" value={f.form.notes} onChange={f.set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}

export function CloseRepairDialog({ repair, open, onClose, onDone }) {
  const f = useForm({ endDate: todayStr(), cost: repair ? String(repair.cost ?? '') : '', notes: '' }, open);
  const validate = (v) => {
    const e = {};
    if (!v.endDate) e.endDate = 'End date is required';
    else if (v.endDate > todayStr()) e.endDate = 'Cannot be in the future';
    else if (repair && v.endDate < repair.startDate) e.endDate = `Cannot be before ${date(repair.startDate)}`;
    if (v.cost !== '' && (!Number.isFinite(Number(v.cost)) || Number(v.cost) < 0)) e.cost = 'Enter a valid amount';
    return e;
  };
  const submit = (e) => {
    e.preventDefault();
    submitWith(
      f,
      validate,
      (v) => api(`/repairs/${repair.id}/close`, { method: 'POST', body: { endDate: v.endDate, notes: v.notes, ...(v.cost !== '' ? { cost: Number(v.cost) } : {}) } }),
      onDone,
      'Repair closed; asset is back In Stock',
    );
  };
  return (
    <Modal
      open={open}
      onClose={f.busy ? undefined : onClose}
      title="Close repair"
      description={repair ? `${repair.asset?.assetTag || ''} · ${repair.issue}` : ''}
      footer={<><button className="btn-secondary" onClick={onClose} disabled={f.busy}>Cancel</button><button className="btn-primary" form="close-repair-form" disabled={f.busy}>{f.busy && <Spinner />} Close repair</button></>}
    >
      <form id="close-repair-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
        <Field label="End date" required error={f.errors.endDate}>
          <input type="date" min={repair?.startDate} max={todayStr()} className={cls(f.errors.endDate)} value={f.form.endDate} onChange={f.set('endDate')} />
        </Field>
        <Field label="Final cost (₹)" error={f.errors.cost}>
          <input type="number" min="0" step="0.01" className={cls(f.errors.cost)} value={f.form.cost} onChange={f.set('cost')} />
        </Field>
        <Field label="Resolution notes" className="sm:col-span-2">
          <textarea rows={3} className="input" value={f.form.notes} onChange={f.set('notes')} placeholder="What was fixed" />
        </Field>
      </form>
    </Modal>
  );
}
