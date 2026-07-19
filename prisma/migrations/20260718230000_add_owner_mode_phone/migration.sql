-- Modo Dueño por WhatsApp: número dedicado del dueño que da órdenes al agente.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "owner_mode_phone" TEXT;
