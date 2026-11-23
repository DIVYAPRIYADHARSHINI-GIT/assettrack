import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Printer, FileText } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { date, dateTime, money, moneyPdf, REPAIR_STATUS } from '../lib/format';
import { ErrorState, PageHeader, Skeleton, Spinner } from '../components/ui';

function Section({ title, children, count }) {
  return (
    <section className="card overflow-hidden break-inside-avoid print:border-slate-300 print:shadow-none">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
        <h2 className="font-semibold">{title}</h2>
        {count !== undefined && <span className="text-sm text-slate-500 dark:text-slate-400">{count}</span>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

const Table = ({ head, rows, foot, empty = 'No data', right = [] }) => (
  <table className="w-full text-sm">
    <thead className="bg-slate-50/80 dark:bg-slate-900/60">
      <tr>{head.map((h, i) => <th key={h} className={`th ${right.includes(i) ? 'text-right' : ''}`}>{h}</th>)}</tr>
    </thead>
    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.length === 0 ? <tr><td className="td text-slate-500" colSpan={head.length}>{empty}</td></tr> : rows.map((r, i) => (
        <tr key={i}>{r.map((c, j) => <td key={j} className={`td ${right.includes(j) ? 'text-right tabular-nums' : ''}`}>{c}</td>)}</tr>
      ))}
    </tbody>
    {foot && <tfoot className="border-t-2 border-slate-200 font-semibold dark:border-slate-700"><tr>{foot.map((c, j) => <td key={j} className={`td ${right.includes(j) ? 'text-right tabular-nums' : ''}`}>{c}</td>)}</tr></tfoot>}
  </table>
);

export default function ReportsPage() {
  const [days, setDays] = useState(90);
  const { data: d, loading, error, reload } = useApi('/reports/summary', { warrantyDays: days });
  const [busy, setBusy] = useState(false);

  async function pdf() {
    setBusy(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, W, 70, 'F');
      doc.setTextColor(255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('AssetTrack - Asset Report', 40, 42);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Generated ${dateTime(d.generatedAt)}`, 40, 58);
      doc.setTextColor(30);

      doc.setFontSize(10);
      const kpis = [
        ['Total assets', String(d.totals.assets)],
        ['Total value', moneyPdf(d.totals.value)],
        ['Currently assigned', String(d.totals.assigned)],
        ['Repair cost (all time)', moneyPdf(d.totals.repairCost)],
      ];
      kpis.forEach(([k, v], i) => {
        const x = 40 + i * ((W - 80) / 4);
        doc.setFontSize(8);
        doc.setTextColor(110);
        doc.text(k.toUpperCase(), x, 98);
        doc.setFontSize(14);
        doc.setTextColor(20);
        doc.setFont('helvetica', 'bold');
        doc.text(v, x, 116);
        doc.setFont('helvetica', 'normal');
      });

      const opts = (startY, title) => {
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text(title, 40, startY);
        doc.setFont('helvetica', 'normal');
        return { startY: startY + 8, margin: { left: 40, right: 40 }, styles: { fontSize: 8.5, cellPadding: 4 }, headStyles: { fillColor: [79, 70, 229] }, alternateRowStyles: { fillColor: [245, 247, 250] } };
      };
      const next = () => doc.lastAutoTable.finalY + 30;

      autoTable(doc, {
        ...opts(150, '1. Assets by category'),
        head: [['Category', 'Total', 'In Stock', 'Assigned', 'Repair', 'Retired', 'Value']],
        body: d.byCategory.map((c) => [c.category, c.total, c.IN_STOCK, c.ASSIGNED, c.UNDER_REPAIR, c.RETIRED, moneyPdf(c.value)]),
        foot: [['Total', d.totals.assets, '', '', '', '', moneyPdf(d.totals.value)]],
        footStyles: { fillColor: [226, 232, 240], textColor: 20 },
        columnStyles: { 6: { halign: 'right' } },
      });
      autoTable(doc, {
        ...opts(next(), `2. Assigned assets (${d.assigned.length})`),
        head: [['Tag', 'Asset', 'Employee', 'Department', 'Since']],
        body: d.assigned.map((a) => [a.assetTag, a.assetName, `${a.employeeName}\n${a.employeeEmail}`, a.department, date(a.assignedAt)]),
      });
      autoTable(doc, {
        ...opts(next(), `3. Warranty expiring in ${d.warrantyDays} days (${d.warranty.length})`),
        head: [['Tag', 'Asset', 'Category', 'Status', 'Warranty ends', 'Days left']],
        body: d.warranty.length ? d.warranty.map((a) => [a.assetTag, a.name, a.category, a.status, date(a.warrantyEnd), a.daysLeft]) : [['-', 'No warranties expiring in this window', '', '', '', '']],
        columnStyles: { 5: { halign: 'right' } },
      });
      autoTable(doc, {
        ...opts(next(), '4. Repair cost summary'),
        head: [['Category', 'Repairs', 'Open', 'Total cost']],
        body: d.repairByCategory.map((r) => [r.category, r.count, r.open, moneyPdf(r.cost)]),
        foot: [['Total', d.totals.repairs, d.repairByCategory.reduce((s, r) => s + r.open, 0), moneyPdf(d.totals.repairCost)]],
        footStyles: { fillColor: [226, 232, 240], textColor: 20 },
        columnStyles: { 3: { halign: 'right' } },
      });
      autoTable(doc, {
        startY: next() - 18,
        margin: { left: 40, right: 40 },
        styles: { fontSize: 8, cellPadding: 3.5 },
        headStyles: { fillColor: [100, 116, 139] },
        head: [['Tag', 'Issue', 'Vendor', 'Status', 'Start', 'End', 'Cost']],
        body: d.repairs.map((r) => [r.assetTag, r.issue, r.vendor || '-', REPAIR_STATUS[r.status].label, date(r.startDate), r.endDate ? date(r.endDate) : '-', moneyPdf(r.cost)]),
        columnStyles: { 6: { halign: 'right' } },
      });

      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(`AssetTrack · Page ${i} of ${pages}`, W - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
      }
      doc.save(`assettrack-report-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('Report PDF downloaded');
    } catch (e) {
      toast.error(`Could not create PDF: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={d ? `Generated ${dateTime(d.generatedAt)}` : 'Printable summary of your inventory'}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Warranty window">
              <option value={30}>Warranty: 30 days</option>
              <option value={60}>Warranty: 60 days</option>
              <option value={90}>Warranty: 90 days</option>
            </select>
            <button className="btn-secondary" onClick={() => window.print()} disabled={!d}><Printer className="size-4" /> Print</button>
            <button className="btn-primary" onClick={pdf} disabled={!d || busy}>{busy ? <Spinner /> : <Download className="size-4" />} Download PDF</button>
          </div>
        }
      />
      {error ? <div className="card"><ErrorState error={error} onRetry={reload} /></div> : !d || loading ? (
        <div className="space-y-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[['Total assets', d.totals.assets], ['Total value', money(d.totals.value)], ['Currently assigned', d.totals.assigned], ['Repair cost', money(d.totals.repairCost)]].map(([k, v]) => (
              <div key={k} className="card p-4"><p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{k}</p><p className="mt-1 text-xl font-semibold tabular-nums">{v}</p></div>
            ))}
          </div>
          <Section title="1. Assets by category">
            <Table
              head={['Category', 'Total', 'In Stock', 'Assigned', 'Repair', 'Retired', 'Value']}
              right={[1, 2, 3, 4, 5, 6]}
              rows={d.byCategory.map((c) => [c.category, c.total, c.IN_STOCK, c.ASSIGNED, c.UNDER_REPAIR, c.RETIRED, money(c.value)])}
              foot={['Total', d.totals.assets, '', '', '', '', money(d.totals.value)]}
            />
          </Section>
          <Section title="2. Assigned assets" count={`${d.assigned.length} assets`}>
            <Table head={['Tag', 'Asset', 'Employee', 'Department', 'Since']} rows={d.assigned.map((a) => [<span className="font-mono text-xs">{a.assetTag}</span>, a.assetName, <>{a.employeeName}<br /><span className="text-xs text-slate-500">{a.employeeEmail}</span></>, a.department, date(a.assignedAt)])} empty="No assets are assigned" />
          </Section>
          <Section title={`3. Warranty expiring in ${d.warrantyDays} days`} count={`${d.warranty.length} assets`}>
            <Table head={['Tag', 'Asset', 'Category', 'Status', 'Warranty ends', 'Days left']} right={[5]} rows={d.warranty.map((a) => [<span className="font-mono text-xs">{a.assetTag}</span>, a.name, a.category, a.status, date(a.warrantyEnd), a.daysLeft])} empty="No warranties expire in this window" />
          </Section>
          <Section title="4. Repair cost summary" count={`${d.totals.repairs} repairs`}>
            <Table head={['Category', 'Repairs', 'Open', 'Total cost']} right={[1, 2, 3]} rows={d.repairByCategory.map((r) => [r.category, r.count, r.open, money(r.cost)])} foot={['Total', d.totals.repairs, d.repairByCategory.reduce((s, r) => s + r.open, 0), money(d.totals.repairCost)]} empty="No repairs logged" />
          </Section>
          <p className="hidden text-xs text-slate-500 print:block"><FileText className="inline size-3" /> AssetTrack report · printed {dateTime(new Date().toISOString())}</p>
        </div>
      )}
    </div>
  );
}
