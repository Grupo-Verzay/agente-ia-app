/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Calificación, encima de
 * `sembrar-barra.mjs` (que pone la cuenta y su línea).
 *
 * Trece contactos repartidos por las seis columnas (`guia-calificacion-datos.mjs`):
 * unos ya calificados en los cinco rangos de puntaje —para que el filtro tenga
 * algo que filtrar—, otros sin calificar pero con su reporte, que es lo que la
 * IA lee para darles un puntaje, algunos con seguimientos pendientes (la
 * campana) y una automatización de ejemplo en la columna Caliente. Y una cuenta
 * de IA con créditos, para que «Calificar con IA» funcione: lo que contesta la
 * IA lo pone `fingido-guia-calificacion.mjs`.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo, porque las capturas
 * mueven, califican y crean, y el vídeo tiene que salir del mismo punto de
 * partida.
 */
import { PrismaClient } from "@prisma/client";
import { sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";
import { AUTOMATIZACION_DE_EJEMPLO, CONTACTOS, ETIQUETAS } from "./guia-calificacion-datos.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/crm/kanban",
    title: "Guía de Calificación",
    description: "Aprende a calificar tus contactos por etapa en la plataforma",
    url: "/guia/calificacion",
});

const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const slugDe = (s) => sinTildes(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

await db.stageAutomation.deleteMany({ where: { userId: dueno.id } });
await db.tag.deleteMany({ where: { userId: dueno.id } });
const etiquetas = {};
for (const [i, t] of ETIQUETAS.entries()) {
    etiquetas[t.name] = await db.tag.create({
        data: { userId: dueno.id, name: t.name, slug: slugDe(t.name), color: t.color, order: i },
    });
}

/* Los CONTACTOS: el primero de la lista, el más reciente. */
await db.session.deleteMany({ where: { userId: dueno.id } });
const ahora = Date.now();
for (const [i, c] of CONTACTOS.entries()) {
    const cuando = new Date(ahora - (i + 1) * 53 * 60_000);
    const remoteJid = `${c.tel}@s.whatsapp.net`;
    const s = await db.session.create({
        data: {
            userId: dueno.id,
            remoteJid,
            pushName: c.nombre,
            instanceId: "inst-banco-1",
            status: true,
            leadStatus: c.estado ?? null,
            leadStatusReason: c.razon ?? null,
            leadStatusUpdatedAt: c.estado ? cuando : null,
            leadScore: c.puntaje ?? null,
            leadScoreReason: c.puntaje !== undefined ? c.motivo : null,
            // Recientes: «Calificar con IA» se salta lo calificado en las últimas 24 h.
            leadScoredAt: c.puntaje !== undefined ? new Date(ahora - 60 * 60_000) : null,
            createdAt: cuando,
            updatedAt: cuando,
        },
    });
    for (const nombre of c.etiquetas) {
        await db.sessionTag.create({ data: { sessionId: s.id, tagId: etiquetas[nombre].id } });
    }
    if (c.resumen) {
        await db.registro.create({
            data: { tipo: "REPORTE", resumen: c.resumen, sessionId: s.id, userId: dueno.id, fecha: cuando },
        });
    }
    for (let k = 0; k < (c.seguimientos ?? 0); k++) {
        await db.crmFollowUp.create({
            data: {
                sessionId: s.id,
                userId: dueno.id,
                remoteJid,
                instanceId: "inst-banco-1",
                leadStatusSnapshot: c.estado ?? "TIBIO",
                ruleKey: `guia-${k}`,
                sourceHash: `guia-${s.id}-${k}`,
                scheduledFor: new Date(ahora + (k + 1) * 86_400_000),
            },
        });
    }
}

/* La AUTOMATIZACIÓN de ejemplo de la columna Caliente. */
const auto = await db.stageAutomation.create({
    data: { userId: dueno.id, stage: AUTOMATIZACION_DE_EJEMPLO.etapa, name: AUTOMATIZACION_DE_EJEMPLO.nombre, enabled: true },
});
for (const [i, a] of AUTOMATIZACION_DE_EJEMPLO.acciones.entries()) {
    const config = a.etiqueta ? { tagId: etiquetas[a.etiqueta].id } : a.config;
    await db.stageAutomationAction.create({
        data: { automationId: auto.id, type: a.tipo, order: i, config, delayMinutes: a.espera },
    });
}

/*
 * La IA de la cuenta: proveedor OpenAI con una clave de EJEMPLO (la contesta
 * la IA fingida) y créditos de sobra, que es lo que pide la puntuación.
 */
const proveedor = await db.aiProvider.upsert({
    where: { name: "openai" },
    update: {},
    create: { name: "openai", aiModel: "gpt-4o-mini" },
});
const modelo = await db.aiModel.upsert({
    where: { providerId_name: { providerId: proveedor.id, name: "gpt-4o-mini" } },
    update: {},
    create: { providerId: proveedor.id, name: "gpt-4o-mini" },
});
await db.userAiConfig.upsert({
    where: { userId_providerId: { userId: dueno.id, providerId: proveedor.id } },
    update: { apiKey: "sk-ejemplo-de-la-guia", isActive: true },
    create: { userId: dueno.id, providerId: proveedor.id, apiKey: "sk-ejemplo-de-la-guia", isActive: true },
});
await db.user.update({
    where: { id: dueno.id },
    data: { defaultProviderId: proveedor.id, defaultAiModelId: modelo.id },
});
await db.iaCredit.upsert({
    where: { userId: dueno.id },
    update: { total: 5000, used: 0 },
    create: { userId: dueno.id, total: 5000, used: 0, renewalDate: new Date(ahora + 30 * 86_400_000) },
});

console.log(JSON.stringify({ contactos: CONTACTOS.length, automatizaciones: 1 }));
await db.$disconnect();
