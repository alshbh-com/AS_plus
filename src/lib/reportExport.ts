import * as XLSX from 'xlsx';

export type ReportColumn = {
  key: string;
  label: string;
  format?: (val: any, row: any) => string | number;
};

export type ReportMeta = {
  title: string;
  subtitle?: string;
  filtersText?: string; // e.g. "التاريخ: 2025-04-17 | الحالة: تم التسليم"
  summary?: { label: string; value: string | number }[];
};

const NUMERIC_KEYS = new Set(['price', 'delivery_price', 'shipping_paid', 'partial_amount', 'amount', 'total', 'quantity']);

function fmtCell(val: any, key: string): string {
  if (val === null || val === undefined || val === '') return '-';
  if (typeof val === 'boolean') return val ? '✅' : '❌';
  if (val instanceof Date) return val.toLocaleDateString('ar-EG');
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    return new Date(val).toLocaleDateString('ar-EG');
  }
  return String(val);
}

/** Open a print window with PDF-style report. Uses window.print() — works for Save as PDF. */
export function exportReportPDF(
  meta: ReportMeta,
  columns: ReportColumn[],
  rows: any[]
) {
  const w = window.open('', '_blank');
  if (!w) return;

  const headerRow = columns.map(c => `<th>${c.label}</th>`).join('');
  const bodyRows = rows
    .map((r, i) => {
      const cells = columns
        .map(c => {
          const raw = r[c.key];
          const v = c.format ? c.format(raw, r) : fmtCell(raw, c.key);
          return `<td>${v ?? '-'}</td>`;
        })
        .join('');
      return `<tr><td>${i + 1}</td>${cells}</tr>`;
    })
    .join('');

  const summaryHtml = meta.summary?.length
    ? `<div class="summary">${meta.summary
        .map(s => `<span><b>${s.label}:</b> ${s.value}</span>`)
        .join(' | ')}</div>`
    : '';

  const dateStr = new Date().toLocaleString('ar-EG');

  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
  <title>${meta.title}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Cairo', Tahoma, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 8px; }
    .header { text-align: center; border-bottom: 3px solid #f97316; padding-bottom: 8px; margin-bottom: 10px; }
    .header h1 { margin: 0; font-size: 22px; color: #f97316; font-weight: 800; }
    .header .brand { font-size: 13px; color: #666; margin-top: 2px; }
    .header .sub { font-size: 12px; color: #444; margin-top: 4px; }
    .filters { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 6px 10px; margin-bottom: 8px; font-size: 11px; }
    .summary { background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; font-size: 12px; font-weight: bold; text-align: center; }
    .summary span { margin: 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: right; font-size: 10px; }
    th { background: #f97316; color: white; font-weight: 700; }
    tr:nth-child(even) td { background: #f8fafc; }
    .footer { margin-top: 10px; text-align: center; font-size: 9px; color: #666; }
    @media print {
      .no-print { display: none; }
    }
  </style></head><body>
    <div class="header">
      <h1>${meta.title}</h1>
      <div class="brand">The Pilito - نظام الشحن</div>
      ${meta.subtitle ? `<div class="sub">${meta.subtitle}</div>` : ''}
    </div>
    ${meta.filtersText ? `<div class="filters"><b>التصفية:</b> ${meta.filtersText}</div>` : ''}
    ${summaryHtml}
    <table>
      <thead><tr><th>#</th>${headerRow}</tr></thead>
      <tbody>${bodyRows || `<tr><td colspan="${columns.length + 1}" style="text-align:center;padding:20px;">لا توجد بيانات</td></tr>`}</tbody>
    </table>
    <div class="footer">تم الإنشاء: ${dateStr} | عدد السجلات: ${rows.length}</div>
    <script>setTimeout(() => { window.print(); }, 350);</script>
  </body></html>`);
  w.document.close();
}

/** Download report as Excel file. */
export function exportReportExcel(
  meta: ReportMeta,
  columns: ReportColumn[],
  rows: any[],
  filename?: string
) {
  const data = rows.map((r, i) => {
    const o: Record<string, any> = { '#': i + 1 };
    columns.forEach(c => {
      const raw = r[c.key];
      o[c.label] = c.format ? c.format(raw, r) : fmtCell(raw, c.key);
    });
    return o;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  // Auto column width
  const cols = ['#', ...columns.map(c => c.label)];
  ws['!cols'] = cols.map(label => {
    let max = label.length;
    data.forEach(row => {
      const v = String(row[label] ?? '');
      if (v.length > max) max = v.length;
    });
    return { wch: Math.min(max + 2, 40) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير');

  // Add summary sheet if available
  if (meta.summary?.length) {
    const summaryData = [
      [meta.title],
      [meta.subtitle || ''],
      [meta.filtersText || ''],
      [],
      ['البند', 'القيمة'],
      ...meta.summary.map(s => [s.label, s.value]),
    ];
    const sws = XLSX.utils.aoa_to_sheet(summaryData);
    sws['!cols'] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, sws, 'ملخص');
  }

  const safeName = (filename || meta.title).replace(/[^\w\u0600-\u06FF\s-]/g, '').slice(0, 80);
  const today = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `${safeName}_${today}.xlsx`);
}

/** Open WhatsApp web with a pre-filled message. Optionally with phone. */
export function openWhatsApp(message: string, phone?: string) {
  const cleanPhone = (phone || '').replace(/\D/g, '');
  // Egypt: prepend 20 if it starts with 0
  let intl = cleanPhone;
  if (intl.startsWith('0')) intl = '20' + intl.slice(1);
  const base = intl ? `https://wa.me/${intl}` : 'https://wa.me/';
  const url = `${base}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

/** Build a short text summary for WhatsApp (PDF/Excel attachment is uploaded manually). */
export function buildWhatsAppSummary(meta: ReportMeta, rowCount: number): string {
  const lines: string[] = [];
  lines.push(`📋 *${meta.title}*`);
  if (meta.subtitle) lines.push(meta.subtitle);
  if (meta.filtersText) lines.push(`🔍 ${meta.filtersText}`);
  lines.push(`📊 عدد السجلات: ${rowCount}`);
  if (meta.summary?.length) {
    lines.push('');
    lines.push('*الملخص:*');
    meta.summary.forEach(s => lines.push(`• ${s.label}: ${s.value}`));
  }
  lines.push('');
  lines.push('_The Pilito - نظام الشحن_');
  return lines.join('\n');
}
