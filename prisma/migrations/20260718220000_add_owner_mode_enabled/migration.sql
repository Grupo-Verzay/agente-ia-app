-- Modo Dueño por WhatsApp: interruptor opt-in por cuenta (apagado por defecto).
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "owner_mode_enabled" BOOLEAN NOT NULL DEFAULT false;
