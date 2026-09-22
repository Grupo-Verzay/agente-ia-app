/**
 * Encima de `sembrar-barra.mjs`: tres llamadas en `chat_messages`, para que
 * CRM › Llamadas pinte su tabla (sin filas pinta «No hay llamadas» y no hay
 * cabecera que medir). Una con detalle largo y resultado, que son las dos
 * columnas que se reparten el ancho.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const dueno = await db.user.findUniqueOrThrow({ where: { email: "jefe@banco.test" } });
await db.chatMessage.deleteMany({ where: { userId: dueno.id, messageType: "call" } });

const ahora = Date.now();
const llamadas = [
    { id: "CALL1", jid: "573001112233@s.whatsapp.net", s: 187, disp: "interested", resumen: "El cliente pregunta por los planes y pide una cotización para su negocio de repuestos." },
    { id: "CALL2", jid: "573009998877@s.whatsapp.net", s: 42, disp: null, resumen: null },
    { id: "CALL3", jid: "573115556644@s.whatsapp.net", s: 0, disp: null, resumen: "No contestó." },
];
for (const [i, c] of llamadas.entries()) {
    const cuando = new Date(ahora - (i + 1) * 3600_000);
    await db.chatMessage.create({
        data: {
            userId: dueno.id,
            instanceName: "BANCO_VENTAS",
            instanceType: "waha",
            remoteJid: c.jid,
            messageId: c.id,
            fromMe: true,
            messageType: "call",
            content: "Llamada",
            raw: { call: { direction: "outgoing", durationSecs: c.s, status: "ended", disposition: c.disp, summary: c.resumen } },
            messageTimestamp: cuando,
        },
    });
}
await db.$disconnect();
