CREATE TABLE "sales_outcome_learning" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" INTEGER NOT NULL,
  "outcome" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "outcomeReason" TEXT,
  "keyArguments" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "objections" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "effectiveSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "cycleDays" INTEGER,
  "evidenceCount" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'confirmed-lead-status',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_outcome_learning_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_playbook_feedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" INTEGER NOT NULL,
  "advisorId" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "useful" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_playbook_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_outcome_learning_userId_sessionId_key" ON "sales_outcome_learning"("userId", "sessionId");
CREATE INDEX "sales_outcome_learning_userId_product_outcome_idx" ON "sales_outcome_learning"("userId", "product", "outcome");
CREATE INDEX "sales_outcome_learning_userId_createdAt_idx" ON "sales_outcome_learning"("userId", "createdAt");
CREATE INDEX "sales_playbook_feedback_userId_product_stage_idx" ON "sales_playbook_feedback"("userId", "product", "stage");
CREATE INDEX "sales_playbook_feedback_sessionId_createdAt_idx" ON "sales_playbook_feedback"("sessionId", "createdAt");
