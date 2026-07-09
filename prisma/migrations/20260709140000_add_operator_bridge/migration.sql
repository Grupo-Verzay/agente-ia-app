ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "operator_bridge_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "OperatorContact" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperatorContact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperatorContact_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "OperatorBridge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "client_session_id" INTEGER NOT NULL,
  "client_remote_jid" TEXT NOT NULL,
  "operator_contact_id" TEXT NOT NULL,
  "operator_phone" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "last_outbound_msg_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperatorBridge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperatorBridge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OperatorBridge_client_session_id_fkey"
    FOREIGN KEY ("client_session_id") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OperatorBridge_operator_contact_id_fkey"
    FOREIGN KEY ("operator_contact_id") REFERENCES "OperatorContact"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OperatorContact_userId_idx" ON "OperatorContact"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "OperatorContact_userId_phone_key" ON "OperatorContact"("userId", "phone");
CREATE INDEX IF NOT EXISTS "OperatorBridge_operator_phone_status_idx" ON "OperatorBridge"("operator_phone", "status");
CREATE INDEX IF NOT EXISTS "OperatorBridge_client_session_id_idx" ON "OperatorBridge"("client_session_id");
CREATE INDEX IF NOT EXISTS "OperatorBridge_userId_status_idx" ON "OperatorBridge"("userId", "status");
