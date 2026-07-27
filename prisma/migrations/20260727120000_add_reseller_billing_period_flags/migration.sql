-- Periodos de facturación visibles en la landing del reseller
-- (mensual / trimestral / anual). Por defecto se muestran los tres.
ALTER TABLE "reseller"
ADD COLUMN IF NOT EXISTS "showBillingMonthly" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "showBillingQuarterly" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "showBillingYearly" BOOLEAN NOT NULL DEFAULT true;
