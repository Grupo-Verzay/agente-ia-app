-- Marca de "ya se limpio el rastro de este contacto".
--
-- Va aparte de deletedAt porque las dos cosas son distintas: deletedAt es lo
-- que mantiene la conversacion fuera de la lista de Chats, y no se puede
-- quitar nunca -la conversacion sigue viva en WhatsApp y volveria sola-.
-- purgedAt solo dice que ya no queda nada que borrar, para poder sacarla de
-- la pestana Eliminados sin destapar la conversacion.
ALTER TABLE "ChatConversationPreference"
  ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ChatConversationPreference_userId_purgedAt_idx"
  ON "ChatConversationPreference" ("userId", "purgedAt");
