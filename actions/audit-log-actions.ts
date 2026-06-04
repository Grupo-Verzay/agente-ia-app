"use server";

import { randomUUID } from "crypto";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export type AuditEntityType = "crm" | "appointment" | "note" | "task";
export type AuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "status_changed"
  | "completed"
  | "cancelled"
  | "archived"
  | "restored";

type AuditMetadata = Record<string, unknown>;

type WriteAuditLogInput = {
  userId: string;
  actorId?: string | null;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  summary: string;
  metadata?: AuditMetadata;
};

export type AuditLogItem = {
  id: string;
  userId: string;
  actorId: string | null;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  summary: string;
  metadata: AuditMetadata | null;
  createdAt: Date;
};

let auditTableReady = false;

async function ensureAuditLogTable() {
  if (auditTableReady) return;

  await db.$executeRaw`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      actor_id TEXT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      metadata JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await db.$executeRaw`
    CREATE INDEX IF NOT EXISTS audit_logs_user_created_at_idx
    ON audit_logs (user_id, created_at DESC)
  `;

  await db.$executeRaw`
    CREATE INDEX IF NOT EXISTS audit_logs_entity_created_at_idx
    ON audit_logs (entity_type, entity_id, created_at DESC)
  `;

  auditTableReady = true;
}

export async function getAuditActorId() {
  try {
    const user = await currentUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function writeAuditLog(input: WriteAuditLogInput) {
  try {
    if (!input.userId || !input.entityId) return;
    await ensureAuditLogTable();

    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

    await db.$executeRaw`
      INSERT INTO audit_logs (
        id, user_id, actor_id, entity_type, entity_id, action, summary, metadata
      )
      VALUES (
        ${randomUUID()},
        ${input.userId},
        ${input.actorId ?? null},
        ${input.entityType},
        ${input.entityId},
        ${input.action},
        ${input.summary},
        ${metadataJson}::jsonb
      )
    `;
  } catch (error) {
    console.warn("[writeAuditLog]", error);
  }
}

export async function getAuditLogsForEntity(
  entityType: AuditEntityType,
  entityId: string,
  limit = 20,
) {
  try {
    const user = await currentUser();
    if (!user?.id) return { success: false, data: [] as AuditLogItem[] };

    const ownerId = user.ownerId ?? user.id;
    await ensureAuditLogTable();

    const rows = await db.$queryRaw<{
      id: string;
      user_id: string;
      actor_id: string | null;
      entity_type: AuditEntityType;
      entity_id: string;
      action: AuditAction;
      summary: string;
      metadata: AuditMetadata | null;
      created_at: Date;
    }[]>`
      SELECT id, user_id, actor_id, entity_type, entity_id, action, summary, metadata, created_at
      FROM audit_logs
      WHERE user_id = ${ownerId}
        AND entity_type = ${entityType}
        AND entity_id = ${entityId}
      ORDER BY created_at DESC
      LIMIT ${Math.max(1, Math.min(limit, 50))}
    `;

    return {
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        actorId: row.actor_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        action: row.action,
        summary: row.summary,
        metadata: row.metadata,
        createdAt: row.created_at,
      })),
    };
  } catch (error) {
    console.warn("[getAuditLogsForEntity]", error);
    return { success: false, data: [] as AuditLogItem[] };
  }
}
