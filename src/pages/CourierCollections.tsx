import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Lock, Search, FileBarChart } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { logActivity } from '@/lib/activityLogger';
// Note: any order assigned to a courier can be closed regardless of its status
import { ReportButton } from '@/components/ReportButton';

export default function CourierCollections() {
  const { user, isOwner } = useAuth();
  const [couriers, setCouriers] = useState<any[]>([]);
  const [selectedCourier, setSelectedCourier] = useState('');
  const [statuses, setStatuses] = useState<any[]>([]);
  const [offices, setOffices] = useState<any[]>([]);
  const [commissionPerOrder, setCommissionPerOrder] = useState('');
  const [commissionStatuses, setCommissionStatuses] = useState<string[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bonuses, setBonuses] = useState<any[]>([]);
  const [bonusDialogOpen, setBonusDialogOpen] = useState(false);
  const [bonusType, setBonusType] = useState<'special' | 'office_commission'>('special');
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusReason, setBonusReason] = useState('');
  const [orderNotes, setOrderNotes] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  // Closure report (تقفيلة)
  const [closureDate, setClosureDate] = useState(new Date().toISOString().split('T')[0]);
  const [closedOrdersOnDate, setClosedOrdersOnDate] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'courier');
      if (roles && roles.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, commission_amount').in('id', roles.map(r => r.user_id));
        setCouriers(profiles || []);
      }
      const { data: sts } = await supabase.from('order_statuses').select('*').order('sort_order');
      setStatuses(sts || []);
      const { data: officeData } = await supabase.from('offices').select('id, name').order('name');
      setOffices(officeData || []);
    };
    load();
  }, []);

  // Auto-select commission-eligible statuses when statuses load
  const COMMISSION_STATUS_NAMES = ['تم التسليم', 'تسليم جزئي', 'رفض ودفع شحن', 'استلم ودفع نص الشحن'];
  useEffect(() => {
    if (statuses.length === 0) return;
    const autoIds = statuses.filter(s => COMMISSION_STATUS_NAMES.includes(s.name)).map(s => s.id);
    setCommissionStatuses(autoIds);
  }, [statuses]);

  // Auto-fill commission rate from courier profile
  useEffect(() => {
    if (!selectedCourier) return;
    const c = couriers.find(c => c.id === selectedCourier);
    const rate = Number(c?.commission_amount || 0);
    if (rate > 0) setCommissionPerOrder(String(rate));
  }, [selectedCourier, couriers]);

  useEffect(() => {
    if (selectedCourier) loadCourierData();
    else {
      setOrders([]);
      setBonuses([]);
      setSelectedOrders(new Set());
    }
  }, [selectedCourier]);

  const loadCourierData = async () => {
    const { data: orderData } = await supabase
      .from('orders')
      .select('*, order_statuses(name, color)')
      .eq('courier_id', selectedCourier)
      .order('created_at', { ascending: false });

    const visibleOrders = (orderData || []).filter((order: any) => !order.is_courier_closed);

    setOrders(visibleOrders);
    setSelectedOrders(new Set());
    const notes: Record<string, string> = {};
    visibleOrders.forEach((o: any) => { notes[o.id] = o.notes || ''; });
    setOrderNotes(notes);

    const { data: bonusData } = await supabase
      .from('courier_bonuses')
      .select('*')
      .eq('courier_id', selectedCourier)
      .order('created_at', { ascending: false });
    setBonuses(bonusData || []);
  };

  // Load closed orders for the selected courier on the selected date
  useEffect(() => {
    if (!selectedCourier) { setClosedOrdersOnDate([]); return; }
    (async () => {
      const dayStart = `${closureDate}T00:00:00`;
      const dayEnd = `${closureDate}T23:59:59.999`;
      // Use closed_at if present, fallback to updated_at — fixes "closed but doesn't show"
      const { data: byClosedAt } = await supabase
        .from('orders')
        .select('*, order_statuses(name, color), offices(name)')
        .eq('courier_id', selectedCourier)
        .eq('is_courier_closed', true)
        .gte('closed_at', dayStart)
        .lte('closed_at', dayEnd);
      const { data: byUpdatedAt } = await supabase
        .from('orders')
        .select('*, order_statuses(name, color), offices(name)')
        .eq('courier_id', selectedCourier)
        .eq('is_courier_closed', true)
        .is('closed_at', null)
        .gte('updated_at', dayStart)
        .lte('updated_at', dayEnd);
      const merged = [...(byClosedAt || []), ...(byUpdatedAt || [])];
      const seen = new Set<string>();
      const dedup = merged.filter(o => seen.has(o.id) ? false : (seen.add(o.id), true));
      setClosedOrdersOnDate(dedup);
    })();
  }, [selectedCourier, closureDate]);

  const deliveredStatus = statuses.find(s => s.name === 'تم التسليم');
  const rejectWithShipStatus = statuses.find(s => s.name === 'رفض ودفع شحن');
  const halfShipStatus = statuses.find(s => s.name === 'استلم ودفع نص الشحن');
  const partialDeliveryStatus = statuses.find(s => s.name === 'تسليم جزئي');

  const getCollectedAmount = (order: any) => {
    if (order.status_id === deliveredStatus?.id) return Number(order.price) + Number(order.delivery_price);
    if (order.status_id === partialDeliveryStatus?.id) return Number(order.partial_amount || 0);
    if (order.status_id === rejectWithShipStatus?.id || order.status_id === halfShipStatus?.id) return Number(order.shipping_paid || 0);
    return 0;
  };

  const totalCollection = orders.reduce((sum, o) => sum + getCollectedAmount(o), 0);

  const rate = parseFloat(commissionPerOrder) || 0;
  const eligibleOrders = orders.filter(o => commissionStatuses.includes(o.status_id));
  const commissionTotal = eligibleOrders.length * rate;

  const officeCommissionBonuses = bonuses.filter(b => b.reason?.startsWith('__office_commission__'));
  const totalOfficeCommission = officeCommissionBonuses.reduce((sum, b) => sum + Number(b.amount), 0);
  const regularBonuses = bonuses.filter(b => !b.reason?.startsWith('__office_commission__'));
  const totalRegularBonuses = regularBonuses.reduce((sum, b) => sum + Number(b.amount), 0);

  const netDue = totalCollection + totalOfficeCommission - commissionTotal - totalRegularBonuses;

  const toggleStatus = (statusId: string) => {
    setCommissionStatuses(prev => prev.includes(statusId) ? prev.filter(s => s !== statusId) : [...prev, statusId]);
  };

  const toggleStatusFilter = (statusId: string) => {
    setStatusFilter(prev => prev.includes(statusId) ? prev.filter(s => s !== statusId) : [...prev, statusId]);
  };

  const getOfficeName = (officeId: string) => offices.find(o => o.id === officeId)?.name || '-';

  // Filter orders by status and search
  const filteredOrders = orders.filter(o => {
    const matchesStatus = statusFilter.length === 0 || statusFilter.includes(o.status_id);
    if (!matchesStatus) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      (o.barcode || '').toLowerCase().includes(q) ||
      (o.customer_name || '').toLowerCase().includes(q) ||
      (o.customer_phone || '').toLowerCase().includes(q) ||
      (o.customer_code || '').toLowerCase().includes(q)
    );
  });

  const toggleSelectOrder = (orderId: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAllOrders = () => {
    if (filteredOrders.length > 0 && selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set());
      return;
    }
    setSelectedOrders(new Set(filteredOrders.map(o => o.id)));
  };

  const closeSelectedOrders = async () => {
    if (selectedOrders.size === 0) { toast.error('اختر أوردرات للتقفيل'); return; }
    const ids = Array.from(selectedOrders);
    if (!confirm(`هل تريد تقفيل ${ids.length} أوردر؟`)) return;

    const { error } = await supabase.from('orders').update({ is_courier_closed: true, closed_at: new Date().toISOString() }).in('id', ids);
    if (error) { toast.error(error.message); return; }

    logActivity('تقفيل أوردرات من تحصيلات المندوب', { courier_id: selectedCourier, count: ids.length });
    toast.success(`تم تقفيل ${ids.length} أوردر`);
    setSelectedOrders(new Set());
    loadCourierData();
  };

  const addBonus = async () => {
    if (!bonusAmount || !selectedCourier) return;
    const { error } = await supabase.from('courier_bonuses').insert({
      courier_id: selectedCourier,
      amount: parseFloat(bonusAmount),
      reason: bonusType === 'office_commission' ? `__office_commission__${bonusReason ? ':' + bonusReason : ''}` : (bonusReason || 'عمولة للمندوب'),
      created_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    logActivity('إضافة عمولة لمندوب', { courier_id: selectedCourier, type: bonusType, amount: parseFloat(bonusAmount) });
    toast.success(bonusType === 'office_commission' ? 'تم إضافة عمولة المكتب' : 'تم إضافة العمولة');
    setBonusDialogOpen(false);
    setBonusAmount('');
    setBonusReason('');
    loadCourierData();
  };

  const deleteBonus = async (id: string) => {
    if (!confirm('حذف هذه العمولة؟')) return;
    await supabase.from('courier_bonuses').delete().eq('id', id);
    logActivity('حذف عمولة مندوب', { bonus_id: id, courier_id: selectedCourier });
    toast.success('تم الحذف');
    loadCourierData();
  };

  const updateOrderNotes = async (orderId: string, notes: string) => {
    setOrderNotes(prev => ({ ...prev, [orderId]: notes }));
  };

  const saveOrderNotes = async (orderId: string) => {
    const notes = orderNotes[orderId] || '';
    const { error } = await supabase.from('orders').update({ notes }).eq('id', orderId);
    if (error) { toast.error('فشل حفظ الملاحظة'); return; }
    toast.success('تم حفظ الملاحظة');
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">تحصيلات المندوبين</h1>

      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="space-y-1">
          <Label className="text-xs">المندوب</Label>
          <Select value={selectedCourier} onValueChange={setSelectedCourier}>
            <SelectTrigger className="w-48 bg-secondary border-border"><SelectValue placeholder="اختر مندوب" /></SelectTrigger>
            <SelectContent>{couriers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {selectedCourier && orders.length > 0 && (() => {
          const courier = couriers.find(c => c.id === selectedCourier);
          const duesColumns = [
            { key: 'barcode', label: 'الباركود' },
            { key: 'customer_code', label: 'الكود' },
            { key: 'customer_name', label: 'العميل' },
            { key: 'customer_phone', label: 'الهاتف' },
            { key: 'address', label: 'العنوان' },
            { key: 'office_name', label: 'المكتب', format: (_: any, r: any) => getOfficeName(r.office_id) },
            { key: 'price', label: 'سعر المنتج', format: (v: any) => `${Number(v || 0)} ج.م` },
            { key: 'delivery_price', label: 'الشحن', format: (v: any) => `${Number(v || 0)} ج.م` },
            { key: 'status', label: 'الحالة', format: (_: any, r: any) => r.order_statuses?.name || '-' },
            { key: 'collected', label: 'المحصل', format: (_: any, r: any) => `${getCollectedAmount(r)} ج.م` },
            { key: 'created_at', label: 'تاريخ الأوردر', format: (v: any) => v ? new Date(v).toLocaleDateString('ar-EG') : '-' },
          ];
          const duesMeta = {
            title: `كشف مستحقات المندوب — ${courier?.full_name || ''}`,
            subtitle: `تقرير المتبقي على المندوب (بدون تقفيل) | تم الإصدار: ${new Date().toLocaleString('ar-EG')}`,
            filtersText: `المندوب: ${courier?.full_name || '-'}`,
            summary: [
              { label: '📦 عدد الأوردرات المتبقية', value: orders.length },
              { label: '💰 إجمالي التحصيل', value: `${totalCollection.toLocaleString()} ج.م` },
              { label: '🎯 العمولة', value: `${commissionTotal.toLocaleString()} ج.م` },
              { label: '🏢 عمولة المكتب', value: `${totalOfficeCommission.toLocaleString()} ج.م` },
              { label: '✅ صافي المستحق', value: `${netDue.toLocaleString()} ج.م` },
            ],
          };
          return (
            <ReportButton meta={duesMeta} columns={duesColumns} rows={orders}
              whatsappPhone={courier?.phone} label="تقرير المستحقات (بدون تقفيل)" />
          );
        })()}
      </div>

      {selectedCourier && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card border-border"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">إجمالي التحصيل</p><p className="text-lg font-bold text-emerald-500">{totalCollection} ج.م</p></CardContent></Card>
            <Card className="bg-card border-border"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">عمولة مكتب</p><p className="text-lg font-bold text-amber-500">{totalOfficeCommission} ج.م</p></CardContent></Card>
            <Card className="bg-card border-border"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">العمولة</p><p className="text-lg font-bold text-destructive">{commissionTotal} ج.م</p></CardContent></Card>
            <Card className="bg-card border-border"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">صافي المستحق</p><p className="text-lg font-bold text-primary">{netDue} ج.م</p></CardContent></Card>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">حاسبة العمولة</CardTitle>
              <div className="flex gap-2 flex-wrap">
                <Dialog open={bonusDialogOpen} onOpenChange={v => { setBonusDialogOpen(v); if (!v) setBonusType('special'); }}>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => { setBonusType('special'); setBonusDialogOpen(true); }}><Plus className="h-4 w-4 ml-1" />عمولة للمندوب</Button>
                    <Button size="sm" variant="outline" onClick={() => { setBonusType('office_commission'); setBonusDialogOpen(true); }}><Plus className="h-4 w-4 ml-1" />عمولة مكتب</Button>
                  </div>
                  <DialogContent className="bg-card border-border">
                    <DialogHeader><DialogTitle>{bonusType === 'office_commission' ? 'إضافة عمولة مكتب' : 'إضافة عمولة للمندوب'}</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div><Label>المبلغ</Label><Input type="number" value={bonusAmount} onChange={e => setBonusAmount(e.target.value)} className="bg-secondary border-border" /></div>
                      <div><Label>{bonusType === 'office_commission' ? 'ملاحظة / السبب' : 'السبب'}</Label><Input value={bonusReason} onChange={e => setBonusReason(e.target.value)} className="bg-secondary border-border" placeholder={bonusType === 'office_commission' ? 'سبب عمولة المكتب...' : 'مشوار خاص...'} /></div>
                      <Button onClick={addBonus} className="w-full">حفظ</Button>
                    </div>
                  </DialogContent>
                </Dialog>
                {selectedOrders.size > 0 && (
                  <Button size="sm" variant="destructive" onClick={closeSelectedOrders}><Lock className="h-4 w-4 ml-1" />تقفيل ({selectedOrders.size})</Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  ✅ العمولة بتتحسب أوتوماتيك على الحالات دي:
                </p>
                <div className="flex flex-wrap gap-2">
                  {statuses.filter(s => COMMISSION_STATUS_NAMES.includes(s.name)).map(s => (
                    <Badge key={s.id} style={{ backgroundColor: s.color }} className="text-white">
                      ✓ {s.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">عمولة المندوب لكل أوردر (ج.م) — من ملف المندوب</Label>
                  <Input type="number" value={commissionPerOrder} onChange={e => setCommissionPerOrder(e.target.value)}
                    className="w-40 bg-secondary border-border" placeholder="30"
                    onFocus={e => { if (e.target.value === '0') setCommissionPerOrder(''); }} />
                </div>
                <p className="text-sm">= <span className="font-bold text-primary">{commissionTotal}</span> ج.م ({eligibleOrders.length} أوردر مؤهل)</p>
              </div>
            </CardContent>
          </Card>

          {bonuses.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-base">العمولات</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow className="border-border">
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">السبب</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {bonuses.map(b => (
                      <TableRow key={b.id} className="border-border">
                        <TableCell className="text-sm">{b.reason?.startsWith('__office_commission__') ? 'عمولة مكتب' : 'عمولة للمندوب'}</TableCell>
                        <TableCell className="font-bold">{b.amount} ج.م</TableCell>
                        <TableCell>{b.reason?.startsWith('__office_commission__') ? (b.reason.split(':')[1] || '-') : (b.reason || '-')}</TableCell>
                        <TableCell>{new Date(b.created_at).toLocaleDateString('ar-EG')}</TableCell>
                        <TableCell>
                          {isOwner && (
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteBonus(b.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* === تقفيلة المندوب (Closure Report) === */}
          {(() => {
            const courier = couriers.find(c => c.id === selectedCourier);
            const commissionRate = parseFloat(commissionPerOrder) || Number(courier?.commission_amount || 0);
            const COMMISSION_NAMES = COMMISSION_STATUS_NAMES;
            const getCollected = (o: any) => {
              const sn = o.order_statuses?.name;
              if (sn === 'تم التسليم') return Number(o.price || 0) + Number(o.delivery_price || 0);
              if (sn === 'تسليم جزئي') return Number(o.partial_amount || 0);
              if (sn === 'رفض ودفع شحن' || sn === 'استلم ودفع نص الشحن') return Number(o.shipping_paid || 0);
              return 0;
            };
            const closedCount = closedOrdersOnDate.length;
            const closedCollected = closedOrdersOnDate.reduce((s, o) => s + getCollected(o), 0);
            const closedCommissionable = closedOrdersOnDate.filter(o => COMMISSION_NAMES.includes(o.order_statuses?.name)).length;
            const closedCommission = closedCommissionable * commissionRate;
            const closedNet = closedCollected - closedCommission;
            const remaining = orders.length;
            const remainingValue = orders.reduce((s, o) => s + getCollected(o), 0);
            const nowStr = new Date().toLocaleString('ar-EG');

            const closureColumns = [
              { key: 'barcode', label: 'الباركود' },
              { key: 'customer_name', label: 'العميل' },
              { key: 'customer_phone', label: 'الهاتف' },
              { key: 'address', label: 'العنوان' },
              { key: 'office_name', label: 'المكتب', format: (_: any, r: any) => r.offices?.name || '-' },
              { key: 'price', label: 'سعر المنتج', format: (v: any) => `${Number(v || 0)} ج.م` },
              { key: 'delivery_price', label: 'الشحن', format: (v: any) => `${Number(v || 0)} ج.م` },
              { key: 'status', label: 'الحالة', format: (_: any, r: any) => r.order_statuses?.name || '-' },
              { key: 'collected', label: 'المحصل', format: (_: any, r: any) => `${getCollected(r)} ج.م` },
              { key: 'commission', label: 'عمولة المندوب', format: (_: any, r: any) =>
                COMMISSION_NAMES.includes(r.order_statuses?.name) ? `${commissionRate} ج.م` : '-'
              },
              { key: 'closed_time', label: 'وقت التقفيل', format: (_: any, r: any) =>
                new Date(r.closed_at || r.updated_at).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' })
              },
            ];

            const closureMeta = {
              title: `تقفيلة المندوب — ${courier?.full_name || ''}`,
              subtitle: `يوم التقفيل: ${closureDate} | المقفل: ${closedCount} | تم الإصدار: ${nowStr}`,
              filtersText: `المندوب: ${courier?.full_name || '-'} | اليوم: ${closureDate}`,
              summary: [
                { label: '📦 أوردرات مقفلة اليوم', value: closedCount },
                { label: '💰 إجمالي المحصل', value: `${closedCollected.toLocaleString()} ج.م` },
                { label: `🎯 عمولة المندوب (${commissionRate} لكل أوردر)`, value: `${closedCommission.toLocaleString()} ج.م` },
                { label: '✅ صافي المستحق للشركة', value: `${closedNet.toLocaleString()} ج.م` },
                { label: '⏳ متبقي على المندوب (لم يتقفل)', value: `${remaining} أوردر` },
                { label: '💵 قيمة المتبقي', value: `${remainingValue.toLocaleString()} ج.م` },
                { label: '🕒 تاريخ ووقت إصدار التقرير', value: nowStr },
              ],
            };

            return (
              <Card className="bg-card border-border border-2 border-primary/30">
                <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileBarChart className="h-5 w-5 text-primary" />
                    تقفيلة المندوب — تقرير حسب اليوم
                  </CardTitle>
                  <div className="flex items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">يوم التقفيل</Label>
                      <Input type="date" value={closureDate} onChange={e => setClosureDate(e.target.value)}
                        className="w-44 bg-secondary border-border h-8" />
                    </div>
                    {closedOrdersOnDate.length > 0 && (
                      <ReportButton meta={closureMeta} columns={closureColumns} rows={closedOrdersOnDate}
                        whatsappPhone={courier?.phone} label="طباعة / تصدير" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 text-center">
                      <p className="text-xs text-emerald-700">مقفل اليوم</p>
                      <p className="text-xl font-bold text-emerald-700">{closedCount}</p>
                    </div>
                    <div className="rounded-md bg-primary/10 border border-primary/30 p-2 text-center">
                      <p className="text-xs text-primary">المحصل</p>
                      <p className="text-base font-bold text-primary">{closedCollected.toLocaleString()} ج.م</p>
                    </div>
                    <div className="rounded-md bg-sky-50 border border-sky-200 p-2 text-center">
                      <p className="text-xs text-sky-700">عمولة المندوب</p>
                      <p className="text-base font-bold text-sky-700">{closedCommission.toLocaleString()} ج.م</p>
                    </div>
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-center">
                      <p className="text-xs text-amber-700">صافي للشركة</p>
                      <p className="text-base font-bold text-amber-700">{closedNet.toLocaleString()} ج.م</p>
                    </div>
                  </div>
                  <div className="rounded-md bg-rose-50 border border-rose-200 p-2 text-sm text-rose-700 flex items-center justify-between flex-wrap gap-1">
                    <span>متبقي على المندوب: <b className="text-base">{remaining}</b> أوردر</span>
                    <span>قيمتهم: <b className="text-base">{remainingValue.toLocaleString()}</b> ج.م</span>
                  </div>
                  {closedOrdersOnDate.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-3">لا توجد أوردرات مقفلة في {closureDate}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow className="border-border">
                          <TableHead className="text-right">#</TableHead>
                          <TableHead className="text-right">الباركود</TableHead>
                          <TableHead className="text-right">العميل</TableHead>
                          <TableHead className="text-right">المكتب</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">المحصل</TableHead>
                          <TableHead className="text-right">عمولة</TableHead>
                          <TableHead className="text-right">وقت التقفيل</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {closedOrdersOnDate.map((o, i) => {
                            const sn = o.order_statuses?.name;
                            const isComm = COMMISSION_NAMES.includes(sn);
                            return (
                              <TableRow key={o.id} className="border-border">
                                <TableCell>{i + 1}</TableCell>
                                <TableCell className="font-mono text-xs">{o.barcode || '-'}</TableCell>
                                <TableCell className="text-sm">{o.customer_name}</TableCell>
                                <TableCell className="text-xs">{o.offices?.name || '-'}</TableCell>
                                <TableCell><Badge style={{ backgroundColor: o.order_statuses?.color }} className="text-xs text-white">{sn || '-'}</Badge></TableCell>
                                <TableCell className="font-bold text-emerald-600">{getCollected(o)} ج.م</TableCell>
                                <TableCell className="font-bold text-sky-600">{isComm ? `${commissionRate} ج.م` : '-'}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{new Date(o.closed_at || o.updated_at).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Search and Status Filters */}
          <Card className="bg-card border-border">
            <CardContent className="p-3 space-y-3">
              <div className="relative">
                <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="بحث بالباركود أو اسم العميل أو رقم الهاتف..."
                  className="bg-secondary border-border pr-8"
                />
              </div>
              <div>
                <p className="text-sm font-semibold mb-2">فلتر حسب الحالة:</p>
                <div className="flex flex-wrap gap-2">
                  {statuses.map(s => (
                    <label key={s.id} className="flex items-center gap-1 cursor-pointer text-sm">
                      <Checkbox checked={statusFilter.includes(s.id)} onCheckedChange={() => toggleStatusFilter(s.id)} />
                      <Badge style={{ backgroundColor: s.color }} className="text-xs">{s.name}</Badge>
                    </label>
                  ))}
                  <Button size="sm" variant="outline" className="text-xs h-6" onClick={() => {
                    setStatusFilter(statuses.map(s => s.id));
                  }}>الكل</Button>
                  {statusFilter.length > 0 && (
                    <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => setStatusFilter([])}>
                      إلغاء الفلتر
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base">أوردرات المندوب ({filteredOrders.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-right w-10"><Checkbox checked={filteredOrders.length > 0 && selectedOrders.size === filteredOrders.length} onCheckedChange={toggleSelectAllOrders} /></TableHead>
                      <TableHead className="text-right">الكود</TableHead>
                      <TableHead className="text-right">الباركود</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">العميل</TableHead>
                      <TableHead className="text-right">الهاتف</TableHead>
                      <TableHead className="text-right">الراسل</TableHead>
                      <TableHead className="text-right">العنوان</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">التحصيل</TableHead>
                      <TableHead className="text-right">تعليق</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.length === 0 ? (
                      <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-4">لا توجد أوردرات</TableCell></TableRow>
                    ) : filteredOrders.map(o => {
                      const collected = getCollectedAmount(o);
                      return (
                        <TableRow key={o.id} className="border-border">
                          <TableCell><Checkbox checked={selectedOrders.has(o.id)} onCheckedChange={() => toggleSelectOrder(o.id)} /></TableCell>
                          <TableCell className="font-mono text-xs">{o.customer_code || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">{o.barcode || '-'}</TableCell>
                          <TableCell className="text-xs">{o.created_at ? new Date(o.created_at).toLocaleDateString('ar-EG') : '-'}</TableCell>
                          <TableCell className="text-sm">{o.customer_name || '-'}</TableCell>
                          <TableCell className="text-xs">{o.customer_phone || '-'}</TableCell>
                          <TableCell className="text-xs">{getOfficeName(o.office_id)}</TableCell>
                          <TableCell className="text-xs">{o.address || '-'}</TableCell>
                          <TableCell className="font-bold">{Number(o.price) + Number(o.delivery_price)} ج.م</TableCell>
                          <TableCell>
                            <Badge style={{ backgroundColor: o.order_statuses?.color }} className="text-xs">
                              {o.order_statuses?.name || '-'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-bold text-primary">{collected > 0 ? `${collected} ج.م` : '-'}</TableCell>
                          <TableCell>
                            <Input
                              value={orderNotes[o.id] || ''}
                              onChange={(e) => updateOrderNotes(o.id, e.target.value)}
                              onBlur={() => saveOrderNotes(o.id)}
                              className="bg-secondary border-border h-7 w-32 text-xs"
                              placeholder="تعليق..."
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
