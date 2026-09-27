import "server-only";

import { db } from "@/lib/db";
import { laClaveDelServidorDeLaCuenta } from "@/lib/clave-del-servidor.server";
import { enviarConHistorial } from "@/lib/envio-con-historial.server";
import {
    comoZonaHoraria,
    elAvisoAlDueno,
    elDiaElegido,
    laConfirmacionAlCliente,
    losRecordatoriosDeLaCita,
    sePuedeConfirmarLaCita,
    type DatosDeLaCita,
} from "@/lib/cita-publica";

/**
 * Lo que sale después de una reserva de la página pública: los recordatorios de
 * la agenda, el aviso al dueño y la confirmación al cliente. Ver
 * `lib/cita-publica.ts` para el porqué.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Del navegador solo llega el ID.** La línea sale de la sesión de la cita
 *    (`Session.instanceId`, que es con la que la página la registró), el número
 *    del cliente de su `remoteJid`, y la clave del servidor de la cuenta dueña.
 * 2. **Una vez por cita** (`cita_publica_avisada`), y quien lo decide es la base:
 *    un `INSERT … ON CONFLICT DO NOTHING` y las filas tocadas. Un segundo clic,
 *    un reintento o alguien que repita la petición a mano no manda nada otra vez.
 * 3. **Solo una cita recién creada** (`sePuedeConfirmarLaCita`). Sin plazo, el
 *    id de una cita vieja sería una forma de reenviarle mensajes al cliente.
 */

let tablaLista: Promise<void> | null = null;

/** `IF NOT EXISTS` no basta con dos réplicas: solo se traga «ya existe». */
async function ddl(ejecutar: () => Promise<unknown>): Promise<void> {
    try {
        await ejecutar();
    } catch (error) {
        const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
        const codigo = String(e?.meta?.code ?? e?.code ?? "");
        const texto = String(e?.message ?? "");
        const yaEstaba = ["23505", "42P07", "42710"].some((c) => codigo === c || texto.includes(c));
        if (!yaEstaba) throw error;
    }
}

