
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS last_modified_by uuid,
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS courier_closed_by uuid,
  ADD COLUMN IF NOT EXISTS returned_to_sender boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS returned_to_sender_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_to_sender_by uuid;

CREATE OR REPLACE FUNCTION public.handle_orders_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NOT NULL THEN
    NEW.last_modified_by := uid;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    IF NEW.is_closed = true AND (OLD.is_closed IS DISTINCT FROM true) THEN
      NEW.closed_by := COALESCE(uid, NEW.closed_by);
      IF NEW.closed_at IS NULL THEN NEW.closed_at := now(); END IF;
    END IF;
    IF NEW.is_closed = false AND OLD.is_closed = true THEN
      NEW.closed_by := NULL;
      NEW.closed_at := NULL;
    END IF;

    IF NEW.is_courier_closed = true AND (OLD.is_courier_closed IS DISTINCT FROM true) THEN
      NEW.courier_closed_by := COALESCE(uid, NEW.courier_closed_by);
    END IF;
    IF NEW.is_courier_closed = false AND OLD.is_courier_closed = true THEN
      NEW.courier_closed_by := NULL;
    END IF;

    IF NEW.returned_to_sender = true AND (OLD.returned_to_sender IS DISTINCT FROM true) THEN
      NEW.returned_to_sender_at := now();
      NEW.returned_to_sender_by := COALESCE(uid, NEW.returned_to_sender_by);
    END IF;
    IF NEW.returned_to_sender = false AND OLD.returned_to_sender = true THEN
      NEW.returned_to_sender_at := NULL;
      NEW.returned_to_sender_by := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_audit ON public.orders;
CREATE TRIGGER trg_orders_audit
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.handle_orders_audit();
