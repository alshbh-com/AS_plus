
ALTER TABLE public.cash_flow_entries ADD COLUMN reason TEXT, ADD COLUMN notes TEXT;
ALTER TABLE public.office_daily_expenses ADD COLUMN notes TEXT;
ALTER TABLE public.courier_bonuses ADD COLUMN created_by UUID REFERENCES auth.users(id);
