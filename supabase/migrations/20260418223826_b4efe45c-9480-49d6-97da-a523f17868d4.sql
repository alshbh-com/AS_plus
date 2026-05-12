-- Add fixed commission per courier
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS commission_amount numeric DEFAULT 0;

-- Add fixed commission per office (per delivered order)
ALTER TABLE public.offices ADD COLUMN IF NOT EXISTS office_commission numeric DEFAULT 0;

-- Daily office expenses (shipments / office / advances)
CREATE TABLE IF NOT EXISTS public.office_daily_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'office', -- shipments | office | advances
  amount numeric DEFAULT 0,
  notes text DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.office_daily_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office_daily_expenses_all" ON public.office_daily_expenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_office_daily_expenses_office_date 
  ON public.office_daily_expenses (office_id, expense_date);