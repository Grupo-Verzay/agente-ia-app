/**
 * La CLÍNICA del vídeo de ventas, sembrada en la App de verdad: la cuenta, su
 * línea de WhatsApp, su bandeja con otros pacientes, su embudo con sus etapas,
 * sus etiquetas, los campos de su ficha y la agenda de la semana. Encima de
 * `sembrar-barra.mjs` (la cuenta y su clave) y del MARCO de las guías (el menú
 * de un cliente de verdad y la barra de arriba).
 *
 * Laura NO se siembra: nace con su primer mensaje, que escribe `backend.mjs`
 * mientras se graba, igual que la crearía el webhook en producción.
 *
 * Todo lo que se siembra sale de `historia.mjs`: los otros chats son los
 * mismos que enseña la lista de WhatsApp Web, o la bandeja del panel no sería
 * la del mismo negocio.
 */
import { PrismaClient } from "@prisma/client";
import { sembrarElMarco } from "../sembrar-marco-de-la-guia.mjs";
import { laHoraDeLaPosicion } from "./backend.mjs";
import {
    ASESORA,
    CASO,
    CALIFICACION,
    CAMPOS_DE_LA_FICHA,
    SECCION_DE_LA_FICHA,
    ETAPAS,
    ETIQUETAS,
    NEGOCIO,
    OTROS_CHATS,
    ZONA,
    elCalendario,
    jidDe,
} from "./caso.mjs";

