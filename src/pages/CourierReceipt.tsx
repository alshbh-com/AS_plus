import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ReportButton } from '@/components/ReportButton';
import { CheckCircle2, XCircle, RotateCcw, Package } from 'lucide-react';

const DELIVERED_NAMES = ['تم التسليم', 'تسليم جزئي'];
const RETURNED_NAMES = ['مرتجع', 'تهرب', 'لم يرد', 'ملغي'];
const REJECTED_NAMES = ['رفض ودفع شحن', 'رفض ولم يدفع شحن'];

export default function CourierReceipt() {
  const [couriers, setCouriers] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [statuses, setStatuses] = useState<any[]>([]);
  const [selectedCourier, setSelectedCourier] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'courier');
      if (roles?.length) {
        const { data: ps } = await supabase.from('profiles').select('*').in('id', roles.map(r => r.user_id));
        setCouriers(ps || []);
        const map: Record<string, any> = {};
        (ps || []).forEach((p: any) => { map[p.id] = p; });
        setProfiles(map);
      }
      const { data: sts } = await supabase.from('order_statuses').select('*');
      setStatuses(sts || []);
    })();
  }, []);

  useEffect(() => {
    if (!selectedCourier) { setOrders([]); return; }
    (async () => {
      const { data } = await supabase
        .from('orders')
        .select('*, order_statuses(name, color), offices(name)')
        .eq('courier_id', selectedCourier)
        .order('created_at', { ascending: false });
      setOrders(data || []);
    })();
  }, [selectedCourier]);

  const courier = profiles[selectedCourier];

  // Filter by selected date (assignment date if available, else created_at)
  const dayOrders = useMemo(() => {
    if (!date) return orders;
    return orders.filter(o => {
      const ts = o.courier_assigned_at || o.created_at;
      return ts && ts.startsWith(date);
    });
  }, [orders, date]);

  const groups = useMemo(() => {
    const delivered: any[] = [];
    const returned: any[] = [];
    const rejected: any[] = [];
    const pending: any[] = [];
    dayOrders.forEach(o => {
      const statusName = o.order_statuses?.name;
      if (DELIVERED_NAMES.includes(statusName)) delivered.push(o);
      else if (RETURNED_NAMES.includes(statusName)) returned.push(o);
      else if (REJECTED_NAMES.includes(statusName)) rejected.push(o);
      else pending.push(o);
    });
    return { delivered, returned, rejected, pending };
  }, [dayOrders]);

  const totalCollected = groups.delivered.reduce((s, o) => {
    if (o.order_statuses?.name === 'تسليم جزئي') return s + Number(o.partial_amount || 0);
    return s + Number(o.price || 0) + Number(o.delivery_price || 0);
  }, 0)
  + groups.rejected.reduce((s, o) => s + Number(o.shipping_paid || 0), 0);

  // Auto commission: applies to delivered + partial + rejected (paid shipping)
  const commissionRate = Number(courier?.commission_amount || 0);
  const commissionableCount = groups.delivered.length + groups.rejected.length;
  const totalCommission = commissionRate * commissionableCount;
  const netDue = totalCollected - totalCommission;

  const reportColumns = [
    { key: 'tracking_id', label: 'Tracking' },
    { key: 'barcode', label: 'الباركود' },
    { key: 'customer_name', label: 'العميل' },
    { key: 'customer_phone', label: 'الهاتف' },
    { key: 'address', label: 'العنوان' },
    { key: 'office_name', label: 'المكتب', format: (_: any, r: any) => r.offices?.name || '-' },
    { key: 'price', label: 'سعر المنتج', format: (v: any) => `${Number(v || 0)} ج.م` },
    { key: 'delivery_price', label: 'الشحن', format: (v: any) => `${Number(v || 0)} ج.م` },
    { key: 'status', label: 'الحالة', format: (_: any, r: any) => r.order_statuses?.name || '-' },
    { key: 'partial_amount', label: 'المحصل جزئي', format: (v: any) => v ? `${Number(v)} ج.م` : '-' },
    { key: 'shipping_paid', label: 'شحن مدفوع', format: (v: any) => v ? `${Number(v)} ج.م` : '-' },
    { key: 'commission', label: 'عمولة المندوب', format: (_: any, r: any) => {
      const sname = r.order_statuses?.name;
      if (DELIVERED_NAMES.includes(sname) || REJECTED_NAMES.includes(sname)) return `${commissionRate} ج.م`;
      return '-';
    } },
    { key: 'notes', label: 'ملاحظات' },
  ];

  const meta = {
    title: `إقرار تحصيل المندوب - ${courier?.full_name || ''}`,
    subtitle: `التاريخ: ${date} | المندوب: ${courier?.full_name || '-'}`,
    filtersText: `اليوم: ${date}`,
    summary: [
      { label: 'إجمالي الأوردرات', value: dayOrders.length },
      { label: 'تم التسليم', value: groups.delivered.length },
      { label: 'مرتجع', value: groups.returned.length },
      { label: 'رفض', value: groups.rejected.length },
      { label: 'قيد التنفيذ', value: groups.pending.length },
      { label: 'إجمالي المحصل', value: `${totalCollected.toLocaleString()} ج.م` },
      { label: `عمولة المندوب (${commissionRate}×${commissionableCount})`, value: `${totalCommission.toLocaleString()} ج.م` },
      { label: 'صافي المستحق للشركة', value: `${netDue.toLocaleString()} ج.م` },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">إقرار تحصيل المندوبين</h1>
        {selectedCourier && dayOrders.length > 0 && (
          <ReportButton
            meta={meta}
            columns={reportColumns}
            rows={dayOrders}
            whatsappPhone={courier?.phone}
            label="تقرير + واتساب"
          />
        )}
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">المندوب</Label>
            <Select value={selectedCourier} onValueChange={setSelectedCourier}>
              <SelectTrigger className="w-56 bg-secondary border-border"><SelectValue placeholder="اختر مندوب" /></SelectTrigger>
              <SelectContent>{couriers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">التاريخ</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-44 bg-secondary border-border" />
          </div>
          {courier?.phone && (
            <div className="text-sm text-muted-foreground self-end pb-2">
              📱 رقم المندوب: <span dir="ltr" className="font-mono">{courier.phone}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedCourier && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
            <Card className="bg-card border-border"><CardContent className="p-3 text-center">
              <Package className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">إجمالي اليوم</p>
              <p className="text-xl font-bold">{dayOrders.length}</p>
            </CardContent></Card>
            <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center">
              <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-emerald-600" />
              <p className="text-xs text-emerald-700">تم التسليم</p>
              <p className="text-xl font-bold text-emerald-700">{groups.delivered.length}</p>
            </CardContent></Card>
            <Card className="bg-amber-50 border-amber-200"><CardContent className="p-3 text-center">
              <RotateCcw className="h-5 w-5 mx-auto mb-1 text-amber-600" />
              <p className="text-xs text-amber-700">مرتجع</p>
              <p className="text-xl font-bold text-amber-700">{groups.returned.length}</p>
            </CardContent></Card>
            <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center">
              <XCircle className="h-5 w-5 mx-auto mb-1 text-rose-600" />
              <p className="text-xs text-rose-700">رفض</p>
              <p className="text-xl font-bold text-rose-700">{groups.rejected.length}</p>
            </CardContent></Card>
            <Card className="bg-primary/10 border-primary/30"><CardContent className="p-3 text-center">
              <p className="text-xs text-primary">إجمالي المحصل</p>
              <p className="text-lg font-bold text-primary">{totalCollected.toLocaleString()} ج.م</p>
            </CardContent></Card>
            <Card className="bg-sky-50 border-sky-200"><CardContent className="p-3 text-center">
              <p className="text-xs text-sky-700">عمولة المندوب</p>
              <p className="text-lg font-bold text-sky-700">{totalCommission.toLocaleString()} ج.م</p>
              <p className="text-[10px] text-muted-foreground">{commissionRate} × {commissionableCount}</p>
            </CardContent></Card>
          </div>

          <Card className="bg-emerald-100/50 border-emerald-300"><CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-emerald-700">صافي المستحق للشركة (المحصل − عمولة المندوب)</p>
              <p className="text-2xl font-extrabold text-emerald-700">{netDue.toLocaleString()} ج.م</p>
            </div>
            {commissionRate === 0 && (
              <p className="text-xs text-amber-700 max-w-xs text-left">⚠️ عمولة المندوب = 0. عدّلها من صفحة المستخدمين.</p>
            )}
          </CardContent></Card>

          <ReceiptSection title="تم التسليم" items={groups.delivered} color="emerald" />
          <ReceiptSection title="مرتجع" items={groups.returned} color="amber" />
          <ReceiptSection title="رفض الاستلام" items={groups.rejected} color="rose" />
          {groups.pending.length > 0 && <ReceiptSection title="قيد التنفيذ" items={groups.pending} color="slate" />}
        </>
      )}
    </div>
  );
}

function ReceiptSection({ title, items, color }: { title: string; items: any[]; color: string }) {
  if (items.length === 0) return null;
  const colorClasses: Record<string, string> = {
    emerald: 'border-emerald-200 bg-emerald-50/30',
    amber: 'border-amber-200 bg-amber-50/30',
    rose: 'border-rose-200 bg-rose-50/30',
    slate: 'border-slate-200 bg-slate-50/30',
  };
  return (
    <Card className={colorClasses[color] || 'bg-card border-border'}>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">{title} <Badge variant="secondary">{items.length}</Badge></CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow><TableHead className="text-right">الباركود</TableHead><TableHead className="text-right">العميل</TableHead><TableHead className="text-right">العنوان</TableHead><TableHead className="text-right">المكتب</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">المبلغ</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {items.map(o => {
                let amount = 0;
                if (o.order_statuses?.name === 'تم التسليم') amount = Number(o.price || 0) + Number(o.delivery_price || 0);
                else if (o.order_statuses?.name === 'تسليم جزئي') amount = Number(o.partial_amount || 0);
                else if (REJECTED_NAMES.includes(o.order_statuses?.name)) amount = Number(o.shipping_paid || 0);
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.barcode || '-'}</TableCell>
                    <TableCell className="text-sm">{o.customer_name}</TableCell>
                    <TableCell className="text-sm">{o.address || '-'}</TableCell>
                    <TableCell className="text-sm">{o.offices?.name || '-'}</TableCell>
                    <TableCell><Badge style={{ backgroundColor: (o.order_statuses?.color || '#888') + '30', color: o.order_statuses?.color }}>{o.order_statuses?.name || '-'}</Badge></TableCell>
                    <TableCell className="font-bold">{amount > 0 ? `${amount} ج.م` : '-'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
