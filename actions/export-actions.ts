"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export type SessionExportRow = {
  id: number;
  nombre: string;
  telefono: string;
  leadStatus: string;
  estadoConversacion: string;
  agenteIA: string;
  asesor: string;
  etiquetas: string;
  fechaCreacion: string;
};

export async function getSessionsForExport(): Promise<
  { success: true; rows: SessionExportRow[] } | { success: false; message: string }
> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };

  const effectiveOwnerId = (user as any).ownerId ?? user.id;

  const rows = await db.$queryRaw<{
    id: number;
    pushName: string;
    remoteJid: string;
    leadStatus: string | null;
    status: boolean;
    agentDisabled: boolean;
    advisorName: string | null;
    advisorEmail: string | null;
    tags: string | null;
    createdAt: Date;
  }[]>`
    SELECT
      s.id,
      s."pushName",
      s."remoteJid",
      s."leadStatus",
      s.status,
      s."agentDisabled",
      u.name             AS "advisorName",
      u.email            AS "advisorEmail",
      STRING_AGG(t.name, ', ' ORDER BY t.name) AS tags,
      s."createdAt"
    FROM "Session" s
    LEFT JOIN "User" u ON u.id = s.assigned_advisor_id
    LEFT JOIN "SessionTag" st ON st."sessionId" = s.id
    LEFT JOIN "Tag" t ON t.id = st."tagId"
    WHERE s."userId" = ${effectiveOwnerId}
    GROUP BY s.id, u.name, u.email
    ORDER BY s."createdAt" DESC
  `;

  const LEAD_LABELS: Record<string, string> = {
    FRIO: "Frío",
    TIBIO: "Tibio",
    CALIENTE: "Caliente",
    FINALIZADO: "Finalizado",
    DESCARTADO: "Descartado",
  };

  return {
    success: true,
    rows: rows.map((r) => ({
      id: r.id,
      nombre: r.pushName ?? "",
      telefono: r.remoteJid.replace(/@.*$/, ""),
      leadStatus: r.leadStatus ? (LEAD_LABELS[r.leadStatus] ?? r.leadStatus) : "Sin clasificar",
      estadoConversacion: r.status ? "Activa" : "Cerrada",
      agenteIA: r.agentDisabled ? "Pausado" : "Activo",
      asesor: r.advisorName ?? r.advisorEmail ?? "Sin asignar",
      etiquetas: r.tags ?? "",
      fechaCreacion: r.createdAt.toISOString().split("T")[0],
    })),
  };
}
