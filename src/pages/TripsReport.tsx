import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ReportButton } from '@/components/ReportButton';
import { TrendingUp, TrendingDown, Wallet, Receipt, FileText } from 'lucide-react';
import { toast } from 'sonner';

const DELIVERED_NAMES = ['تم التسليم', 'تسليم جزئي'];
const REJECT_PAID_NAMES = ['رفض ودفع شحن', 'استلم ودفع نص الشحن'];

type TripRow = {
  diary_id: string;
  diary_number: number;
  diary_date: string;
  office_id: string;
  office_name: string;
  owner_name: string;
  owner_phone: string;
  orders_count: number;
  total_value: number; // sum of price + delivery for delivered + reject_paid
  paid: number;        // amount actually paid by customers
  due_to_us: number;   // المتبقى علينا (we owe office) — العميل دفع لنا أكثر من حق المكتب
  due_from_office: number; // المتبقى لنا عند المكتب — المكتب مديون لنا
  previous_due: number;
  expenses: number;
  notes: string;
  notes_extra: string; // diary-level note (free text)
};

export default function TripsReport() {
  const [diaries, setDiaries] = useState<any[]>([]);
  const [offices, setOffices] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [tripExtras, setTripExtras] = useState<Record<string, { notes: string; personal_expenses: number }>>({});
  const [from, setFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState<string>(new Date().toISOString().split('T')[0]);
  const [officeFilter, setOfficeFilter] = useState<string>('all');

  useEffect(() => { loadAll(); }, [from, to]);

  // Load extras (notes + personal expenses) from app_settings (key: trip_extras_v1)
  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'trip_extras_v1').maybeSingle().then(({ data }) => {
      if (data?.value) {
        try { setTripExtras(JSON.parse(data.value)); } catch { /* ignore */ }
      }
    });
  }, []);

  const loadAll = async () => {
    const [diariesRes, officesRes, statusesRes, expensesRes] = await Promise.all([
      supabase.from('diaries').select('*').gte('diary_date', from).lte('diary_date', to).order('diary_date', { ascending: false }),
      supabase.from('offices').select('*'),
      supabase.from('order_statuses').select('*'),
      supabase.from('expenses').select('*').gte('expense_date', from).lte('expense_date', to),
    ]);
    setDiaries(diariesRes.data || []);
    setOffices(officesRes.data || []);
    setStatuses(statusesRes.data || []);
    setExpenses(expensesRes.data || []);

    const diaryIds = (diariesRes.data || []).map(d => d.id);
    if (diaryIds.length) {
      const { data: dos } = await supabase
        .from('diary_orders')
        .select('*, orders(*)')
        .in('diary_id', diaryIds);
      setOrders(dos || []);
    } else {
      setOrders([]);
    }
  };

  const officeMap = useMemo(() => {
    const m: Record<string, any> = {};
    offices.forEach(o => { m[o.id] = o; });
    return m;
  }, [offices]);

  const statusMap = useMemo(() => {
    const m: Record<string, any> = {};
    statuses.forEach(s => { m[s.id] = s; });
    return m;
  }, [statuses]);

  const trips: TripRow[] = useMemo(() => {
    return diaries.map(d => {
      const office = officeMap[d.office_id] || {};
      const dayOrders = orders.filter(o => o.diary_id === d.id);
      const officeExpenses = expenses
        .filter(e => e.office_id === d.office_id && e.expense_date === d.diary_date)
        .reduce((s, e) => s + Number(e.amount || 0), 0);

      let total_value = 0;
      let paid = 0;
      dayOrders.forEach(dord => {
        const o = dord.orders;
        if (!o) return;
        const status = statusMap[o.status_id];
        const sname = status?.name;
        const orderTotal = Number(o.price || 0) + Number(o.delivery_price || 0);
        if (DELIVERED_NAMES.includes(sname)) {
          total_value += orderTotal;
          if (sname === 'تسليم جزئي') paid += Number(o.partial_amount || 0);
          else paid += orderTotal;
        } else if (REJECT_PAID_NAMES.includes(sname)) {
          total_value += Number(o.delivery_price || 0);
          paid += Number(o.shipping_paid || 0);
        }
      });

      const remaining = total_value - paid;
      // Positive remaining = office owes us. Negative = we owe office.
      const due_from_office = Math.max(0, remaining);
      const due_to_us = Math.max(0, -remaining);

      const extras = tripExtras[d.id] || { notes: '', personal_expenses: 0 };

      return {
        diary_id: d.id,
        diary_number: d.diary_number,
        diary_date: d.diary_date,
        office_id: d.office_id,
        office_name: office.name || '-',
        owner_name: office.owner_name || '-',
        owner_phone: office.owner_phone || '-',
        orders_count: dayOrders.length,
        total_value,
        paid,
        due_to_us,
        due_from_office,
        previous_due: Number(d.previous_due || 0),
        expenses: officeExpenses + Number(extras.personal_expenses || 0),
        notes: extras.notes || '',
        notes_extra: extras.notes || '',
      };
    }).filter(t => officeFilter === 'all' || t.office_id === officeFilter);
  }, [diaries, orders, statuses, officeMap, statusMap, expenses, tripExtras, officeFilter]);

  // النِت / الصافي
  const totals = useMemo(() => {
    const total_value = trips.reduce((s, t) => s + t.total_value, 0);
    const total_paid = trips.reduce((s, t) => s + t.paid, 0);
    const total_due_us = trips.reduce((s, t) => s + t.due_to_us, 0);
    const total_due_office = trips.reduce((s, t) => s + t.due_from_office, 0);
    const total_previous = trips.reduce((s, t) => s + t.previous_due, 0);
    const total_expenses = trips.reduce((s, t) => s + t.expenses, 0);
    const orders_count = trips.reduce((s, t) => s + t.orders_count, 0);
    const net_profit = total_paid - total_expenses;
    const net_owed = total_due_office + total_previous - total_due_us;
    return { total_value, total_paid, total_due_us, total_due_office, total_previous, total_expenses, orders_count, net_profit, net_owed };
  }, [trips]);

  const updateExtras = async (diaryId: string, patch: Partial<{ notes: string; personal_expenses: number }>) => {
    const next = { ...tripExtras, [diaryId]: { ...(tripExtras[diaryId] || { notes: '', personal_expenses: 0 }), ...patch } };
    setTripExtras(next);
    // Debounced save: simple immediate save (small payload)
    const { error } = await supabase.from('app_settings').upsert({ key: 'trip_extras_v1', value: JSON.stringify(next) }, { onConflict: 'key' });
    if (error) toast.error('فشل حفظ الملاحظة');
  };

  const reportColumns = [
    { key: 'diary_number', label: 'رقم اليومية' },
    { key: 'diary_date', label: 'التاريخ' },
    { key: 'office_name', label: 'المكتب' },
    { key: 'owner_name', label: 'مسؤول الدفع' },
    { key: 'orders_count', label: 'عدد الأوردرات' },
    { key: 'total_value', label: 'إجمالي قيمة الأوردرات', format: (v: any) => `${Number(v).toLocaleString()} ج.م` },
    { key: 'paid', label: 'المدفوع', format: (v: any) => `${Number(v).toLocaleString()} ج.م` },
    { key: 'due_from_office', label: 'لنا عند المكتب', format: (v: any) => `${Number(v).toLocaleString()} ج.م` },
    { key: 'due_to_us', label: 'علينا للمكتب', format: (v: any) => `${Number(v).toLocaleString()} ج.م` },
    { key: 'previous_due', label: 'مبلغ قديم', format: (v: any) => `${Number(v).toLocaleString()} ج.م` },
    { key: 'expenses', label: 'مصاريف', format: (v: any) => `${Number(v).toLocaleString()} ج.م` },
    { key: 'notes', label: 'ملاحظة' },
  ];

  const meta = {
    title: 'تقرير الرحلات',
    subtitle: `الفترة: من ${from} إلى ${to}${officeFilter !== 'all' ? ` | المكتب: ${officeMap[officeFilter]?.name || ''}` : ''}`,
    filtersText: `من ${from} إلى ${to}${officeFilter !== 'all' ? ` - مكتب محدد` : ' - كل المكاتب'}`,
    summary: [
      { label: 'عدد الرحلات', value: trips.length },
      { label: 'إجمالي الأوردرات', value: totals.orders_count },
      { label: 'إجمالي القيمة', value: `${totals.total_value.toLocaleString()} ج.م` },
      { label: 'إجمالي المدفوع', value: `${totals.total_paid.toLocaleString()} ج.م` },
      { label: 'لنا عند المكاتب', value: `${totals.total_due_office.toLocaleString()} ج.م` },
      { label: 'علينا للمكاتب', value: `${totals.total_due_us.toLocaleString()} ج.م` },
      { label: 'مبلغ قديم', value: `${totals.total_previous.toLocaleString()} ج.م` },
      { label: 'إجمالي المصاريف', value: `${totals.total_expenses.toLocaleString()} ج.م` },
      { label: 'صافي المستحق لنا', value: `${totals.net_owed.toLocaleString()} ج.م` },
      { label: 'صافي الربح (المدفوع - المصاريف)', value: `${totals.net_profit.toLocaleString()} ج.م` },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">تقرير الرحلات</h1>
        <ReportButton meta={meta} columns={reportColumns} rows={trips} hideWhatsapp />
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-3 flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">من تاريخ</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="bg-secondary border-border w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">إلى تاريخ</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="bg-secondary border-border w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">المكتب</Label>
            <Select value={officeFilter} onValueChange={setOfficeFilter}>
              <SelectTrigger className="w-48 bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المكاتب</SelectItem>
                {offices.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={loadAll}>تحديث</Button>
        </CardContent>
      </Card>

      {/* Net summary box - the small left box requested */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="bg-primary/10 border-primary/30"><CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/20 p-2"><Wallet className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">صافي المدفوعات</p>
              <p className="text-base font-bold text-primary">{totals.total_paid.toLocaleString()} ج.م</p>
            </div>
          </div>
        </CardContent></Card>
        <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-100 p-2"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
            <div>
              <p className="text-xs text-emerald-700">صافي الربح</p>
              <p className="text-base font-bold text-emerald-700">{totals.net_profit.toLocaleString()} ج.م</p>
            </div>
          </div>
        </CardContent></Card>
        <Card className="bg-amber-50 border-amber-200"><CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-100 p-2"><TrendingDown className="h-5 w-5 text-amber-600" /></div>
            <div>
              <p className="text-xs text-amber-700">صافي المستحق</p>
              <p className="text-base font-bold text-amber-700">{totals.net_owed.toLocaleString()} ج.م</p>
            </div>
          </div>
        </CardContent></Card>
        <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-rose-100 p-2"><Receipt className="h-5 w-5 text-rose-600" /></div>
            <div>
              <p className="text-xs text-rose-700">صافي المصاريف</p>
              <p className="text-base font-bold text-rose-700">{totals.total_expenses.toLocaleString()} ج.م</p>
            </div>
          </div>
        </CardContent></Card>
      </div>

      {/* Trips table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> تفاصيل الرحلات ({trips.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">#</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">المكتب</TableHead>
                  <TableHead className="text-right">المسؤول</TableHead>
                  <TableHead className="text-center">الأوردرات</TableHead>
                  <TableHead className="text-right">القيمة</TableHead>
                  <TableHead className="text-right">المدفوع</TableHead>
                  <TableHead className="text-right">لنا</TableHead>
                  <TableHead className="text-right">علينا</TableHead>
                  <TableHead className="text-right">قديم</TableHead>
                  <TableHead className="text-right">مصاريف شخصية</TableHead>
                  <TableHead className="text-right min-w-[180px]">ملاحظة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">لا توجد رحلات في هذه الفترة</TableCell></TableRow>
                ) : trips.map(t => (
                  <TableRow key={t.diary_id}>
                    <TableCell className="font-mono text-xs">#{t.diary_number}</TableCell>
                    <TableCell className="text-xs">{t.diary_date}</TableCell>
                    <TableCell className="text-sm font-medium">{t.office_name}</TableCell>
                    <TableCell className="text-xs">
                      <div>{t.owner_name}</div>
                      {t.owner_phone && <div dir="ltr" className="text-muted-foreground">{t.owner_phone}</div>}
                    </TableCell>
                    <TableCell className="text-center font-bold">{t.orders_count}</TableCell>
                    <TableCell className="text-sm">{t.total_value.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-emerald-600 font-semibold">{t.paid.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-amber-600 font-semibold">{t.due_from_office.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-rose-600 font-semibold">{t.due_to_us.toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{t.previous_due.toLocaleString()}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        defaultValue={tripExtras[t.diary_id]?.personal_expenses || 0}
                        onBlur={e => updateExtras(t.diary_id, { personal_expenses: Number(e.target.value) || 0 })}
                        className="h-7 w-20 bg-secondary border-border text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Textarea
                        defaultValue={tripExtras[t.diary_id]?.notes || ''}
                        onBlur={e => updateExtras(t.diary_id, { notes: e.target.value })}
                        className="h-8 min-h-[32px] w-full bg-secondary border-border text-xs resize-none"
                        placeholder="ملاحظة..."
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
