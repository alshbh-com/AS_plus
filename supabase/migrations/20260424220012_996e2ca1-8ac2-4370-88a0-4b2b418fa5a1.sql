-- Backfill closed_at for courier-closed orders that have no closed_at,
-- using activity_logs entries of action 'تقفيل أوردرات من تحصيلات المندوب'.
-- For each courier, walk log entries from oldest to newest and assign closed_at
-- to that many orders (ordered by created_at DESC, i.e. newest pending closures first).

DO $$
DECLARE
  log_rec RECORD;
  remaining INT;
  ord_rec RECORD;
BEGIN
  FOR log_rec IN
    SELECT (details->>'courier_id')::uuid AS courier_id,
           COALESCE((details->>'count')::int, 0) AS cnt,
           created_at
    FROM activity_logs
    WHERE action = 'تقفيل أوردرات من تحصيلات المندوب'
      AND details ? 'courier_id'
      AND details ? 'count'
    ORDER BY created_at ASC
  LOOP
    remaining := log_rec.cnt;
    IF remaining IS NULL OR remaining <= 0 THEN CONTINUE; END IF;

    FOR ord_rec IN
      SELECT id FROM orders
      WHERE courier_id = log_rec.courier_id
        AND is_courier_closed = true
        AND closed_at IS NULL
      ORDER BY created_at DESC
      LIMIT remaining
    LOOP
      UPDATE orders SET closed_at = log_rec.created_at WHERE id = ord_rec.id;
      remaining := remaining - 1;
    END LOOP;
  END LOOP;
END $$;