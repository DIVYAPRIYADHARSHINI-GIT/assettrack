import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Upload, Download, FileDown, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, RotateCcw, Lock } from 'lucide-react';
import { api, download } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../lib/useApi';
import { STATUS, STATUS_KEYS } from '../lib/format';
import { PageHeader, Spinner } from '../components/ui';

const PREVIEW_COLS = ['name', 'category', 'serialNumber', 'purchaseDate', 'purchasePrice', 'warrantyEnd', 'location', 'status'];

export default function ImportExportPage() {
  const { isAdmin } = useAuth();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [exportFilters, setExportFilters] = useState({ status: '', categoryId: '', warranty: '' });
  const { data: categories } = useApi('/categories');

  async function send(f, dryRun) {
    const body = new FormData();
    body.append('file', f);
    return (await api('/csv/import', { method: 'POST', body, query: dryRun ? { dryRun: 'true' } : undefined })).data;
  }

  async function choose(f) {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      toast.error('Please choose a .csv file');
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      toast.error('File is larger than 2 MB');
      return;
    }
    setFile(f);
    setResult(null);
    setPreview(null);
    setBusy('preview');
    try {
      setPreview(await send(f, true));
    } catch (e) {
      toast.error(e.message);
      setFile(null);
    } finally {
      setBusy('');
    }
  }

  async function runImport() {
    setBusy('import');
    try {
      const r = await send(file, false);
      setResult(r);
      setPreview(r);
      if (r.importedCount) toast.success(`Imported ${r.importedCount} asset${r.importedCount > 1 ? 's' : ''}${r.errorCount ? `; ${r.errorCount} row(s) skipped` : ''}`);
      else toast.error('No rows were imported. Fix the errors and try again.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function downloadErrorReport() {
    const rows = (preview?.rows || []).filter((r) => !r.valid);
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['row', 'field', 'error', ...PREVIEW_COLS].join(',')];
    rows.forEach((r) => r.errors.forEach((e) => lines.push([r.row, e.field, e.message, ...PREVIEW_COLS.map((c) => r.values[c])].map(esc).join(','))));
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `import-errors-${file?.name || 'report'}.csv`;
    a.click();
  }

  async function exportCsv() {
    setBusy('export');
    try {
      const r = await download('/csv/export', exportFilters);
      toast.success(`Exported ${r.count ?? ''} assets`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  }

  const rows = preview ? preview.rows.filter((r) => !onlyErrors || !r.valid) : [];

  return (
    <div>
      <PageHeader title="Import / Export" subtitle="Bulk add assets from CSV, or download your inventory" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="card min-w-0 p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold"><Upload className="size-4" /> Import assets from CSV</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Required columns: <code>name</code>, <code>category</code>, <code>serialNumber</code>. Dates as YYYY-MM-DD or DD/MM/YYYY. Status may be In Stock or Retired. Valid rows are imported; rows with errors are skipped and listed below.
          </p>
          <div className="mt-3">
            <button className="btn-secondary" onClick={() => download('/csv/template').catch((e) => toast.error(e.message))}><FileDown className="size-4" /> Download template</button>
          </div>

          {!isAdmin ? (
            <div className="mt-5 flex items-center gap-3 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <Lock className="size-5 shrink-0" /> Only admins can import assets. You can still export below.
            </div>
          ) : !file ? (
            <label
              className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-700 dark:hover:bg-brand-500/5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files?.[0]); }}
            >
              <FileSpreadsheet className="mb-2 size-8 text-slate-400" />
              <span className="font-medium">Drop a CSV here or click to browse</span>
              <span className="mt-1 text-xs text-slate-500">Max 2 MB, 1,000 rows</span>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" data-testid="csv-input" onChange={(e) => choose(e.target.files?.[0])} />
            </label>
          ) : (
            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
                <FileSpreadsheet className="size-5 text-brand-600" />
                <span className="font-medium">{file.name}</span>
                {busy === 'preview' && <Spinner />}
                {preview && (
                  <span className="flex flex-wrap gap-2 text-sm">
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 dark:bg-slate-700">{preview.totalRows} rows</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">{preview.validCount} valid</span>
                    {preview.errorCount > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800 dark:bg-red-500/15 dark:text-red-300">{preview.errorCount} with errors</span>}
                  </span>
                )}
                <button className="btn-ghost ml-auto" onClick={reset}><RotateCcw className="size-4" /> Choose another</button>
              </div>

              {result ? (
                <div className={`mt-4 rounded-lg border p-4 ${result.importedCount ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10' : 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10'}`} role="status">
                  <p className="font-medium">{result.importedCount ? <><CheckCircle2 className="mr-1 inline size-4 text-emerald-600" /> Imported {result.importedCount} of {result.totalRows} rows</> : 'Nothing was imported'}</p>
                  {result.errorCount > 0 && <p className="mt-1 text-sm">{result.errorCount} row(s) were skipped because of errors (shown below).</p>}
                  {result.imported.length > 0 && (
                    <p className="mt-2 text-sm">New tags: {result.imported.map((x) => <Link key={x.id} to={`/assets/${x.id}`} className="mr-2 font-mono text-brand-700 hover:underline dark:text-brand-300">{x.assetTag}</Link>)}</p>
                  )}
                </div>
              ) : preview && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button className="btn-primary" onClick={runImport} disabled={!preview.validCount || busy === 'import'}>
                    {busy === 'import' && <Spinner />} Import {preview.validCount} valid row{preview.validCount === 1 ? '' : 's'}
                  </button>
                  {preview.errorCount > 0 && <span className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-300"><AlertTriangle className="size-4" /> {preview.errorCount} row(s) will be skipped</span>}
                </div>
              )}

              {preview && (
                <div className="mt-5">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <h3 className="text-sm font-semibold">Preview</h3>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-600" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} /> Show only rows with errors</label>
                    {preview.errorCount > 0 && <button className="btn-ghost ml-auto text-sm" onClick={downloadErrorReport}><Download className="size-4" /> Error report</button>}
                  </div>
                  <div className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full min-w-[1040px] text-sm">
                      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                        <tr>
                          <th className="th">Row</th>
                          <th className="th">Result</th>
                          {PREVIEW_COLS.map((c) => <th key={c} className="th normal-case">{c}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {rows.map((r) => {
                          const bad = new Set(r.errors.map((e) => e.field === 'categoryId' ? 'category' : e.field));
                          return (
                            <tr key={r.row} className={r.valid ? '' : 'bg-red-50/60 dark:bg-red-500/5'}>
                              <td className="td align-top text-slate-500 tabular-nums">{r.row}</td>
                              <td className="td w-80 min-w-80 align-top">
                                {r.valid ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" /> OK</span> : (
                                  <ul className="space-y-0.5 text-xs text-red-700 dark:text-red-300">
                                    {r.errors.map((e, i) => <li key={i} className="flex gap-1"><XCircle className="mt-0.5 size-3.5 shrink-0" /><span><b>{e.field}:</b> {e.message}</span></li>)}
                                  </ul>
                                )}
                              </td>
                              {PREVIEW_COLS.map((c) => <td key={c} className={`td align-top whitespace-nowrap ${bad.has(c) ? 'font-medium text-red-700 underline decoration-wavy dark:text-red-300' : ''}`}>{r.values[c] || <span className="text-slate-300 dark:text-slate-600">—</span>}</td>)}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card h-fit p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Download className="size-4" /> Export to CSV</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose filters, or export the current filtered list from the Assets page.</p>
          <div className="mt-4 space-y-3">
            <select className="input" value={exportFilters.status} onChange={(e) => setExportFilters((f) => ({ ...f, status: e.target.value }))} aria-label="Status">
              <option value="">All statuses</option>
              {STATUS_KEYS.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
            <select className="input" value={exportFilters.categoryId} onChange={(e) => setExportFilters((f) => ({ ...f, categoryId: e.target.value }))} aria-label="Category">
              <option value="">All categories</option>
              {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="input" value={exportFilters.warranty} onChange={(e) => setExportFilters((f) => ({ ...f, warranty: e.target.value }))} aria-label="Warranty">
              <option value="">Any warranty</option>
              <option value="30">Expiring in 30 days</option>
              <option value="60">Expiring in 60 days</option>
              <option value="90">Expiring in 90 days</option>
              <option value="expired">Expired</option>
            </select>
            <button className="btn-primary w-full" onClick={exportCsv} disabled={busy === 'export'}>{busy === 'export' ? <Spinner /> : <Download className="size-4" />} Export CSV</button>
          </div>
        </div>
      </div>
    </div>
  );
}
