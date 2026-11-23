import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Download, Printer, Search, QrCode, CheckSquare, Square } from 'lucide-react';
import { useApi, useDebounced } from '../lib/useApi';
import { api } from '../api/client';
import { EmptyState, ErrorState, PageHeader, Spinner, StatusBadge, TableSkeleton } from '../components/ui';
import QrImage, { qrDataUrl } from '../components/QrImage';

export default function QrLabelsPage() {
  const [params] = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput);
  const [selected, setSelected] = useState(() => new Map());
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useApi('/assets', { search, pageSize: 100, sortBy: 'assetTag' });

  // Preselect ids passed from the assets list (?ids=1,2,3).
  useEffect(() => {
    const ids = params.get('ids');
    if (!ids) return;
    api('/assets', { query: { ids, pageSize: 100 } })
      .then((r) => setSelected(new Map(r.data.map((a) => [a.id, a]))))
      .catch((e) => toast.error(e.message));
  }, [params]);

  const rows = data || [];
  const chosen = useMemo(() => [...selected.values()].sort((a, b) => a.assetTag.localeCompare(b.assetTag)), [selected]);
  const toggle = (a) =>
    setSelected((m) => {
      const n = new Map(m);
      n.has(a.id) ? n.delete(a.id) : n.set(a.id, a);
      return n;
    });
  const allVisible = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((m) => {
      const n = new Map(m);
      rows.forEach((r) => (allVisible ? n.delete(r.id) : n.set(r.id, r)));
      return n;
    });

  async function downloadPdf() {
    if (!chosen.length) return;
    setBusy(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      // 3 x 8 grid of 63.5 x 33.9 mm labels (common A4 label sheet layout)
      const cols = 3, rowsPer = 8, w = 63.5, h = 33.9, mx = 7.2, my = 12.9;
      for (let i = 0; i < chosen.length; i++) {
        const a = chosen[i];
        const idx = i % (cols * rowsPer);
        if (i > 0 && idx === 0) doc.addPage();
        const x = mx + (idx % cols) * w;
        const y = my + Math.floor(idx / cols) * h;
        doc.setDrawColor(210);
        doc.roundedRect(x + 1, y + 1, w - 2, h - 2, 2, 2);
        const qr = await qrDataUrl(a.assetTag, 300);
        doc.addImage(qr, 'PNG', x + 3, y + 3.5, 27, 27);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(a.assetTag, x + 32, y + 10);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(doc.splitTextToSize(a.name, w - 35).slice(0, 3), x + 32, y + 15);
        doc.setFontSize(6);
        doc.setTextColor(120);
        doc.text('AssetTrack · scan to open', x + 32, y + 29);
        doc.setTextColor(0);
      }
      doc.save(`assettrack-qr-labels-${chosen.length}.pdf`);
      toast.success(`PDF with ${chosen.length} label${chosen.length > 1 ? 's' : ''} downloaded`);
    } catch (e) {
      toast.error(`Could not create PDF: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="QR labels"
        subtitle="Select assets, preview the label sheet and download it as a PDF"
        actions={
          <>
            <button className="btn-secondary no-print" onClick={() => window.print()} disabled={!chosen.length}><Printer className="size-4" /> Print</button>
            <button className="btn-primary no-print" onClick={downloadPdf} disabled={!chosen.length || busy}>{busy ? <Spinner /> : <Download className="size-4" />} Download PDF ({chosen.length})</button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="card no-print min-w-0 lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Search assets…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="Search assets" />
            </div>
            <button className="btn-ghost" onClick={toggleAll} disabled={!rows.length}>{allVisible ? <CheckSquare className="size-4" /> : <Square className="size-4" />} All</button>
          </div>
          {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <TableSkeleton cols={2} /> : rows.length === 0 ? <EmptyState title="No assets match" /> : (
            <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {rows.map((a) => (
                <li key={a.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <input type="checkbox" className="size-4 accent-brand-600" checked={selected.has(a.id)} onChange={() => toggle(a)} />
                    <span className="font-mono text-xs font-semibold text-brand-700 dark:text-brand-300">{a.assetTag}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                    <StatusBadge status={a.status} />
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 lg:col-span-3">
          {chosen.length === 0 ? (
            <div className="card"><EmptyState icon={QrCode} title="No assets selected" message="Pick assets on the left to build a printable label sheet." /></div>
          ) : (
            <div className="card p-4 print:border-0 print:p-0 print:shadow-none">
              <p className="no-print mb-3 text-sm text-slate-500 dark:text-slate-400">Preview · {chosen.length} label{chosen.length > 1 ? 's' : ''} · A4, 24 per page</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" id="label-sheet">
                {chosen.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white p-2 text-slate-900 break-inside-avoid">
                    <QrImage tag={a.assetTag} size={72} />
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold">{a.assetTag}</p>
                      <p className="line-clamp-2 text-xs leading-tight">{a.name}</p>
                      <p className="mt-1 text-[10px] text-slate-500">AssetTrack</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
