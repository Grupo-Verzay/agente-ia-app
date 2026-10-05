/**
 * La cita de la prueba del VIDEO de Verzy, encima de `sembrar-guia-chats.mjs`
 * (la cuenta, su línea y la conversación de Mariana Toro). Escribe el id de la
 * cuenta y de la cita en una línea JSON: el banco los usa para firmar.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const ses = await db.session.findFirst({ where: { pushName: "Mariana Toro" }, select: { id: true, userId: true } });
if (!ses) throw new Error("No está la conversación de Mariana Toro: corre antes sembrar-guia-chats.mjs");
await db.user.update({ where: { id: ses.userId }, data: { company: "Verzay Ventas" } });
const inicio = new Date(Date.now() + 5 * 60_000);
const cita = await db.appointment.create({
    data: {
        userId: ses.userId, sessionId: ses.id, clientName: "Mariana Toro",
        startTime: inicio, endTime: new Date(inicio.getTime() + 30 * 60_000), timezone: "America/Bogota",
    },
    select: { id: true },
});
// Los seis planes, activos: la landing de planes (/planes/nivel-N) los lee del panel.
const NIVELES = [["lite", 19, "Lite"], ["basico", 29, "Básico"], ["intermedio", 49, "Estárter"], ["avanzado", 79, "Esencial"], ["enterprise", 149, "Business"], ["personalizado", 299, "A la medida"]];
for (const [plan, priceUSD, name] of NIVELES) {
    const ya = await db.subscriptionPlan.findFirst({ where: { plan, assistanceType: "IA" } });
    if (!ya) await db.subscriptionPlan.create({ data: { plan, assistanceType: "IA", priceUSD, credits: 1000, name, features: ["Chats"], isActive: true } });
}
console.log(JSON.stringify({ cuentaId: ses.userId, citaId: cita.id }));
await db.$disconnect();
