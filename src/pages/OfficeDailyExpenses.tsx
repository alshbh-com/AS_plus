import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Truck, Building2, HandCoins, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { ReportButton } from '@/components/ReportButton';
import { useAuth } from '@/contexts/AuthContext';

const CATEGORIES = [
  { key: 'shipments', label: 'مصاريف شحنات', icon: Truck, color: 'text-sky-600 bg-sky-50 border-sky-200' },
  { key: 'office', label: 'مصاريف مكتب', icon: Building2, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { key: 'advances', label: 'سلف', icon: HandCoins, color: 'text-amber-600 bg-amber-50 border-amber-200' },
];

export default function OfficeDailyExpenses() {
  const { user } = useAuth();
  const [offices, setOffices] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [from, setFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState<string>(new Date().toISOString().split('T')[0]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    office_id: '',
    expense_date: new Date().toISOString().split('T')[0],
    category: 'office',
    amount: '',
    notes: '',
  });

  useEffect(() => {
    supabase.from('offices').select('id, name').order('name').then(({ data }) => setOffices(data || []));
  }, []);

  useEffect(() => { load(); }, [officeFilter, from, to, categoryFilter]);

  const load = async () => {
    let q = supabase.from('office_daily_expenses').select('*')
      .gte('expense_date', from)
      .lte('expense_date', to)
      .order('expense_date', { ascending: false });
    if (officeFilter !== 'all') q = q.eq('office_id', officeFilter);
    if (categoryFilter !== 'all') q = q.eq('category', categoryFilter);
    const { data } = await q;
    setItems(data || []);
  };

  const officeMap = useMemo(() => {
    const m: Record<string, string> = {};
    offices.forEach(o => { m[o.id] = o.name; });
    return m;
  }, [offices]);

  const totals = useMemo(() => {
    let shipments = 0, office = 0, advances = 0;
    items.forEach(i => {
      const v = Number(i.amount || 0);
      if (i.category === 'shipments') shipments += v;
      else if (i.category === 'office') office += v;
      else if (i.category === 'advances') advances += v;
    });
    return { shipments, office, advances, all: shipments + office + advances };
  }, [items]);

  const save = async () => {
    if (!form.office_id) { toast.error('اختر المكتب'); return; }
    if (!form.amount) { toast.error('أدخل المبلغ'); return; }
    const { error } = await supabase.from('office_daily_expenses').insert({
      office_id: form.office_id,
      expense_date: form.expense_date,
      category: form.category,
      amount: Number(form.amount),
      notes: form.notes,
      created_by: user?.id || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('تم الحفظ');
    setOpen(false);
    setForm({ ...form, amount: '', notes: '' });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('حذف هذا السجل؟')) return;
    await supabase.from('office_daily_expenses').delete().eq('id', id);
    toast.success('تم الحذف');
    load();
  };

  const reportColumns = [
    { key: 'expense_date', label: 'التاريخ' },
    { key: 'office_name', label: 'المكتب', format: (_: any, r: any) => officeMap[r.office_id] || '-' },
    { key: 'category', label: 'التصنيف', format: (v: any) => CATEGORIES.find(c => c.key === v)?.label || v },
    { key: 'amount', label: 'المبلغ', format: (v: any) => `${Number(v).toLocaleString()} ج.م` },
    { key: 'notes', label: 'ملاحظة' },
  ];

  const meta = {
    title: 'مصاريف المكتب اليومية',
    subtitle: `الفترة: ${from} → ${to}${officeFilter !== 'all' ? ` | ${officeMap[officeFilter] || ''}` : ''}`,
    filtersText: `${categoryFilter === 'all' ? 'كل التصنيفات' : CATEGORIES.find(c => c.key === categoryFilter)?.label}`,
    summary: [
      { label: 'الإجمالي', value: `${totals.all.toLocaleString()} ج.م` },
      { label: 'شحنات', value: `${totals.shipments.toLocaleString()} ج.م` },
      { label: 'مكتب', value: `${totals.office.toLocaleString()} ج.م` },
      { label: 'سلف', value: `${totals.advances.toLocaleString()} ج.م` },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">مصاريف المكتب اليومية</h1>
        <div className="flex gap-2">
          <ReportButton meta={meta} columns={reportColumns} rows={items} hideWhatsapp />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 ml-1" />إضافة مصروف</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle>إضافة مصروف يومي</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>المكتب *</Label>
                  <Select value={form.office_id} onValueChange={v => setForm({ ...form, office_id: v })}>
                    <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="اختر المكتب" /></SelectTrigger>
                    <SelectContent>{offices.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>التاريخ</Label>
                  <Input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} className="bg-secondary border-border" />
                </div>
                <div>
                  <Label>التصنيف</Label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>المبلغ *</Label>
                  <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="bg-secondary border-border" />
                </div>
                <div>
                  <Label>ملاحظة</Label>
                  <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-secondary border-border" placeholder="تفاصيل المصروف..." />
                </div>
                <Button onClick={save} className="w-full">حفظ</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-3 flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">من</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40 bg-secondary border-border" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">إلى</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40 bg-secondary border-border" />
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
          <div className="space-y-1">
            <Label className="text-xs">التصنيف</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-44 bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل التصنيفات</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="bg-primary/10 border-primary/30"><CardContent className="p-3 flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <div><p className="text-xs text-muted-foreground">الإجمالي</p><p className="text-base font-bold text-primary">{totals.all.toLocaleString()} ج.م</p></div>
        </CardContent></Card>
        {CATEGORIES.map(c => {
          const Icon = c.icon;
          return (
            <Card key={c.key} className={c.color.split(' ').slice(1).join(' ')}><CardContent className="p-3 flex items-center gap-2">
              <Icon className={`h-5 w-5 ${c.color.split(' ')[0]}`} />
              <div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-base font-bold">{Number(totals[c.key as keyof typeof totals]).toLocaleString()} ج.م</p>
              </div>
            </CardContent></Card>
          );
        })}
      </div>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-base">السجلات ({items.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">المكتب</TableHead>
                  <TableHead className="text-right">التصنيف</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">ملاحظة</TableHead>
                  <TableHead className="text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا توجد مصاريف</TableCell></TableRow>
                ) : items.map(i => {
                  const cat = CATEGORIES.find(c => c.key === i.category);
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="text-xs">{i.expense_date}</TableCell>
                      <TableCell className="text-sm font-medium">{officeMap[i.office_id] || '-'}</TableCell>
                      <TableCell><span className={`text-xs px-2 py-1 rounded ${cat?.color || ''}`}>{cat?.label || i.category}</span></TableCell>
                      <TableCell className="font-bold">{Number(i.amount).toLocaleString()} ج.م</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{i.notes || '-'}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(i.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
