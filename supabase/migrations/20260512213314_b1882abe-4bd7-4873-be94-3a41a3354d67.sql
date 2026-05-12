
-- ==================== ENUMS ====================
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'courier', 'office');

-- ==================== HELPER FUNCTIONS ====================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ==================== PROFILES ====================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  login_code TEXT UNIQUE,
  office_id UUID,
  commission_amount NUMERIC DEFAULT 0,
  salary NUMERIC DEFAULT 0,
  coverage_areas TEXT[],
  can_add_orders BOOLEAN DEFAULT false,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== USER_ROLES ====================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_owner_or_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','admin'))
$$;

-- ==================== USER_PERMISSIONS ====================
CREATE TABLE public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  permission TEXT NOT NULL DEFAULT 'view',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, section)
);
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- ==================== APP_SETTINGS ====================
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- ==================== OFFICES ====================
CREATE TABLE public.offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_name TEXT,
  phone TEXT,
  address TEXT,
  office_commission NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER offices_updated BEFORE UPDATE ON public.offices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles ADD CONSTRAINT profiles_office_fk FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE SET NULL;

-- ==================== DELIVERY_PRICES ====================
CREATE TABLE public.delivery_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  governorate TEXT NOT NULL,
  area TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_prices ENABLE ROW LEVEL SECURITY;

-- ==================== PRODUCTS ====================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  price NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== COMPANIES ====================
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_name TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== ORDER_STATUSES ====================
CREATE TABLE public.order_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#888888',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_statuses ENABLE ROW LEVEL SECURITY;

INSERT INTO public.order_statuses (name, color, sort_order) VALUES
  ('جديد', '#3b82f6', 1),
  ('قيد التوصيل', '#f59e0b', 2),
  ('تم التسليم', '#10b981', 3),
  ('مرتجع', '#ef4444', 4),
  ('مؤجل', '#8b5cf6', 5);

-- ==================== ORDERS ====================
CREATE SEQUENCE IF NOT EXISTS public.orders_barcode_seq START 100000;

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT UNIQUE,
  tracking_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_code TEXT,
  address TEXT,
  governorate TEXT,
  street TEXT,
  product_name TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  color TEXT,
  size TEXT,
  quantity INTEGER DEFAULT 1,
  price NUMERIC DEFAULT 0,
  delivery_price NUMERIC DEFAULT 0,
  partial_amount NUMERIC DEFAULT 0,
  notes TEXT,
  priority TEXT DEFAULT 'normal',
  status_id UUID REFERENCES public.order_statuses(id) ON DELETE SET NULL,
  office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  courier_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  is_closed BOOLEAN DEFAULT false,
  is_courier_closed BOOLEAN DEFAULT false,
  is_settled BOOLEAN DEFAULT false,
  shipping_paid BOOLEAN DEFAULT false,
  returned_to_sender BOOLEAN DEFAULT false,
  returned_to_sender_at TIMESTAMPTZ,
  returned_to_sender_by UUID REFERENCES auth.users(id),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id),
  last_modified_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.generate_order_barcode()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.barcode IS NULL OR NEW.barcode = '' THEN
    NEW.barcode := nextval('public.orders_barcode_seq')::TEXT;
  END IF;
  IF NEW.tracking_id IS NULL OR NEW.tracking_id = '' THEN
    NEW.tracking_id := NEW.barcode;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER orders_barcode BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.generate_order_barcode();

CREATE INDEX idx_orders_office ON public.orders(office_id);
CREATE INDEX idx_orders_courier ON public.orders(courier_id);
CREATE INDEX idx_orders_status ON public.orders(status_id);
CREATE INDEX idx_orders_closed ON public.orders(is_closed);

-- ==================== ORDER_NOTES ====================
CREATE TABLE public.order_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;

