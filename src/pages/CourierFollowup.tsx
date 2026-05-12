import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MessageCircle, Phone, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { logActivity } from '@/lib/activityLogger';

interface Courier { id: string; full_name: string; phone?: string; }
interface Order {
  id: string; barcode?: string; tracking_id?: string;
  customer_name?: string; customer_phone?: string; address?: string;
  product_name?: string; price?: number; quantity?: number;
  delivery_price?: number; office_id?: string;
  status_id?: string; courier_id?: string; notes?: string;
  is_closed?: boolean; is_courier_closed?: boolean;
}
interface Office { id: string; name: string; owner_name?: string; }

const DEFAULT_TEMPLATE = `السلام عليكم {customer_name} 🌷
معاك متابعة شركة The Pilito بخصوص أوردر رقم {barcode}
المنتج: {product_name}
سعر المنتج: {price} جنيه
سعر الشحن: {shipping} جنيه
الإجمالي المطلوب: {total} جنيه
العنوان: {address}
المكتب: {office}
المندوب المسؤول: {courier} - رقمه: {courier_phone}
يرجى التواصل مع المندوب مباشرة لتأكيد الاستلام. شكراً 🙏`;

function normalizeEgPhone(raw?: string): string | null {
  if (!raw) return null;
  let p = raw.replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0')) p = '20' + p.slice(1);
  if (!p.startsWith('20') && p.length === 10) p = '20' + p;
  if (p.length < 10) return null;
  return p;
}

function buildMessage(template: string, order: Order, statusName: string, courierName: string, courierPhone: string, officeName: string) {
  const repl = (s: string, k: string, v: string) => s.split(k).join(v);
  const price = Number(order.price || 0);
  const shipping = Number(order.delivery_price || 0);
  let r = template;
  r = repl(r, '{customer_name}', order.customer_name || 'حضرتك');
  r = repl(r, '{barcode}', order.barcode || order.tracking_id || '');
  r = repl(r, '{product_name}', order.product_name || '');
  r = repl(r, '{price}', String(price));
  r = repl(r, '{shipping}', String(shipping));
  r = repl(r, '{total}', String(price + shipping));
  r = repl(r, '{address}', order.address || '');
  r = repl(r, '{office}', officeName || '');
  r = repl(r, '{status}', statusName || '');
  r = repl(r, '{courier}', courierName || '');
  r = repl(r, '{courier_phone}', courierPhone || '');
  r = repl(r, '{notes}', order.notes || '');
  return r;
}

