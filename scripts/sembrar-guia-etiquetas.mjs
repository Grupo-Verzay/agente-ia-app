/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Etiquetas, encima de
 * `sembrar-barra.mjs` (que pone la cuenta y su línea).
 *
 * Cinco etiquetas y doce contactos repartidos por ellas (`guia-etiquetas-datos.mjs`):
 * unos ya calificados en los cinco rangos de puntaje —para que el filtro tenga
 * algo que filtrar— y otros sin calificar pero con su reporte, que es lo que la
 * IA lee para darles un puntaje. Y una cuenta de IA con créditos, para que
 * «Calificar con IA» funcione: lo que contesta la IA lo pone
 * `fingido-guia-etiquetas.mjs`.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo, porque las capturas
 * crean, editan, mueven y califican, y el vídeo tiene que salir del mismo punto
 * de partida.
 */
import { PrismaClient } from "@prisma/client";
import { sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";
import { CONTACTOS, ETIQUETAS } from "./guia-etiquetas-datos.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/tags",
    title: "Guía de Etiquetas",
    description: "Aprende a organizar tus contactos con etiquetas en la plataforma",
    url: "/guia/etiquetas",
});

const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const slugDe = (s) => sinTildes(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* Las ETIQUETAS, en su orden. */
await db.tag.deleteMany({ where: { userId: dueno.id } });
const etiquetas = {};
for (const [i, t] of ETIQUETAS.entries()) {
    etiquetas[t.name] = await db.tag.create({
        data: { userId: dueno.id, name: t.name, slug: slugDe(t.name), color: t.color, order: i },
    });
}

/* Los CONTACTOS: el más reciente arriba en cada columna. */
await db.session.deleteMany({ where: { userId: dueno.id } });
const ahora = Date.now();
for (const [i, c] of CONTACTOS.entries()) {
    const cuando = new Date(ahora - (i + 1) * 47 * 60_000);
    const s = await db.session.create({
        data: {
            userId: dueno.id,
            remoteJid: `${c.tel}@s.whatsapp.net`,
            pushName: c.nombre,
            instanceId: "inst-banco-1",
            status: true,
            leadStatus: c.estado ?? null,
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

console.log(JSON.stringify({ etiquetas: ETIQUETAS.length, contactos: CONTACTOS.length }));
await db.$disconnect();
