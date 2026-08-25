// app/actions/billing-page-actions.ts
"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdminOrReseller } from "@/lib/rbac";
import { ResponseFormat } from "@/types/billing";
import { serializeUserBilling } from "./helpers/billing-helpers";

export async function getClientsWithBilling(): Promise<ResponseFormat<any[]>> {
  try {
    const me = await currentUser();
    if (!me) return { success: false, message: "No autorizado." };
    if (!isAdminOrReseller(me.role)) {
      return { success: false, message: "No autorizado." };
    }

    let assignedUserIds: string[] | undefined;

    if (me.role === "reseller") {
      // Clientes del reseller: combinar sistema viejo (Reseller.userId) y nuevo
      // (User.demoResellerId), igual que /panel/clientes. Antes solo usaba el
      // viejo, por eso el billing salía vacío para clientes vinculados por
      // demoResellerId aunque sí aparecieran en /panel/clientes.
      const [oldAssignments, newClients] = await Promise.all([
        db.reseller.findMany({
          where: { resellerid: me.id },
          select: { userId: true },
        }),
        db.user.findMany({
          where: { demoResellerId: me.id },
          select: { id: true },
        }),
      ]);

      assignedUserIds = Array.from(
        new Set([
          ...oldAssignments.map((a) => a.userId).filter((id): id is string => Boolean(id)),
          ...newClients.map((c) => c.id),
        ]),
      );

      if (!assignedUserIds.length) {
        return { success: true, message: "No hay usuarios asignados.", data: [] };
      }
    }

    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      where: {
        status: true,
        ownerId: null,
        // Las de prueba SÍ se listan. Se excluían porque no tenían fecha ni
        // servicio y salían como "Empresa Demo — Sin fecha", ensuciando los
        // contadores. Desde que el registro les pone fecha real de fin y días de
        // licencia, ese motivo ya no vale: una prueba con fecha de vencimiento es
        // justo la que hay que perseguir, y tenerla fuera dejaba ciego el único
        // momento en que se puede hacer algo. Van con estado propio para no
        // contarse como "pagó" ni como "no pagó".
        // Admin: solo clientes directos + cuentas principales de resellers.
        // Los clientes ASIGNADOS a un reseller (demoResellerId) los cobra el
        // reseller, no la plataforma, así que se excluyen de Finanzas del admin.
        // (En la vista del reseller sí se listan vía assignedUserIds.)
        ...(assignedUserIds ? { id: { in: assignedUserIds } } : { demoResellerId: null }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        company: true,
        notificationNumber: true,
        plan: true,
        createdAt: true,
        status: true,
        // La pantalla lo necesita para separarlas: ni cuentan como pagadas ni
        // como morosas, tienen su propio estado.
        isDemo: true,
        billing: true,
      },
    });

    const safeUsers = users
      .map((u) => ({
        ...u,
        createdAt: u.createdAt ? u.createdAt.toISOString() : null,
      }))
      .map(serializeUserBilling);

    return { success: true, message: "Clientes cargados.", data: safeUsers };
  } catch (e: any) {
    console.error("[getClientsWithBilling]", e);
    return { success: false, message: e?.message ?? "Error cargando clientes con billing." };
  }
}
