"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { cuantosRecordatoriosPendientes, type ClaveDePendientes } from "@/lib/pendientes-del-menu";

/**
 * Los contadores del menú lateral que salen de NUESTRA base: Agenda,
 * Multiagenda y Recordatorios. Chats y Mis tareas ya tienen el suyo en el
 * navegador (`useChatsQueEsperan`, `useTaskStore`) y Correos va por su propia
 * acción (`correosSinLeerAction`), porque pregunta a Gmail/Outlook/IMAP y un
 * buzón lento no puede retener los otros tres.
 *
 * - **La cuenta sale de la sesión** (`effectiveId`, la misma con la que abren
 *   Agenda, Multiagenda y Recordatorios): ningún id llega del navegador.
 * - Lo único que llega de fuera son **qué claves pedir** —las del menú de esa
 *   persona, para no contar lo que no tiene— y el **desfase horario** del
 *   navegador, que solo mueve dónde empieza «mañana»: no decide ningún acceso.
 * - **Cada contador en su propio `try`**: uno que falla sale `null` —sin
 *   número— y no se lleva a los demás. `null` no es cero.
 * - Son `COUNT` sobre índices (`userId`, `teamId + startTime`), salvo
 *   Recordatorios, que se agrupa con la regla de su pantalla y trae solo tres
 *   columnas.
 */
export async function pendientesDelMenuAction(
    clavesPedidas: unknown,
    desfaseMin?: unknown,
): Promise<{ success: true; conteos: Partial<Record<ClaveDePendientes, number | null>> } | { success: false; message: string }> {
    const user = await currentUser();
    if (!user?.id) return { success: false, message: "No autorizado." };
    const cuenta = (user as { effectiveId?: string }).effectiveId ?? user.ownerId ?? user.id;

    const pedidas = new Set(Array.isArray(clavesPedidas) ? clavesPedidas.filter((c): c is string => typeof c === "string") : []);
    const desfase = typeof desfaseMin === "number" && Number.isFinite(desfaseMin) ? desfaseMin : null;
    const ahora = new Date();
    const conteos: Partial<Record<ClaveDePendientes, number | null>> = {};

    const contar = async (clave: ClaveDePendientes, fn: () => Promise<number>) => {
        if (!pedidas.has(clave)) return;
        try {
            conteos[clave] = await fn();
        } catch (error) {
            // No es mudo: un número que desaparece sin decirlo se lee como «ya
            // no hay pendientes».
            console.warn(`[menu] no se pudo contar ${clave}`, error);
            conteos[clave] = null;
        }
    };

    await Promise.all([
        // La MISMA condición que la campanita (`esCitaPendiente`).
        contar("agenda", () =>
            db.appointment.count({ where: { userId: cuenta, status: "PENDIENTE", startTime: { gte: ahora } } }),
        ),
        contar("multiagenda", async () => {
            const team = await db.team.findUnique({ where: { userId: cuenta }, select: { id: true } });
            if (!team) return 0;
            return db.bookingAppointment.count({ where: { teamId: team.id, status: "PENDIENTE", startTime: { gte: ahora } } });
        }),
        contar("recordatorios", async () => {
            const filas = await db.reminders.findMany({
                // Los mismos que enseña su pantalla (`getRemindersByUserId`).
                where: { userId: cuenta, isCampaign: false },
                select: { time: true, sentAt: true, repeatType: true },
            });
            return cuantosRecordatoriosPendientes(filas, ahora, desfase);
        }),
    ]);

    return { success: true, conteos };
}