-- ==================== DIARIES ====================
CREATE TABLE public.diaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID REFERENCES public.offices(id) ON DELETE CASCADE,
  diary_date DATE DEFAULT CURRENT_DATE,
  title TEXT,
  is_closed BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.diaries ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER diaries_updated BEFORE UPDATE ON public.diaries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.diary_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diary_id UUID NOT NULL REFERENCES public.diaries(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status_id UUID REFERENCES public.order_statuses(id),
  partial_amount NUMERIC DEFAULT 0,
  n_column TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.diary_orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER diary_orders_updated BEFORE UPDATE ON public.diary_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== COURIER_COLLECTIONS ====================
CREATE TABLE public.courier_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  collection_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  is_settled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.courier_collections ENABLE ROW LEVEL SECURITY;

-- ==================== COURIER_BONUSES ====================
CREATE TABLE public.courier_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  bonus_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.courier_bonuses ENABLE ROW LEVEL SECURITY;

-- ==================== COURIER_LOCATIONS ====================
CREATE TABLE public.courier_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  accuracy NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.courier_locations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_courier_loc ON public.courier_locations(courier_id, created_at DESC);

-- ==================== OFFICE_PAYMENTS ====================
CREATE TABLE public.office_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.office_payments ENABLE ROW LEVEL SECURITY;

-- ==================== OFFICE_DAILY_CLOSINGS ====================
CREATE TABLE public.office_daily_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  closing_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_collected NUMERIC DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(office_id, closing_date)
);
ALTER TABLE public.office_daily_closings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER odc_updated BEFORE UPDATE ON public.office_daily_closings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== OFFICE_DAILY_EXPENSES ====================
CREATE TABLE public.office_daily_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  expense_date DATE DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.office_daily_expenses ENABLE ROW LEVEL SECURITY;

-- ==================== COMPANY_PAYMENTS ====================
CREATE TABLE public.company_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.company_payments ENABLE ROW LEVEL SECURITY;

-- ==================== ADVANCES ====================
CREATE TABLE public.advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  type TEXT DEFAULT 'advance',
  reason TEXT,
  advance_date DATE DEFAULT CURRENT_DATE,
  is_settled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.advances ENABLE ROW LEVEL SECURITY;

-- ==================== EXPENSES ====================
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  category TEXT,
  expense_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- ==================== CASH_FLOW_ENTRIES ====================
CREATE TABLE public.cash_flow_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  entry_date DATE DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cash_flow_entries ENABLE ROW LEVEL SECURITY;

-- ==================== MESSAGES ====================
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_msg_pair ON public.messages(sender_id, receiver_id, created_at DESC);

-- ==================== ACTIVITY_LOGS ====================
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_logs_created ON public.activity_logs(created_at DESC);

CREATE OR REPLACE FUNCTION public.log_activity(_action TEXT, _entity_type TEXT, _entity_id UUID, _details JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id UUID;
BEGIN
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), _action, _entity_type, _entity_id, _details)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- ==================== HANDLE_NEW_USER TRIGGER ====================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==================== RLS POLICIES ====================
-- Generic: authenticated users can read; only owner/admin can write (operational tables)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'offices','delivery_prices','products','companies','order_statuses',
    'orders','order_notes','diaries','diary_orders',
    'courier_collections','courier_bonuses',
    'office_payments','office_daily_closings','office_daily_expenses',
    'company_payments','advances','expenses','cash_flow_entries',
    'app_settings','user_permissions'
  ]) LOOP
    EXECUTE format('CREATE POLICY "auth_read_%I" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "admin_write_%I" ON public.%I FOR ALL TO authenticated USING (public.is_owner_or_admin(auth.uid())) WITH CHECK (public.is_owner_or_admin(auth.uid()))', t, t);
  END LOOP;
END $$;

-- profiles: users see all (for staff lookup), update own; admin updates all
CREATE POLICY "profiles_read_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
  USING (public.is_owner_or_admin(auth.uid())) WITH CHECK (public.is_owner_or_admin(auth.uid()));

-- user_roles: read all (needed by app), only admin writes
CREATE POLICY "roles_read" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_admin_write" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_owner_or_admin(auth.uid())) WITH CHECK (public.is_owner_or_admin(auth.uid()));

-- courier_locations: courier inserts own, admin reads all, courier reads own
CREATE POLICY "loc_insert_own" ON public.courier_locations FOR INSERT TO authenticated WITH CHECK (courier_id = auth.uid());
CREATE POLICY "loc_read_own_or_admin" ON public.courier_locations FOR SELECT TO authenticated
  USING (courier_id = auth.uid() OR public.is_owner_or_admin(auth.uid()));

-- messages: sender/receiver see; sender inserts
CREATE POLICY "msg_read" ON public.messages FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid() OR public.is_owner_or_admin(auth.uid()));
CREATE POLICY "msg_send" ON public.messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());
CREATE POLICY "msg_update" ON public.messages FOR UPDATE TO authenticated
  USING (receiver_id = auth.uid() OR sender_id = auth.uid());

-- activity_logs: read all auth, insert all auth
CREATE POLICY "logs_read" ON public.activity_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "logs_insert" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);