export default function CourierFollowup() {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [selectedCourier, setSelectedCourier] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [template, setTemplate] = useState<string>(() => {
    return localStorage.getItem('followup_whatsapp_template') || DEFAULT_TEMPLATE;
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [previewText, setPreviewText] = useState('');
  const [followupNotes, setFollowupNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('followup_notes') || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    const load = async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'courier');
      if (roles && roles.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, phone').in('id', roles.map(r => r.user_id));
        setCouriers((profiles || []) as Courier[]);
      }
      const { data: sts } = await supabase.from('order_statuses').select('*').order('sort_order');
      setStatuses(sts || []);
      const { data: offs } = await supabase.from('offices').select('id, name, owner_name');
      setOffices((offs || []) as Office[]);
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedCourier) { setOrders([]); return; }
    loadOrders();
    const channel = supabase
      .channel(`followup_orders_${selectedCourier}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `courier_id=eq.${selectedCourier}` }, () => loadOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedCourier]);

  const loadOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('courier_id', selectedCourier)
      .eq('is_courier_closed', false)
      .order('courier_assigned_at', { ascending: false })
      .limit(1000);
    setOrders((data || []) as Order[]);
  };

  const statusName = (id?: string) => statuses.find(s => s.id === id)?.name || '—';
  const statusColor = (id?: string) => statuses.find(s => s.id === id)?.color || '#6b7280';
  const officeName = (id?: string) => offices.find(o => o.id === id)?.name || '—';
  const officeOwner = (id?: string) => offices.find(o => o.id === id)?.owner_name || '';
  const courierName = useMemo(() => couriers.find(c => c.id === selectedCourier)?.full_name || '', [couriers, selectedCourier]);
  const courierPhone = useMemo(() => couriers.find(c => c.id === selectedCourier)?.phone || '', [couriers, selectedCourier]);

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (statusFilter !== 'all' && o.status_id !== statusFilter) return false;
      if (!search.trim()) return true;
      const s = search.trim().toLowerCase();
      return (
        (o.barcode || '').toLowerCase().includes(s) ||
        (o.customer_name || '').toLowerCase().includes(s) ||
        (o.customer_phone || '').includes(s) ||
        (o.address || '').toLowerCase().includes(s)
      );
    });
  }, [orders, search, statusFilter]);

  const saveTemplate = () => {
    localStorage.setItem('followup_whatsapp_template', template);
    toast.success('تم حفظ قالب الرسالة');
  };

  const openWhatsApp = (order: Order) => {
    const phone = normalizeEgPhone(order.customer_phone);
    if (!phone) {
      toast.error('رقم العميل غير صالح');
      return;
    }
    const msg = buildMessage(template, order, statusName(order.status_id), courierName, courierPhone, officeName(order.office_id));
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const openPreview = (order: Order) => {
    setActiveOrder(order);
    setPreviewText(buildMessage(template, order, statusName(order.status_id), courierName, courierPhone, officeName(order.office_id)));
    setPreviewOpen(true);
  };

  const sendPreview = () => {
    if (!activeOrder) return;
    const phone = normalizeEgPhone(activeOrder.customer_phone);
    if (!phone) { toast.error('رقم العميل غير صالح'); return; }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(previewText)}`;
    window.open(url, '_blank');
    setPreviewOpen(false);
  };

  const updateFollowupNote = (orderId: string, note: string) => {
    const next = { ...followupNotes, [orderId]: note };
    setFollowupNotes(next);
    localStorage.setItem('followup_notes', JSON.stringify(next));
  };

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            متابعة المندوبين والتواصل مع العملاء عبر واتساب
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>المندوب</Label>
              <Select value={selectedCourier} onValueChange={setSelectedCourier}>
                <SelectTrigger><SelectValue placeholder="اختر المندوب" /></SelectTrigger>
                <SelectContent>
                  {couriers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الحالة</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {statuses.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>بحث</Label>
              <div className="relative">
                <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="باركود / اسم / تليفون / عنوان" className="pr-8" />
              </div>
            </div>
          </div>

          <details className="rounded-md border p-3">
            <summary className="cursor-pointer font-medium">قالب رسالة الواتساب (متغيرات: {'{customer_name} {barcode} {product_name} {price} {address} {status} {courier} {courier_phone} {notes}'})</summary>
            <div className="mt-3 space-y-2">
              <Textarea value={template} onChange={e => setTemplate(e.target.value)} rows={6} />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveTemplate}>حفظ القالب</Button>
                <Button size="sm" variant="outline" onClick={() => setTemplate(DEFAULT_TEMPLATE)}>استرجاع الافتراضي</Button>
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      {selectedCourier && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              أوردرات {courierName} ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الباركود</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>التليفون</TableHead>
                  <TableHead>العنوان</TableHead>
                  <TableHead>المنتج</TableHead>
                  <TableHead>السعر</TableHead>
                  <TableHead>الشحن</TableHead>
                  <TableHead>الإجمالي</TableHead>
                  <TableHead>المكتب</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>ملاحظة المتابعة</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-6">لا توجد أوردرات</TableCell></TableRow>
                ) : filtered.map(o => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.barcode}</TableCell>
                    <TableCell className="font-medium">{o.customer_name}</TableCell>
                    <TableCell className="font-mono" dir="ltr">{o.customer_phone}</TableCell>
                    <TableCell className="max-w-[220px] whitespace-normal">{o.address}</TableCell>
                    <TableCell>{o.product_name}</TableCell>
                    <TableCell>{Number(o.price || 0)} ج</TableCell>
                    <TableCell>{Number(o.delivery_price || 0)} ج</TableCell>
                    <TableCell className="font-semibold">{Number(o.price || 0) + Number(o.delivery_price || 0)} ج</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{officeName(o.office_id)}</div>
                        {officeOwner(o.office_id) && <div className="text-xs text-muted-foreground">{officeOwner(o.office_id)}</div>}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[160px]">
                      <Select
                        value={o.status_id || ''}
                        onValueChange={async (val) => {
                          const oldName = statusName(o.status_id);
                          const newName = statuses.find(s => s.id === val)?.name || '';
                          const { error } = await supabase.from('orders').update({ status_id: val }).eq('id', o.id);
                          if (error) { toast.error('فشل تحديث الحالة'); return; }
                          await logActivity('order_status_changed', { order_id: o.id, barcode: o.barcode, from: oldName, to: newName, courier_id: selectedCourier });
                          toast.success(`تم تغيير الحالة إلى: ${newName}`);
                          setOrders(prev => prev.map(x => x.id === o.id ? { ...x, status_id: val } : x));
                        }}
                      >
                        <SelectTrigger className="h-8" style={{ borderColor: statusColor(o.status_id) }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statuses.map(s => (
                            <SelectItem key={s.id} value={s.id}>
                              <span className="inline-flex items-center gap-2">
                                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                                {s.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      <Input
                        value={followupNotes[o.id] || ''}
                        onChange={e => updateFollowupNote(o.id, e.target.value)}
                        placeholder="مثال: لا يرد، مغلق..."
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700 text-white" onClick={() => openWhatsApp(o)}>
                          <Send className="h-3 w-3 ml-1" /> واتساب
                        </Button>
                        <Button size="sm" variant="outline" className="h-8" onClick={() => openPreview(o)}>
                          معاينة
                        </Button>
                        {o.customer_phone && (
                          <Button size="sm" variant="outline" className="h-8" asChild>
                            <a href={`tel:${o.customer_phone}`}><Phone className="h-3 w-3" /></a>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>معاينة وتعديل الرسالة قبل الإرسال</DialogTitle>
          </DialogHeader>
          <Textarea value={previewText} onChange={e => setPreviewText(e.target.value)} rows={10} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>إلغاء</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={sendPreview}>
              <Send className="h-4 w-4 ml-1" /> فتح واتساب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
