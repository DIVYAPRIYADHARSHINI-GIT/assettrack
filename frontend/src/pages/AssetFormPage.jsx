import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api/client';
import { useApi } from '../lib/useApi';
import { todayStr } from '../lib/format';
import { ErrorState, Field, PageHeader, Skeleton, Spinner } from '../components/ui';

const EMPTY = { name: '', categoryId: '', brand: '', model: '', serialNumber: '', purchaseDate: '', purchasePrice: '', vendor: '', warrantyEnd: '', location: '', notes: '', status: 'IN_STOCK' };
const FIELDS = Object.keys(EMPTY);

export function validateAsset(v) {
  const e = {};
  if (!v.name.trim()) e.name = 'Name is required';
  else if (v.name.trim().length > 120) e.name = 'At most 120 characters';
  if (!v.categoryId) e.categoryId = 'Category is required';
  if (!v.serialNumber.trim()) e.serialNumber = 'Serial number is required';
  else if (!/^[A-Za-z0-9._\-/ ]+$/.test(v.serialNumber.trim())) e.serialNumber = 'Only letters, numbers, spaces and . _ - /';
  if (v.purchasePrice !== '' && (!Number.isFinite(Number(v.purchasePrice)) || Number(v.purchasePrice) < 0)) e.purchasePrice = 'Enter a valid, non-negative amount';
  if (v.purchaseDate && v.purchaseDate > todayStr()) e.purchaseDate = 'Cannot be in the future';
  if (v.purchaseDate && v.warrantyEnd && v.warrantyEnd < v.purchaseDate) e.warrantyEnd = 'Cannot be before the purchase date';
  return e;
}

export default function AssetFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { data: categories } = useApi('/categories');
  const { data: locations } = useApi('/assets/locations');
  const existing = useApi(editing ? `/assets/${id}` : null, undefined, { enabled: editing });
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (existing.data) {
      const a = existing.data;
      setForm(Object.fromEntries(FIELDS.map((k) => [k, k === 'categoryId' ? String(a.categoryId) : a[k] == null ? '' : String(a[k])])));
    }
  }, [existing.data]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setDirty(true);
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  async function submit(e) {
    e.preventDefault();
    const fe = validateAsset(form);
    setErrors(fe);
    if (Object.keys(fe).length) {
      toast.error('Please fix the highlighted fields');
      document.querySelector(`[name="${Object.keys(fe)[0]}"]`)?.focus();
      return;
    }
    setBusy(true);
    const body = { ...form, categoryId: Number(form.categoryId), purchasePrice: form.purchasePrice === '' ? 0 : Number(form.purchasePrice) };
    if (editing) delete body.status;
    try {
      const r = await api(editing ? `/assets/${id}` : '/assets', { method: editing ? 'PATCH' : 'POST', body });
      setDirty(false);
      toast.success(editing ? `${r.data.assetTag} updated` : `${r.data.assetTag} created`);
      navigate(`/assets/${r.data.id}`);
    } catch (err) {
      setErrors(err.fields || {});
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (editing && existing.error) return <div className="card"><ErrorState error={existing.error} onRetry={existing.reload} /></div>;
  if (editing && !existing.data) return <Skeleton className="h-96" />;

  const cls = (k) => `input ${errors[k] ? 'input-error' : ''}`;
  return (
    <div className="mx-auto max-w-3xl">
      <Link to={editing ? `/assets/${id}` : '/assets'} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="size-4" /> {editing ? existing.data.assetTag : 'Assets'}
      </Link>
      <PageHeader title={editing ? `Edit ${existing.data.assetTag}` : 'Add asset'} subtitle={editing ? existing.data.name : 'The asset tag is generated automatically (AT-0001, AT-0002, …)'} />

      <form className="card" onSubmit={submit} noValidate>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Asset name" required error={errors.name} className="sm:col-span-2">
            <input name="name" className={cls('name')} value={form.name} onChange={set('name')} placeholder="e.g. Dell Latitude 5440" maxLength={120} />
          </Field>
          <Field label="Category" required error={errors.categoryId}>
            <select name="categoryId" className={cls('categoryId')} value={form.categoryId} onChange={set('categoryId')}>
              <option value="">Select category…</option>
              {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Serial number" required error={errors.serialNumber} hint="Must be unique">
            <input name="serialNumber" className={`${cls('serialNumber')} font-mono`} value={form.serialNumber} onChange={set('serialNumber')} placeholder="e.g. 5CG1234XYZ" />
          </Field>
          <Field label="Brand" error={errors.brand}>
            <input name="brand" className={cls('brand')} value={form.brand} onChange={set('brand')} />
          </Field>
          <Field label="Model" error={errors.model}>
            <input name="model" className={cls('model')} value={form.model} onChange={set('model')} />
          </Field>
          <Field label="Purchase date" error={errors.purchaseDate}>
            <input name="purchaseDate" type="date" max={todayStr()} className={cls('purchaseDate')} value={form.purchaseDate} onChange={set('purchaseDate')} />
          </Field>
          <Field label="Purchase price (₹)" error={errors.purchasePrice}>
            <input name="purchasePrice" type="number" min="0" step="0.01" inputMode="decimal" className={cls('purchasePrice')} value={form.purchasePrice} onChange={set('purchasePrice')} placeholder="0" />
          </Field>
          <Field label="Vendor" error={errors.vendor}>
            <input name="vendor" className={cls('vendor')} value={form.vendor} onChange={set('vendor')} />
          </Field>
          <Field label="Warranty end date" error={errors.warrantyEnd}>
            <input name="warrantyEnd" type="date" min={form.purchaseDate || undefined} className={cls('warrantyEnd')} value={form.warrantyEnd} onChange={set('warrantyEnd')} />
          </Field>
          <Field label="Location" error={errors.location}>
            <input name="location" list="location-list" className={cls('location')} value={form.location} onChange={set('location')} placeholder="Choose or type" />
            <datalist id="location-list">{(locations || []).map((l) => <option key={l} value={l} />)}</datalist>
          </Field>
          {!editing ? (
            <Field label="Initial status" hint="Use Assign or Send to repair after saving">
              <select name="status" className="input" value={form.status} onChange={set('status')}>
                <option value="IN_STOCK">In Stock</option>
                <option value="RETIRED">Retired</option>
              </select>
            </Field>
          ) : <div className="hidden sm:block" />}
          <Field label="Notes" error={errors.notes} className="sm:col-span-2">
            <textarea name="notes" rows={3} className={cls('notes')} value={form.notes} onChange={set('notes')} maxLength={2000} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)} disabled={busy}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy && <Spinner />} {editing ? 'Save changes' : 'Create asset'}</button>
        </div>
      </form>
    </div>
  );
}
