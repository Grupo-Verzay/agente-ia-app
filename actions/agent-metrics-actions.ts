"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export type LeadFunnelItem = { status: string | null; count: number };

export type AgentMetrics = {
  total: number;
  agentOn: number;
  agentOff: number;
  withAdvisor: number;
  hot: number;
  resolved: number;
  leadFunnel: LeadFunnelItem[];
};

const EMPTY: AgentMetrics = {
  total: 0, agentOn: 0, agentOff: 0, withAdvisor: 0, hot: 0, resolved: 0, leadFunnel: [],
};

export async function getAgentMetrics(): Promise<{ success: boolean; data: AgentMetrics; message?: string }> {
  const user = await currentUser();
  if (!user) return { success: false, data: EMPTY, message: "No autorizado" };

  const ownerId = user.ownerId ?? user.id;

  try {
    const [total, agentOn, agentOff, withAdvisor, hot, resolved, leadGroups] = await Promise.all([
      db.session.count({ where: { userId: ownerId, status: true } }),
      db.session.count({ where: { userId: ownerId, status: true, agentDisabled: false } }),
      db.session.count({ where: { userId: ownerId, status: true, agentDisabled: true } }),
      db.session.count({ where: { userId: ownerId, status: true, assignedAdvisorId: { not: null } } }),
      db.session.count({ where: { userId: ownerId, status: true, leadStatus: "CALIENTE" } }),
      db.session.count({ where: { userId: ownerId, status: true, leadStatus: "FINALIZADO" } }),
      db.session.groupBy({
        by: ["leadStatus"],
        where: { userId: ownerId, status: true },
        _count: { leadStatus: true },
      }),
    ]);

    const leadFunnel: LeadFunnelItem[] = leadGroups.map((g) => ({
      status: g.leadStatus,
      count: g._count.leadStatus,
    }));

    return { success: true, data: { total, agentOn, agentOff, withAdvisor, hot, resolved, leadFunnel } };
  } catch (e) {
    console.error("[getAgentMetrics]", e);
    return { success: false, data: EMPTY, message: "Error al cargar métricas" };
  }
}