function asegurarLaTabla(): Promise<void> {
    if (tablaLista) return tablaLista;
    tablaLista = ddl(() =>
        db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "cita_publica_avisada" (
                "appointmentId" TEXT PRIMARY KEY,
                "avisadaEn"     TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `,
    ).catch((error) => {
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

function esTablaQueFalta(error: unknown): boolean {
    const meta = (error as { meta?: { code?: string } } | null)?.meta;
    if (meta?.code === "42P01") return true;
    const texto = error instanceof Error ? error.message : String(error);
    return texto.includes("42P01");
}

/** Apunta que esta cita ya se avisó. `true` si la apunta ESTA llamada. */
async function apuntarLaCita(appointmentId: string): Promise<boolean> {
    const hacer = () =>
        db.$executeRaw`
            INSERT INTO "cita_publica_avisada" ("appointmentId") VALUES (${appointmentId})
            ON CONFLICT ("appointmentId") DO NOTHING
        `;
    await asegurarLaTabla();
    try {
        return (await hacer()) === 1;
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        tablaLista = null;
        await asegurarLaTabla();
        return (await hacer()) === 1;
    }
}

export type ResultadoDeLaCitaPublica = {
    success: boolean;
    message: string;
    recordatorios?: number;
    avisos?: number;
    confirmacionEnviada?: boolean;
};

export async function confirmarLaCitaPublica(input: {
    appointmentId: string;
    diaElegido?: string | null;
    zonaDelCliente?: string | null;
}, ahora: Date = new Date()): Promise<ResultadoDeLaCitaPublica> {
    const id = String(input?.appointmentId ?? "").trim();
    if (!id || id.length > 64) return { success: false, message: "Cita no válida." };

    const cita = await db.appointment.findUnique({
        where: { id },
        select: {
            id: true,
            userId: true,
            clientName: true,
            startTime: true,
            endTime: true,
            createdAt: true,
            service: { select: { name: true, messageText: true } },
            session: { select: { remoteJid: true, instanceId: true, pushName: true } },
            user: { select: { timezone: true, meetingDuration: true, notificationNumber: true } },
        },
    });
    if (!cita) return { success: false, message: "Cita no encontrada." };

    if (!sePuedeConfirmarLaCita(cita.createdAt, ahora)) {
        console.warn("[cita-publica] se pidió avisar de una cita que no es reciente", { appointmentId: id });
        return { success: false, message: "Esta cita ya no se puede confirmar desde aquí." };
    }

    const linea = String(cita.session?.instanceId ?? "").trim();
    const remoteJid = String(cita.session?.remoteJid ?? "").trim();
    if (!linea || !remoteJid) return { success: false, message: "La cita no tiene línea o número." };

    if (!(await apuntarLaCita(id))) {
        return { success: true, message: "Esta cita ya se había confirmado." };
    }

    const zonaDelDueno = cita.user?.timezone || "America/Bogota";
    const datos: DatosDeLaCita = {
        nombreDelCliente: (cita.clientName || cita.session?.pushName || "").trim(),
        telefonoDelCliente: remoteJid.replace(/@.*/, "").replace(/\D/g, ""),
        inicio: cita.startTime,
        fin: cita.endTime,
        diaElegido: elDiaElegido(input?.diaElegido, cita.startTime, zonaDelDueno),
        zonaDelDueno,
        zonaDelCliente: comoZonaHoraria(input?.zonaDelCliente, zonaDelDueno),
        duracionMinutos: cita.user?.meetingDuration || 60,
        servicio: cita.service,
    };

    const servidor = await laClaveDelServidorDeLaCuenta(cita.userId);
    const url = servidor ? `${servidor.url}/message/sendText/${encodeURIComponent(linea)}` : undefined;

    // 1) Los recordatorios de la agenda, como seguimientos. La clave la pone
    //    el servidor: la de la cuenta dueña, nunca una que llegue de fuera.
    const recordatorios = await db.reminders.findMany({
        where: { userId: cita.userId, isCampaign: false, isSchedule: true },
        select: { description: true, time: true },
    });
    const programados = losRecordatoriosDeLaCita(recordatorios, datos);
    for (const r of programados) {
        try {
            await db.seguimiento.create({
                data: {
                    idNodo: "",
                    serverurl: servidor?.url ?? "",
                    instancia: linea,
                    apikey: servidor?.key ?? "",
                    remoteJid,
                    mensaje: r.mensaje,
                    tipo: "text",
                    time: r.cuando,
                },
            });
        } catch (error) {
            console.error("[cita-publica] no se pudo programar un recordatorio", { appointmentId: id, error });
        }
    }

    // 2) El aviso al dueño y a sus contactos de notificación.
    const telefonos: string[] = [];
    if (cita.user?.notificationNumber) telefonos.push(cita.user.notificationNumber);
    const contactos = await db.userNotificationContact.findMany({
        where: { userId: cita.userId },
        select: { phone: true },
    });
    for (const c of contactos) if (c.phone && !telefonos.includes(c.phone)) telefonos.push(c.phone);

    const aviso = elAvisoAlDueno(datos);
    let avisos = 0;
    await Promise.allSettled(
        telefonos.map(async (telefono) => {
            const destino = telefono.includes("@s.whatsapp.net") ? telefono : `${telefono}@s.whatsapp.net`;
            const res = await enviarConHistorial({
                instanceName: linea,
                url,
                apikey: servidor?.key,
                remoteJid: destino,
                message: aviso.texto,
                historyType: "notification",
                additionalKwargs: {
                    source: "SchedulePageClient",
                    recipient: "owner",
                    appointmentUserId: cita.userId,
                    eventType: "Cita",
                    advisorRequest: false,
                    contactName: datos.nombreDelCliente,
                    descriptionLabel: aviso.servicio,
                    description: aviso.descripcion,
                    contactPhone: `+${datos.telefonoDelCliente}`,
                },
            });
            if (res.success) avisos++;
            else console.warn("[cita-publica] no se pudo avisar al dueño", { appointmentId: id, motivo: res.message });
        }),
    );

    // 3) La confirmación a quien reservó.
    let confirmacionEnviada = false;
    const confirmacion = await enviarConHistorial({
        instanceName: linea,
        url,
        apikey: servidor?.key,
        remoteJid,
        message: laConfirmacionAlCliente(datos),
        historyType: "notification",
        additionalKwargs: { source: "SchedulePageClient", recipient: "client" },
    });
    confirmacionEnviada = confirmacion.success;
    if (!confirmacion.success) {
        console.warn("[cita-publica] no se pudo mandar la confirmación", { appointmentId: id, motivo: confirmacion.message });
    }

    return {
        success: true,
        message: confirmacionEnviada ? "Confirmación enviada." : "La cita quedó agendada, pero no se pudo enviar la confirmación.",
        recordatorios: programados.length,
        avisos,
        confirmacionEnviada,
    };
}
