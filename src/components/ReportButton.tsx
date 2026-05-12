import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { FileText, FileSpreadsheet, MessageCircle, Download } from 'lucide-react';
import { exportReportPDF, exportReportExcel, openWhatsApp, buildWhatsAppSummary, type ReportColumn, type ReportMeta } from '@/lib/reportExport';

interface ReportButtonProps {
  meta: ReportMeta;
  columns: ReportColumn[];
  rows: any[];
  /** Optional phone to pre-fill WhatsApp (e.g. courier phone). */
  whatsappPhone?: string;
  /** Optional label override. */
  label?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'secondary';
  /** Hide whatsapp option (for non-courier reports). */
  hideWhatsapp?: boolean;
}

export function ReportButton({ meta, columns, rows, whatsappPhone, label = 'تقرير', size = 'sm', variant = 'outline', hideWhatsapp }: ReportButtonProps) {
  const [open, setOpen] = useState(false);

  const handlePDF = () => {
    exportReportPDF(meta, columns, rows);
    setOpen(false);
  };
  const handleExcel = () => {
    exportReportExcel(meta, columns, rows);
    setOpen(false);
  };
  const handleWhatsapp = () => {
    const msg = buildWhatsAppSummary(meta, rows.length);
    openWhatsApp(msg, whatsappPhone);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant} className="gap-1">
          <Download className="h-4 w-4" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card border-border">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {rows.length} سجل {meta.filtersText ? '(مفلتر)' : ''}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handlePDF} className="cursor-pointer">
          <FileText className="h-4 w-4 ml-2 text-red-500" />
          تقرير PDF (للطباعة)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExcel} className="cursor-pointer">
          <FileSpreadsheet className="h-4 w-4 ml-2 text-green-600" />
          تحميل Excel
        </DropdownMenuItem>
        {!hideWhatsapp && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleWhatsapp} className="cursor-pointer">
              <MessageCircle className="h-4 w-4 ml-2 text-green-500" />
              إرسال على واتساب
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
