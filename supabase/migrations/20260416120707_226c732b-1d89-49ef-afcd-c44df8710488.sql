ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS courier_assigned_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_orders_courier_assigned_at
ON public.orders (courier_id, courier_assigned_at DESC)
WHERE courier_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_orders_courier_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.courier_id IS NOT NULL AND NEW.courier_assigned_at IS NULL THEN
      NEW.courier_assigned_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.courier_id IS DISTINCT FROM OLD.courier_id THEN
    IF NEW.courier_id IS NULL THEN
      NEW.courier_assigned_at := NULL;
    ELSE
      NEW.courier_assigned_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS handle_orders_courier_assignment ON public.orders;

CREATE TRIGGER handle_orders_courier_assignment
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_orders_courier_assignment();

WITH assignment_logs AS (
  SELECT
    created_at AS assigned_at,
    (details->>'courier_id')::uuid AS courier_id,
    (details->>'count')::int AS assigned_count,
    SUM((details->>'count')::int) OVER (
      PARTITION BY (details->>'courier_id')::uuid
      ORDER BY created_at DESC
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS previous_counts
  FROM public.activity_logs
  WHERE action IN ('تعيين أوردرات لمندوب', 'تعيين أوردرات لمندوب من جميع الأوردرات')
    AND details ? 'courier_id'
    AND details ? 'count'
    AND (details->>'courier_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (details->>'count') ~ '^[0-9]+$'
),
ranked_orders AS (
  SELECT
    id,
    courier_id,
    ROW_NUMBER() OVER (
      PARTITION BY courier_id
      ORDER BY created_at DESC, id DESC
    ) AS order_rank
  FROM public.orders
  WHERE courier_id IS NOT NULL
    AND courier_assigned_at IS NULL
),
matched_orders AS (
  SELECT
    ro.id,
    al.assigned_at
  FROM ranked_orders ro
  JOIN assignment_logs al
    ON al.courier_id = ro.courier_id
   AND ro.order_rank > COALESCE(al.previous_counts, 0)
   AND ro.order_rank <= COALESCE(al.previous_counts, 0) + al.assigned_count
)
UPDATE public.orders o
SET courier_assigned_at = mo.assigned_at
FROM matched_orders mo
WHERE o.id = mo.id
  AND o.courier_assigned_at IS NULL;