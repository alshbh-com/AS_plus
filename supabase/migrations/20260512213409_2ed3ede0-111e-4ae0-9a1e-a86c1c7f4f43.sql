
ALTER TABLE public.companies ADD COLUMN agreement_price NUMERIC DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN address TEXT, ADD COLUMN notes TEXT;
ALTER TABLE public.offices ADD COLUMN owner_phone TEXT, ADD COLUMN specialty TEXT;
ALTER TABLE public.diaries ADD COLUMN diary_number TEXT, ADD COLUMN lock_status_updates BOOLEAN DEFAULT false, ADD COLUMN prevent_new_orders BOOLEAN DEFAULT false;
ALTER TABLE public.office_payments ADD COLUMN type TEXT DEFAULT 'payment';
ALTER TABLE public.courier_collections ADD COLUMN order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD COLUMN office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL;
ALTER TABLE public.cash_flow_entries ADD COLUMN office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL;
ALTER TABLE public.delivery_prices ADD COLUMN office_id UUID REFERENCES public.offices(id) ON DELETE CASCADE, ADD COLUMN pickup_price NUMERIC DEFAULT 0;
ALTER TABLE public.advances ADD COLUMN created_by UUID REFERENCES auth.users(id);

-- shipping_paid is used as a numeric amount in code
ALTER TABLE public.orders DROP COLUMN shipping_paid;
ALTER TABLE public.orders ADD COLUMN shipping_paid NUMERIC DEFAULT 0;

-- coverage_areas used as text not array in code
ALTER TABLE public.profiles DROP COLUMN coverage_areas;
ALTER TABLE public.profiles ADD COLUMN coverage_areas TEXT;

-- Re-create functions with secure search_path and tightened execute
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.generate_order_barcode()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
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

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_owner_or_admin(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_activity(TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_or_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_activity(TEXT, TEXT, UUID, JSONB) TO authenticated;
