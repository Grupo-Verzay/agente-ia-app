CREATE INDEX IF NOT EXISTS "chat_messages_user_instance_alt_ts_idx"
ON "chat_messages"("userId", "instanceName", "remoteJidAlt", "messageTimestamp");

CREATE INDEX IF NOT EXISTS "chat_messages_user_instance_sender_ts_idx"
ON "chat_messages"("userId", "instanceName", "senderPn", "messageTimestamp");