/** Lo que el estudio necesita saber de la cuenta sembrada. */
export async function sembrarLaClinica({ db, embudos, ahora = Date.now() }) {
    const cal = elCalendario(ahora);

    const marco = await sembrarElMarco(db, {
        path: "/chats",
        title: "Tutorial de Chats",
        description: "Cómo atender tus conversaciones desde el panel",
        url: "/guia/leads",
    });
    // Sin tutorial para /chats: el botón rojo de «Ver tutoriales» se llevaría
    // la mirada en un vídeo que no enseña a usar nada.
    await db.guideUrl.deleteMany({ where: { path: "/chats" } });
    const dueno = await db.user.update({
        where: { id: marco.id },
        data: {
            name: NEGOCIO.nombre,
            company: NEGOCIO.nombre,
            timezone: ZONA,
            contactFieldsConfig: {
                version: 2,
                campos: CAMPOS_DE_LA_FICHA.map((c, i) => ({
                    key: c.key,
                    label: c.label,
                    section: SECCION_DE_LA_FICHA,
                    icon: c.icon,
                    enabled: true,
                    order: i,
                    custom: true,
                })),
            },
        },
    });

    // Lo que dejó la semilla de la barra (su línea y su conversación) no es de
    // la clínica.
    await db.chatMessage.deleteMany({ where: { userId: dueno.id } });
    await db.chatConversation.deleteMany({ where: { userId: dueno.id } });
    await db.appointment.deleteMany({ where: { userId: dueno.id } });
    await db.session.deleteMany({ where: { userId: dueno.id } });
    await db.instancia.deleteMany({ where: { userId: dueno.id } });
    await db.seguimiento.deleteMany({ where: { instancia: NEGOCIO.linea } });
    await db.externalClientData.deleteMany({ where: { userId: dueno.id } });

    await db.instancia.create({
        data: {
            instanceName: NEGOCIO.linea,
            displayName: NEGOCIO.lineaVisible,
            userId: dueno.id,
            instanceId: NEGOCIO.lineaId,
            instanceType: "waha",
        },
    });

    await db.tag.deleteMany({ where: { userId: dueno.id } });
    const etiquetas = {};
    for (const [i, e] of ETIQUETAS.entries()) {
        const slug = e.nombre
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");
        etiquetas[e.nombre] = await db.tag.create({ data: { userId: dueno.id, name: e.nombre, slug, color: e.color, order: i } });
    }

    // La tienda no agenda valoraciones: su servicio y sus citas son de la clínica.
    const enLaTienda = CASO === "tienda";
    const servicio = enLaTienda
        ? null
        : await db.service.create({
              data: { userId: dueno.id, name: "Valoración gratuita", messageText: "Valoración odontológica", order: 0 },
          });

    // El embudo de la clínica: el que nace con la cuenta, con sus etapas
    // renombradas a las de una clínica. Las tres del sistema se quedan en su
    // sitio (`guardarEtapas` las respeta).
    // Sembrar dos veces no deja dos embudos: se empieza sin ninguno.
    for (const e of await embudos.losEmbudosDe(dueno.id)) await embudos.borrarEmbudo(dueno.id, e.id);
    const embudoId = await embudos.crearEmbudo({ cuentaId: dueno.id, nombre: enLaTienda ? "Pedidos" : "Pacientes", creadoPorId: dueno.id });
    const iniciales = await embudos.lasEtapasDe([embudoId]);
    const deSistema = (s) => iniciales.find((e) => e.sistema === s);
    const pedidas = ETAPAS.map((e) =>
        e.sistema
            ? { id: deSistema(e.sistema).id, nombre: e.nombre, color: null, sistema: e.sistema }
            : { id: null, nombre: e.nombre, color: e.colorHex, sistema: null },
    );
    const guardado = await embudos.guardarEtapas(dueno.id, embudoId, pedidas);
    if (!guardado) throw new Error("[video] no se pudieron guardar las etapas del embudo");
    const etapas = Object.fromEntries((await embudos.lasEtapasDe([embudoId])).map((e) => [e.nombre, e.id]));

    // La asesora que recibe a Laura cuando pide hablar con alguien: alguien del
    // equipo de la cuenta, como la crea Usuarios. Antes de los otros pacientes:
    // los que llevan `asesora` ya son suyos (la escena de Multiagente abre el
    // embudo filtrado por ella y enseña SUS clientes).
    const asesora = await db.user.upsert({
        where: { email: ASESORA.correo },
        update: { ownerId: dueno.id, advisorRole: "agente", name: `${ASESORA.nombre} ${ASESORA.apellido}` },
        create: {
            email: ASESORA.correo,
            name: `${ASESORA.nombre} ${ASESORA.apellido}`,
            role: "user",
            status: true,
            ownerId: dueno.id,
            advisorRole: "agente",
            company: NEGOCIO.nombre,
        },
    });

    // Los otros pacientes de la bandeja.
    for (const [i, c] of OTROS_CHATS.entries()) {
        const jid = jidDe(c.numero);
        const ultimo = cal.inicio - c.hace * 60_000;
        const sesion = await db.session.create({
            data: {
                userId: dueno.id,
                remoteJid: jid,
                pushName: c.nombre.split(" ")[0],
                customName: c.nombre,
                // Por el NOMBRE de la línea, como en producción: la bandeja
                // empareja la ficha con su conversación por `linea::numero`.
                instanceId: NEGOCIO.linea,
                status: true,
                leadStatus: CALIFICACION[c.calificacion] ?? null,
                leadStatusUpdatedAt: new Date(ultimo),
                ...(c.asesora ? { assignedAdvisorId: asesora.id } : {}),
                createdAt: new Date(ultimo - 3 * 60_000),
                updatedAt: new Date(ultimo),
            },
        });
        if (c.etiqueta && etiquetas[c.etiqueta]) {
            await db.sessionTag.create({ data: { sessionId: sesion.id, tagId: etiquetas[c.etiqueta].id } });
        }
        await embudos.moverConversacion({ sessionId: sesion.id, embudoId, etapaId: etapas[c.etapa], movidoPorId: dueno.id });
        await laHoraDeLaPosicion(db, sesion.id, ultimo);
        // Dos mensajes por chat: lo que escribió el paciente y lo último.
        const previo =
            c.ultimo.de !== "cliente"
                ? { de: "cliente", texto: "Hola, buenos días" }
                : { de: "ia", texto: `¡Hola! Soy ${NEGOCIO.asistente}, de ${NEGOCIO.nombre} 😊 ¿En qué te puedo ayudar?` };
        const mensajes = [
            { ...previo, en: ultimo - 3 * 60_000, id: `OTRO${i}A` },
            { ...c.ultimo, en: ultimo, id: `OTRO${i}B` },
        ];
        for (const m of mensajes) {
            const fromMe = m.de !== "cliente";
            const raw = {
                key: { id: m.id, remoteJid: jid, fromMe },
                message: { conversation: m.texto },
                messageTimestamp: Math.floor(m.en / 1000),
                ...(fromMe ? { sentByAi: true } : {}),
            };
            await db.chatMessage.create({
                data: {
                    userId: dueno.id,
                    instanceName: NEGOCIO.linea,
                    instanceType: "waha",
                    remoteJid: jid,
                    messageId: m.id,
                    fromMe,
                    pushName: fromMe ? null : c.nombre.split(" ")[0],
                    messageType: "conversation",
                    content: m.texto,
                    raw,
                    messageTimestamp: new Date(m.en),
                },
            });
        }
        const ult = mensajes[1];
        await db.chatConversation.create({
            data: {
                userId: dueno.id,
                instanceName: NEGOCIO.linea,
                instanceType: "waha",
                remoteJid: jid,
                pushName: c.nombre.split(" ")[0],
                lastMessageId: ult.id,
                lastMessageFromMe: ult.de !== "cliente",
                lastMessageType: "conversation",
                lastMessageContent: ult.texto,
                lastMessageRaw: { key: { id: ult.id, remoteJid: jid, fromMe: ult.de !== "cliente" }, message: { conversation: ult.texto } },
                lastMessageTimestamp: new Date(ult.en),
            },
        });
    }

    // La agenda de la semana, sin pisar ninguno de los cupos que se le
    // ofrecen a Laura: la cita del jueves a las 10 tiene que caber.
    const sesionDe = async (nombre) =>
        db.session.findFirstOrThrow({ where: { userId: dueno.id, customName: nombre } });
    const DIA = 86_400_000;
    const citas = enLaTienda ? [] : [
        { quien: "Carlos Ramírez", inicio: cal.inicio - DIA + 4.33 * 3_600_000, estado: "ATENDIDA" },
        { quien: "Pedro Castaño", inicio: cal.inicio + DIA + 6.33 * 3_600_000, estado: "PENDIENTE" },
        { quien: "Julián Torres", inicio: cal.cita - 1.5 * 3_600_000, estado: "CONFIRMADA" },
        { quien: "Mariana Ruiz", inicio: cal.cita + 3 * DIA - 1 * 3_600_000, estado: "PENDIENTE" },
    ];
    for (const c of citas) {
        const s = await sesionDe(c.quien);
        const inicio = new Date(Math.round(c.inicio / 900_000) * 900_000);
        await db.appointment.create({
            data: {
                userId: dueno.id,
                sessionId: s.id,
                clientName: c.quien,
                startTime: inicio,
                endTime: new Date(inicio.getTime() + 45 * 60_000),
                timezone: ZONA,
                status: c.estado,
                serviceId: servicio.id,
            },
        });
    }

    // El resumen de la semana anterior, como lo escribe el informe semanal
    // (`weekly_reports` la crea el backend: no está en el esquema de Prisma).
    await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS weekly_reports (
            id TEXT PRIMARY KEY, "userId" TEXT NOT NULL,
            period_start TIMESTAMP(3) NOT NULL, period_end TIMESTAMP(3) NOT NULL,
            summary TEXT NOT NULL, metrics JSONB, sent_at TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW())`);
    await db.$executeRawUnsafe(`DELETE FROM weekly_reports WHERE "userId" = $1`, dueno.id);
    const finDeSemana = cal.inicio - DIA;
    const inicioDeSemana = finDeSemana - 7 * DIA;
    const metricas = {
        periodStart: new Date(inicioDeSemana).toISOString(),
        periodEnd: new Date(finDeSemana).toISOString(),
        totalLeads: 142,
        newLeads: 38,
        leadsByStatus: { CALIENTE: 21, TIBIO: 34, FRIO: 27, FINALIZADO: 12 },
        leadsByScore: { sinScore: 18, bajo: 22, medio: 41, moderado: 29, alto: 20, listo: 12 },
        avgScore: 64,
        topLeads: enLaTienda
            ? [
                  { name: "Valeria Cruz", score: 91, status: "CALIENTE", phone: "573112048801" },
                  { name: "Andrés Pinto", score: 87, status: "CALIENTE", phone: "573202048802" },
              ]
            : [
                  { name: "Pedro Castaño", score: 92, status: "CALIENTE", phone: "573114554410" },
                  { name: "Daniela Mejía", score: 88, status: "CALIENTE", phone: "573207787781" },
              ],
        followUpsSent: 57,
        followUpsPending: 9,
        conversions: 14,
        registrosByTipo: enLaTienda
            ? { PEDIDO: 31, SOLICITUD: 7, RECLAMO: 2 }
            : { RESERVA: 16, SOLICITUD: 9, PEDIDO: 4, RECLAMO: 1 },
        calidad: {
            conversaciones: 48,
            puntajePromedio: 92,
            soloElDueno: false,
            mejor: { asesorId: asesora.id, nombre: ASESORA.nombre, puntaje: 95, conversaciones: 17 },
        },
    };
    await db.$executeRawUnsafe(
        `INSERT INTO weekly_reports (id, "userId", period_start, period_end, summary, metrics, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        `informe-${dueno.id}`,
        dueno.id,
        new Date(inicioDeSemana),
        new Date(finDeSemana),
        enLaTienda
            ? "Semana muy productiva: entraron 38 clientes nuevos y la IA atendió todas las conversaciones al instante. " +
                  "Se cerraron 31 pedidos y se recuperaron 7 carritos abandonados. " +
                  "Los tenis Urban Run y la guía de tallas fueron lo más consultado."
            : "Semana muy productiva: entraron 38 leads nuevos y la IA atendió todas las conversaciones al instante. " +
                  "14 pacientes agendaron su valoración y 21 quedaron calientes para cerrar esta semana. " +
                  "El blanqueamiento y la ortodoncia fueron lo más consultado.",
        JSON.stringify(metricas),
        new Date(finDeSemana + 8 * 3_600_000),
    );

    return { cuenta: dueno.id, asesor: asesora.id, embudoId, etapas, etiquetas: Object.fromEntries(Object.entries(etiquetas).map(([k, v]) => [k, v.id])), servicio: servicio?.id ?? null, calendario: cal };
}

// Como script suelto: `node scripts/video-de-ventas/sembrar.mjs` con
// `EMBUDOS_DB` apuntando al módulo compilado de `lib/embudos-db.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
    const db = new PrismaClient();
    const embudos = await import(process.env.EMBUDOS_DB);
    const ahora = process.env.AHORA_DE_LA_HISTORIA ? Number(process.env.AHORA_DE_LA_HISTORIA) : Date.now();
    const r = await sembrarLaClinica({ db, embudos, ahora });
    console.log(JSON.stringify(r));
    await db.$disconnect();
    process.exit(0);
}
