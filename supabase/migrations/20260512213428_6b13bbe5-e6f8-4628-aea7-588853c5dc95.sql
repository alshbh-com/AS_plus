
ALTER TABLE public.offices ADD COLUMN can_add_orders BOOLEAN DEFAULT false;
ALTER TABLE public.courier_collections ADD COLUMN office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL;
ALTER TABLE public.office_daily_expenses ADD COLUMN created_by UUID REFERENCES auth.users(id);

-- Restrict log_activity & handle_new_user to service role / definer-only paths
REVOKE EXECUTE ON FUNCTION public.log_activity(TEXT, TEXT, UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_activity(TEXT, TEXT, UUID, JSONB) TO authenticated;
