import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ReportButton } from '@/components/ReportButton';
import { Calculator, CheckCircle2, XCircle, RotateCcw, Wallet, TrendingDown } from 'lucide-react';

const DELIVERED_NAMES = ['تم التسليم'];
const PARTIAL_NAMES = ['تسليم جزئي'];
const REJECTED_PAID_NAMES = ['رفض ودفع شحن', 'استلم ودفع نص الشحن'];
const REJECTED_UNPAID_NAMES = ['رفض ولم يدفع شحن'];
const RETURNED_NAMES = ['مرتجع', 'تهرب', 'لم يرد', 'ملغي'];

type Period = 'day' | 'week' | 'month' | 'custom';

function periodRange(period: Period, anchor: string, fromDate: string, toDate: string) {
  const d = new Date(anchor);
  if (isNaN(d.getTime())) return { from: '', to: '' };
  if (period === 'day') {
    const day = d.toISOString().slice(0, 10);
    return { from: day, to: day };
  }
  if (period === 'week') {
    const start = new Date(d); start.setDate(d.getDate() - d.getDay());
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  if (period === 'month') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  return { from: fromDate, to: toDate };
}

export default function CourierMonthlyReport() {
  const [couriers, setCouriers] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [offices, setOffices] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);

  const [selectedCourier, setSelectedCourier] = useState('');
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(new Date().toISOString().slice(0, 10));
  const [fromDate, setFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));

  const range = useMemo(() => periodRange(period, anchor, fromDate, toDate), [period, anchor, fromDate, toDate]);

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
      const { data: offs } = await supabase.from('offices').select('id, name, office_commission');
      setOffices(offs || []);
      const { data: sts } = await supabase.from('order_statuses').select('*');
      setStatuses(sts || []);
    })();
  }, []);

  useEffect(() => {
    if (!selectedCourier || !range.from || !range.to) { setOrders([]); setCollections([]); return; }
    (async () => {
      const fromTs = `${range.from}T00:00:00`;
      const toTs = `${range.to}T23:59:59`;
      const { data: ords } = await supabase
        .from('orders')
        .select('*, order_statuses(name, color), offices(name, office_commission)')
        .eq('courier_id', selectedCourier)
        .gte('created_at', fromTs)
        .lte('created_at', toTs)
        .order('created_at', { ascending: false })
        .limit(2000);
      setOrders(ords || []);
      const { data: cols } = await supabase
        .from('courier_collections')
        .select('*')
        .eq('courier_id', selectedCourier)
        .gte('created_at', fromTs)
        .lte('created_at', toTs);
      setCollections(cols || []);
    })();
  }, [selectedCourier, range.from, range.to]);

  const courier = profiles[selectedCourier];
  const courierCommissionRate = Number(courier?.commission_amount || 0);

  const grouped = useMemo(() => {
    const delivered: any[] = [];
    const partial: any[] = [];
    const rejPaid: any[] = [];
    const rejUnpaid: any[] = [];
    const returned: any[] = [];
    const other: any[] = [];
    orders.forEach(o => {
      const n = o.order_statuses?.name;
      if (DELIVERED_NAMES.includes(n)) delivered.push(o);
      else if (PARTIAL_NAMES.includes(n)) partial.push(o);
      else if (REJECTED_PAID_NAMES.includes(n)) rejPaid.push(o);
      else if (REJECTED_UNPAID_NAMES.includes(n)) rejUnpaid.push(o);
      else if (RETURNED_NAMES.includes(n)) returned.push(o);
      else other.push(o);
    });
    return { delivered, partial, rejPaid, rejUnpaid, returned, other };
  }, [orders]);

  const stats = useMemo(() => {
    let totalRevenue = 0;
    let totalShipping = 0;
    let courierCommission = 0;
    let officeCommission = 0;

    grouped.delivered.forEach(o => {
      totalRevenue += Number(o.price || 0) + Number(o.delivery_price || 0);
      totalShipping += Number(o.delivery_price || 0);
      courierCommission += courierCommissionRate;
      officeCommission += Number(o.offices?.office_commission || 0);
    });
    grouped.partial.forEach(o => {
      totalRevenue += Number(o.partial_amount || 0);
      totalShipping += Number(o.delivery_price || 0);
      courierCommission += courierCommissionRate;
      officeCommission += Number(o.offices?.office_commission || 0);
    });
    grouped.rejPaid.forEach(o => {
      totalRevenue += Number(o.shipping_paid || 0);
      totalShipping += Number(o.shipping_paid || 0);
      courierCommission += courierCommissionRate;
    });

    const countableOrders = grouped.delivered.length + grouped.partial.length + grouped.rejPaid.length;
    const collectedByCourier = collections.reduce((s, c) => s + Number(c.amount || 0), 0);
    const netDueToCompany = totalRevenue - courierCommission - collectedByCourier;
    const remainingShipping = totalShipping - collectedByCourier;

    return {
      totalRevenue, totalShipping, courierCommission, officeCommission,
      countableOrders, collectedByCourier, netDueToCompany, remainingShipping,
    };
  }, [grouped, courierCommissionRate, collections]);

  const reportColumns = [
    { key: 'created_at', label: 'التاريخ', format: (v: any) => v ? new Date(v).toLocaleDateString('ar-EG') : '-' },
    { key: 'barcode', label: 'الباركود' },
    { key: 'customer_name', label: 'العميل' },
    { key: 'address', label: 'العنوان' },
    { key: 'office_name', label: 'المكتب', format: (_: any, r: any) => r.offices?.name || '-' },
    { key: 'price', label: 'السعر', format: (v: any) => `${Number(v || 0)} ج` },
    { key: 'delivery_price', label: 'الشحن', format: (v: any) => `${Number(v || 0)} ج` },
    { key: 'status', label: 'الحالة', format: (_: any, r: any) => r.order_statuses?.name || '-' },
    { key: 'courier_comm', label: 'عمولة المندوب', format: (_: any, r: any) => {
      const n = r.order_statuses?.name;
      if (DELIVERED_NAMES.includes(n) || PARTIAL_NAMES.includes(n) || REJECTED_PAID_NAMES.includes(n)) return `${courierCommissionRate} ج`;
      return '-';
    }},
    { key: 'office_comm', label: 'عمولة المكتب', format: (_: any, r: any) => {
      const n = r.order_statuses?.name;
      if (DELIVERED_NAMES.includes(n) || PARTIAL_NAMES.includes(n)) return `${Number(r.offices?.office_commission || 0)} ج`;
      return '-';
    }},
  ];

  const meta = {
    title: `تقرير جرد المندوب - ${courier?.full_name || ''}`,
    subtitle: `الفترة: ${range.from} إلى ${range.to}`,
    filtersText: `المندوب: ${courier?.full_name || '-'}`,
    summary: [
      { label: 'إجمالي الأوردرات', value: orders.length },
      { label: 'تم التسليم', value: grouped.delivered.length },
      { label: 'تسليم جزئي', value: grouped.partial.length },
      { label: 'رفض ودفع', value: grouped.rejPaid.length },
      { label: 'رفض بدون دفع', value: grouped.rejUnpaid.length },
      { label: 'مرتجع', value: grouped.returned.length },
      { label: 'إجمالي الإيراد', value: `${stats.totalRevenue.toLocaleString()} ج` },
      { label: 'إجمالي الشحن', value: `${stats.totalShipping.toLocaleString()} ج` },
      { label: `عمولة المندوب (${courierCommissionRate}×${stats.countableOrders})`, value: `${stats.courierCommission.toLocaleString()} ج` },
      { label: 'عمولة المكاتب', value: `${stats.officeCommission.toLocaleString()} ج` },
      { label: 'المحصّل من المندوب', value: `${stats.collectedByCourier.toLocaleString()} ج` },
      { label: 'صافي المستحق للشركة', value: `${stats.netDueToCompany.toLocaleString()} ج` },
      { label: 'فاضل من الشحن', value: `${stats.remainingShipping.toLocaleString()} ج` },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Calculator className="h-6 w-6 text-primary" /> جرد المندوبين (شهري / أسبوعي / يومي)</h1>
        {selectedCourier && orders.length > 0 && (
          <ReportButton meta={meta} columns={reportColumns} rows={orders} whatsappPhone={courier?.phone} label="تقرير + واتساب" />
        )}
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">المندوب</Label>
            <Select value={selectedCourier} onValueChange={setSelectedCourier}>
              <SelectTrigger className="w-56"><SelectValue placeholder="اختر مندوب" /></SelectTrigger>
              <SelectContent>{couriers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الفترة</Label>
            <Select value={period} onValueChange={(v: Period) => setPeriod(v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">يومي</SelectItem>
                <SelectItem value="week">أسبوعي</SelectItem>
                <SelectItem value="month">شهري</SelectItem>
                <SelectItem value="custom">فترة مخصصة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period !== 'custom' ? (
            <div className="space-y-1">
              <Label className="text-xs">التاريخ المرجعي</Label>
              <Input type="date" value={anchor} onChange={e => setAnchor(e.target.value)} className="w-44" />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs">من</Label>
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-44" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">إلى</Label>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-44" />
              </div>
            </>
          )}
          <div className="text-xs text-muted-foreground self-end pb-2">
            من <b>{range.from}</b> إلى <b>{range.to}</b>
          </div>
        </CardContent>
      </Card>

      {selectedCourier && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <StatCard icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} label="تم التسليم" value={grouped.delivered.length} cls="bg-emerald-50 border-emerald-200" />
            <StatCard icon={<CheckCircle2 className="h-5 w-5 text-sky-600" />} label="تسليم جزئي" value={grouped.partial.length} cls="bg-sky-50 border-sky-200" />
            <StatCard icon={<XCircle className="h-5 w-5 text-amber-600" />} label="رفض ودفع شحن" value={grouped.rejPaid.length} cls="bg-amber-50 border-amber-200" />
            <StatCard icon={<XCircle className="h-5 w-5 text-rose-600" />} label="رفض بدون دفع" value={grouped.rejUnpaid.length} cls="bg-rose-50 border-rose-200" />
            <StatCard icon={<RotateCcw className="h-5 w-5 text-slate-600" />} label="مرتجع/لم يرد" value={grouped.returned.length} cls="bg-slate-50 border-slate-200" />
            <StatCard icon={<Calculator className="h-5 w-5 text-primary" />} label="إجمالي الأوردرات" value={orders.length} cls="bg-primary/10 border-primary/30" />
          </div>

          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            <BigCard label="إجمالي الإيراد" value={`${stats.totalRevenue.toLocaleString()} ج`} icon={<Wallet className="h-5 w-5" />} cls="bg-emerald-100/40 border-emerald-300 text-emerald-800" />
            <BigCard label="إجمالي الشحن" value={`${stats.totalShipping.toLocaleString()} ج`} icon={<Wallet className="h-5 w-5" />} cls="bg-amber-100/40 border-amber-300 text-amber-800" />
            <BigCard label={`عمولة المندوب (${courierCommissionRate}×${stats.countableOrders})`} value={`${stats.courierCommission.toLocaleString()} ج`} icon={<TrendingDown className="h-5 w-5" />} cls="bg-sky-100/40 border-sky-300 text-sky-800" />
            <BigCard label="عمولة المكاتب" value={`${stats.officeCommission.toLocaleString()} ج`} icon={<TrendingDown className="h-5 w-5" />} cls="bg-purple-100/40 border-purple-300 text-purple-800" />
            <BigCard label="المحصّل من المندوب" value={`${stats.collectedByCourier.toLocaleString()} ج`} icon={<Wallet className="h-5 w-5" />} cls="bg-indigo-100/40 border-indigo-300 text-indigo-800" />
            <BigCard label="فاضل من الشحن" value={`${stats.remainingShipping.toLocaleString()} ج`} icon={<Wallet className="h-5 w-5" />} cls="bg-orange-100/40 border-orange-300 text-orange-800" />
            <BigCard label="صافي المستحق للشركة" value={`${stats.netDueToCompany.toLocaleString()} ج`} icon={<Wallet className="h-5 w-5" />} cls="bg-emerald-200/50 border-emerald-400 text-emerald-900 md:col-span-2" />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">تفاصيل الأوردرات</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الباركود</TableHead>
                    <TableHead>العميل</TableHead>
                    <TableHead>المكتب</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>الشحن</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>عمولة المندوب</TableHead>
                    <TableHead>عمولة المكتب</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">لا توجد بيانات</TableCell></TableRow>
                  ) : orders.map(o => {
                    const n = o.order_statuses?.name;
                    const cc = (DELIVERED_NAMES.includes(n) || PARTIAL_NAMES.includes(n) || REJECTED_PAID_NAMES.includes(n)) ? courierCommissionRate : 0;
                    const oc = (DELIVERED_NAMES.includes(n) || PARTIAL_NAMES.includes(n)) ? Number(o.offices?.office_commission || 0) : 0;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="text-xs">{new Date(o.created_at).toLocaleDateString('ar-EG')}</TableCell>
                        <TableCell className="font-mono">{o.barcode}</TableCell>
                        <TableCell>{o.customer_name}</TableCell>
                        <TableCell>{o.offices?.name || '-'}</TableCell>
                        <TableCell>{Number(o.price || 0)}</TableCell>
                        <TableCell>{Number(o.delivery_price || 0)}</TableCell>
                        <TableCell>
                          <Badge style={{ backgroundColor: (o.order_statuses?.color || '#888') + '30', color: o.order_statuses?.color }}>
                            {n || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell>{cc || '-'}</TableCell>
                        <TableCell>{oc || '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, cls }: any) {
  return (
    <Card className={cls}>
      <CardContent className="p-3 text-center">
        <div className="flex justify-center mb-1">{icon}</div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function BigCard({ icon, label, value, cls }: any) {
  return (
    <Card className={cls}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="rounded-lg p-2 bg-white/40">{icon}</div>
        <div>
          <p className="text-xs opacity-80">{label}</p>
          <p className="text-lg font-extrabold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
