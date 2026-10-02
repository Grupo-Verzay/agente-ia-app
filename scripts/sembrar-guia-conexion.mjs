/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Conexión y Ajustes
 * (`/profile`), encima de `sembrar-barra.mjs` (que pone la cuenta, su línea de
 * WhatsApp por QR y una conversación).
 *
 * Con la forma de una cuenta que ya trabaja: los canales encendidos (así se
 * ven sus tarjetas y no el candado), un servidor de WhatsApp de EJEMPLO
 * (`waha.minegocio.co`, que contesta `fingido-guia-conexion.mjs` dentro de
 * `next start`), una clave de IA de ejemplo, dos contactos de notificación,
 * la zona horaria, la empresa, el enlace de Google Maps, los tiempos y las
 * frases, créditos y la fecha de pago.
 *
 * Nada de esto es de nadie: la guía es pública.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 */
process.env.TZ = "America/Bogota";

import { PrismaClient } from "@prisma/client";
import { sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";
import { SERVIDOR_DE_EJEMPLO, SESION_DE_LLAMADAS } from "./fingido-guia-conexion.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/profile",
    title: "Guía de Conexión y Ajustes",
    description: "Aprende a conectar tus canales y ajustar tu cuenta en la plataforma",
    url: "/guia/conexion",
});

await db.user.update({
    where: { id: dueno.id },
    data: {
        company: "Café de la Montaña",
        timezone: "America/Bogota",
        mapsUrl: "https://maps.google.com/?q=4.6097,-74.0817",
        onCalls: true,
        onWhatsappCloud: true,
        onTelegram: true,
        onFacebook: true,
        onInstagram: true,
        autoReactivate: "30",
        delayTimeGpt: "5",
        delSeguimiento: "Ya no deseo recibir mensajes",
        astraCallsSid: SESION_DE_LLAMADAS,
        notificationNumber: "+573001234567",
    },
});

/* El asistente de voz de las llamadas, sobre la línea por QR. */
await db.instancia.updateMany({
    where: { userId: dueno.id },
    data: { voicebotEnabled: true, voicebotVoice: "cedar", voicebotTransferTo: "+573001112233" },
});

/* La frase de reactivación vive en `Pausar` (tipo «abrir»). */
await db.pausar.deleteMany({ where: { userId: dueno.id } });
await db.pausar.create({
    data: { userId: dueno.id, tipo: "abrir", mensaje: "Fue un gusto ayudarte. ¡Escríbenos cuando quieras!", baseurl: "", apikeyId: "", instanciaId: "" },
});

/* El servidor de WhatsApp de EJEMPLO: sin él la línea por QR sale como sin
   conectar. Lo contesta el doble cargado en `next start`. */
await db.siteConfig.upsert({
    where: { id: 1 },
    update: { wahaUrl: SERVIDOR_DE_EJEMPLO, wahaApiKey: "clave-de-ejemplo" },
    create: { id: 1, wahaUrl: SERVIDOR_DE_EJEMPLO, wahaApiKey: "clave-de-ejemplo" },
});

/* La IA: un proveedor con su modelo y una clave de EJEMPLO. Al navegador solo
   le llegan sus cuatro últimos caracteres. */
const proveedor = await db.aiProvider.upsert({
    where: { name: "openai" },
    update: {},
    create: { name: "openai", description: "OpenAI", aiModel: "gpt-4o-mini" },
});
await db.aiModel.upsert({
    where: { providerId_name: { providerId: proveedor.id, name: "gpt-4o-mini" } },
    update: {},
    create: { providerId: proveedor.id, name: "gpt-4o-mini", modelName: "gpt-4o-mini" },
});
await db.userAiConfig.deleteMany({ where: { userId: dueno.id } });
await db.userAiConfig.create({
    data: { userId: dueno.id, providerId: proveedor.id, apiKey: "sk-ejemplo-de-la-guia-0000000000000000AbCd", isActive: true },
});

/* Los contactos que reciben los avisos de la cuenta. */
await db.userNotificationContact.deleteMany({ where: { userId: dueno.id } });
await db.userNotificationContact.create({ data: { userId: dueno.id, phone: "+573001112233", label: "Gerencia" } });
await db.userNotificationContact.create({ data: { userId: dueno.id, phone: "+573004445566", label: "Ventas" } });

/* Créditos y facturación. */
const enUnMes = new Date();
enUnMes.setDate(enUnMes.getDate() + 24);
await db.iaCredit.upsert({
    where: { userId: dueno.id },
    update: { total: 12000, used: 3085 * 3364, renewalDate: enUnMes },
    create: { userId: dueno.id, total: 12000, used: 3085 * 3364, renewalDate: enUnMes },
});
await db.userBilling.upsert({
    where: { userId: dueno.id },
    update: { price: 250000, currencyCode: "COP", dueDate: enUnMes, billingStatus: "PAID", accessStatus: "ACTIVE", lastPaymentAt: new Date(), paymentNotes: "Transferencia Bancolombia" },
    create: { userId: dueno.id, price: 250000, currencyCode: "COP", dueDate: enUnMes, billingStatus: "PAID", accessStatus: "ACTIVE", lastPaymentAt: new Date(), paymentNotes: "Transferencia Bancolombia" },
});

console.log(JSON.stringify({ cuenta: dueno.id }));
await db.$disconnect();
