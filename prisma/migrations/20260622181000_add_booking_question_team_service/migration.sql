ALTER TABLE "booking_questions"
ADD COLUMN IF NOT EXISTS "teamServiceId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_questions_teamServiceId_fkey'
  ) THEN
    ALTER TABLE "booking_questions"
    ADD CONSTRAINT "booking_questions_teamServiceId_fkey"
    FOREIGN KEY ("teamServiceId") REFERENCES "team_services"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "booking_questions_teamServiceId_order_idx"
ON "booking_questions"("teamServiceId", "order");
