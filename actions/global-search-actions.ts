"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export type GlobalSearchKind =
  | "client"
  | "note"
  | "task"
  | "product"
  | "conversation"
  | "workflow";

export type GlobalSearchResult = {
  id: string;
  kind: GlobalSearchKind;
  title: string;
  description?: string | null;
  href: string;
};

export async function globalSearchAction(query: string): Promise<{
  success: boolean;
  data: GlobalSearchResult[];
  message?: string;
}> {
  const user = await currentUser();
  if (!user) return { success: false, data: [], message: "No autorizado." };

  const q = query.trim();
  if (q.length < 2) return { success: true, data: [] };

  const ownerId = user.ownerId ?? user.id;
  const contains = { contains: q, mode: "insensitive" as const };

  try {
    const [clients, notes, tasks, products, conversations, workflows] = await Promise.all([
      db.session.findMany({
        where: {
          userId: ownerId,
          OR: [{ pushName: contains }, { remoteJid: contains }],
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      db.userNote.findMany({
        where: { userId: ownerId, isArchived: false, title: contains },
        orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
        take: 5,
      }),
      (db as any).task.findMany({
        where: {
          ownerId,
          status: { not: "cancelled" },
          OR: [{ title: contains }, { contactName: contains }, { contactJid: contains }],
        },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      db.product.findMany({
        where: {
          userId: ownerId,
          OR: [{ title: contains }, { description: contains }, { sku: contains }, { category: contains }],
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      db.session.findMany({
        where: {
          userId: ownerId,
          status: true,
          OR: [{ pushName: contains }, { remoteJid: contains }],
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      db.workflow.findMany({
        where: {
          userId: ownerId,
          OR: [{ name: contains }, { description: contains }],
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);

    const results: GlobalSearchResult[] = [
      ...clients.map((client) => ({
        id: `client-${client.id}`,
        kind: "client" as const,
        title: client.pushName || client.remoteJid,
        description: client.remoteJid,
        href: `/sessions?search=${encodeURIComponent(client.remoteJid)}`,
      })),
      ...notes.map((note) => ({
        id: `note-${note.id}`,
        kind: "note" as const,
        title: note.title || "Sin titulo",
        description: "Nota",
        href: "/notas",
      })),
      ...tasks.map((task: any) => ({
        id: `task-${task.id}`,
        kind: "task" as const,
        title: task.title,
        description: task.contactName ? `Tarea - ${task.contactName}` : "Tarea",
        href: "/tareas",
      })),
      ...products.map((product) => ({
        id: `product-${product.id}`,
        kind: "product" as const,
        title: product.title,
        description: product.sku ?? product.category,
        href: `/products?search=${encodeURIComponent(product.title)}`,
      })),
      ...conversations.map((conversation) => ({
        id: `conversation-${conversation.id}`,
        kind: "conversation" as const,
        title: conversation.pushName || conversation.remoteJid,
        description: "Conversacion",
        href: `/chats?jid=${encodeURIComponent(conversation.remoteJid)}`,
      })),
      ...workflows.map((workflow) => ({
        id: `workflow-${workflow.id}`,
        kind: "workflow" as const,
        title: workflow.name,
        description: workflow.description ?? "Flujo",
        href: `/workflow/${workflow.id}`,
      })),
    ];

    return { success: true, data: results };
  } catch (error) {
    console.error("[globalSearchAction]", error);
    return { success: false, data: [], message: "Error al buscar." };
  }
}

