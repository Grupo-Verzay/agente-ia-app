-- Codigo corto del enlace de pago de cada cliente: /p/K7M2QX.
-- Se llena la primera vez que se pide el enlace, no al crear la cuenta, para
-- cubrir tambien las cuentas que ya existen.
ALTER TABLE "UserBilling" ADD COLUMN "payCode" TEXT;

-- Unico: el codigo es lo que identifica al cliente cuando paga. Dos cuentas
-- con el mismo codigo dejarian el pago sin dueño, que es justo lo que esto
-- viene a arreglar.
CREATE UNIQUE INDEX "UserBilling_payCode_key" ON "UserBilling"("payCode");
