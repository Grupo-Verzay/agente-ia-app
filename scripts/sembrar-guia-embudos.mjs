/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Embudos, encima de
 * `sembrar-barra.mjs` (que pone la cuenta, su línea y una conversación).
 *
 * Con la forma de una cuenta de verdad:
 *
 * - un equipo de tres —una administradora y dos asesores— con id FIJO (el
 *   color de las iniciales sale del id);
 * - dieciséis conversaciones repartidas por las siete etapas del «Embudo de
 *   ventas», con sus etiquetas y hace cuánto cambiaron de etapa;
 * - un segundo embudo, «Postventa», con sus propias etapas y un asesor que lo
 *   usa, para que el selector de embudo y el filtro de asesor tengan algo que
 *   enseñar;
 * - una cuenta HIJA vinculada, con su propio tablero, que es lo que hace que el
 *   selector de cuenta se pinte;
 * - y tres conversaciones en la papelera de Perdido, vaciadas hace distintos
 *   días, para que «Quedan N días» diga cosas distintas.
 *
 * Los embudos NO se escriben a mano: pasan por `lib/embudos-db.ts`, el mismo
 * camino que la pantalla, compilado para Node. Con un `INSERT` propio la guía
 * enseñaría un embudo que la App no sabe crear.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo, porque las capturas
 * crean, renombran y mueven cosas.
 */
process.env.TZ = "America/Bogota";

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const COMPILADO = path.join(RAIZ, "lib", "__tests__", ".compilado", "guia-embudos");
mkdirSync(COMPILADO, { recursive: true });
const EMBUDOS_DB = path.join(COMPILADO, "embudos-db.mjs");
execFileSync(
    "npx",
    [
        "esbuild", "lib/embudos-db.ts", "--bundle", "--platform=node", "--format=esm",
        `--outfile=${EMBUDOS_DB}`, "--external:@prisma/client", "--external:server-only", "--log-level=error",
    ],
    { cwd: RAIZ, stdio: "inherit" },
);
// `server-only` revienta fuera de Next; aquí no hay navegador al que proteger.
writeFileSync(EMBUDOS_DB, readFileSync(EMBUDOS_DB, "utf8").replace(/^import "server-only";\n/m, ""));
const E = await import(EMBUDOS_DB);

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/embudos",
    title: "Guía de Embudos",
    description: "Aprende a organizar tus conversaciones por etapas en la plataforma",
    url: "/guia/embudos",
});
await db.user.update({ where: { id: dueno.id }, data: { timezone: "America/Bogota", company: "Mi Negocio" } });

/* ── El EQUIPO: con id FIJO, que el color de las iniciales sale de él ────── */
const pass = await bcrypt.hash("banco1234", 10);
const EQUIPO = [
    { id: "guia-embudos-sofia", email: "sofia@banco.test", name: "Sofía Martínez", advisorRole: "administrador" },
    { id: "guia-embudos-laura", email: "laura@banco.test", name: "Laura Gómez", advisorRole: "agente" },
    { id: "guia-embudos-andres", email: "andres@banco.test", name: "Andrés Ruiz", advisorRole: "agente" },
];
// La semilla común crea a Sofía con un id al azar: se quita para que nazca con el fijo.
const conOtroId = await db.user.findMany({
    where: { email: { in: EQUIPO.map((p) => p.email) }, id: { notIn: EQUIPO.map((p) => p.id) } },
    select: { id: true },
});
if (conOtroId.length) {
    const ids = conOtroId.map((u) => u.id);
    await db.session.updateMany({ where: { assignedAdvisorId: { in: ids } }, data: { assignedAdvisorId: null } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
}
for (const p of EQUIPO) {
    await db.user.upsert({
        where: { email: p.email },
        update: { name: p.name, ownerId: dueno.id, advisorRole: p.advisorRole, advisorAvailable: true, status: true },
        create: { ...p, advisorAvailable: true, password: pass, role: "user", status: true, ownerId: dueno.id },
    });
}
const [SOFIA, LAURA, ANDRES] = EQUIPO.map((p) => p.id);

/* ── La cuenta HIJA, vinculada bajo la del dueño ───────────────────────── */
const hija = await db.user.upsert({
    where: { email: "norte@banco.test" },
    update: { name: "Sucursal Norte", company: "Sucursal Norte", status: true },
    create: {
        id: "guia-embudos-norte",
        email: "norte@banco.test",
        name: "Sucursal Norte",
        company: "Sucursal Norte",
        password: pass,
        role: "user",
        status: true,
        plan: "personalizado",
    },
});
await db.linkedAccount.upsert({
    where: { masterUserId_linkedUserId: { masterUserId: dueno.id, linkedUserId: hija.id } },
    update: {},
    create: { masterUserId: dueno.id, linkedUserId: hija.id },
});

/* ── Limpiar lo de una vuelta anterior ──────────────────────────────────── */
for (const cuenta of [dueno.id, hija.id]) {
    for (const e of await E.losEmbudosDe(cuenta).catch(() => [])) await E.borrarEmbudo(cuenta, e.id);
}
await db.$executeRawUnsafe(`DELETE FROM "embudo_vaciadas" WHERE "cuentaId" IN ($1, $2)`, dueno.id, hija.id).catch(() => {});
await db.$executeRawUnsafe(`DELETE FROM "embudo_cuenta_recordada"`).catch(() => {});
await db.session.deleteMany({ where: { userId: { in: [dueno.id, hija.id] } } });
await db.tag.deleteMany({ where: { userId: { in: [dueno.id, hija.id] } } });

/* ── Etiquetas ──────────────────────────────────────────────────────────── */
const ETIQUETAS = {
    VIP: "#A855F7",
    Mayorista: "#3B82F6",
    Urgente: "#EF4444",
    Referido: "#10B981",
};
const tag = {};
for (const [i, [name, color]] of Object.entries(ETIQUETAS).entries()) {
    tag[name] = await db.tag.create({
        data: { userId: dueno.id, name, slug: name.toLowerCase(), color, order: i },
    });
}

/* ── Las CONVERSACIONES ─────────────────────────────────────────────────── */
const INSTANCIA = "inst-banco-1";
const ahora = Date.now();
const haceHoras = (h) => new Date(ahora - h * 3_600_000);

// [número, nombre, asesor, etapa del Embudo de ventas (o de Postventa), etiquetas, hace cuántas horas]
const VENTAS = [
    ["573001112233", "Mariana Toro", LAURA, "Nuevo", ["Referido"], 1],
    ["573014445566", "Andrés Pérez", null, "Nuevo", [], 3],
    ["573105556677", "Valentina Ruiz", SOFIA, "Nuevo", [], 5],
    ["573157778899", "Carlos Gómez", LAURA, "Contactado", ["Mayorista"], 8],
    ["573201234567", "Laura Méndez", null, "Contactado", [], 20],
    ["573186543210", "Felipe Ríos", SOFIA, "Interesado", ["VIP"], 26],
    ["573112223344", "Paula Castro", LAURA, "Interesado", ["Urgente", "VIP"], 30],
    ["573223334455", "Jorge Salazar", SOFIA, "Cotizado", ["Mayorista"], 50],
    ["573004446677", "Camila Herrera", LAURA, "Cotizado", [], 70],
    ["573165557788", "Diego Morales", null, "Negociación", ["VIP"], 72],
    ["573176668899", "Natalia Vargas", SOFIA, "Ganado", ["Referido"], 96],
    ["573187779900", "Sebastián León", LAURA, "Ganado", [], 120],
    ["573198880011", "Lucía Cárdenas", LAURA, "Perdido", [], 140],
    ["573209991122", "Martín Ospina", null, "Perdido", [], 160],
];
// Las que estaban en Perdido y ya se vaciaron: [número, nombre, días desde que se vaciaron]
const EN_LA_PAPELERA = [
    ["573011231234", "Ricardo Peña", 2],
    ["573022342345", "Gloria Ramírez", 9],
    ["573033453456", "Hernán Duque", 21],
];
const POSTVENTA = [
    ["573044564567", "Daniela Suárez", ANDRES, "Nuevo", ["VIP"], 4],
    ["573055675678", "Óscar Mejía", ANDRES, "Entregado", [], 30],
    ["573066786789", "Isabel Pardo", ANDRES, "En seguimiento", ["Referido"], 60],
    ["573077897890", "Tomás Arango", ANDRES, "Recompra", [], 100],
];
const NORTE = [
    ["573088908901", "Panadería La Espiga", null, "Nuevo", [], 2],
    ["573099019012", "Distribuidora Andina", null, "Interesado", [], 40],
    ["573100120123", "Ferretería El Tornillo", null, "Ganado", [], 90],
];

async function conversacion(cuenta, [numero, nombre, asesor, , etiquetas = [], horas = 10]) {
    const s = await db.session.create({
        data: {
            userId: cuenta,
            remoteJid: `${numero}@s.whatsapp.net`,
            pushName: nombre,
            instanceId: INSTANCIA,
            status: true,
            assignedAdvisorId: asesor,
            leadStatusUpdatedAt: haceHoras(horas),
        },
    });
    for (const t of etiquetas) await db.sessionTag.create({ data: { sessionId: s.id, tagId: tag[t].id } });
    return s;
}

/* ── Los EMBUDOS, por el mismo camino que la pantalla ───────────────────── */
const ventasId = await E.asegurarElEmbudoPorDefecto({ cuentaId: dueno.id, creadoPorId: dueno.id });
const [ventas] = (await E.losEmbudosDe(dueno.id)).filter((e) => e.nombre === E.EMBUDO_POR_DEFECTO);
const embudoVentasId = typeof ventasId === "string" ? ventasId : ventas.id;

const postventaId = await E.crearEmbudo({ cuentaId: dueno.id, nombre: "Postventa", creadoPorId: dueno.id });
// Postventa: Nuevo, Entregado, En seguimiento, Recompra, Ganado, Perdido.
const etapasPost = await E.lasEtapasDe([postventaId]);
const sis = (s) => etapasPost.find((e) => e.sistema === s);
await E.guardarEtapas(dueno.id, postventaId, [
    { id: sis("nuevo").id, nombre: "Nuevo", color: null, sistema: "nuevo" },
    { id: null, nombre: "Entregado", color: "#3B82F6", sistema: null },
    { id: null, nombre: "En seguimiento", color: "#F59E0B", sistema: null },
    { id: null, nombre: "Recompra", color: "#A855F7", sistema: null },
    { id: sis("ganado").id, nombre: "Ganado", color: null, sistema: "ganado" },
    { id: sis("perdido").id, nombre: "Perdido", color: null, sistema: "perdido" },
]);
await E.asignarEmbudos(dueno.id, [{ personaId: ANDRES, embudoId: postventaId }]);

async function colocar(cuenta, embudoId, filas) {
    const etapas = await E.lasEtapasDe([embudoId]);
    for (const fila of filas) {
        const s = await conversacion(cuenta, fila);
        const etapa = etapas.find((e) => e.nombre === fila[3]);
        if (!etapa) throw new Error(`No hay etapa «${fila[3]}» en el embudo`);
        await E.moverConversacion({ sessionId: s.id, embudoId, etapaId: etapa.id, movidoPorId: dueno.id });
    }
    return etapas;
}

const etapasVentas = await colocar(dueno.id, embudoVentasId, VENTAS);
await colocar(dueno.id, postventaId, POSTVENTA);

// La papelera: se ponen en Perdido y se vacían por el camino de la pantalla, y
// después se les corre la fecha para que cada una diga otros días.
const perdido = etapasVentas.find((e) => e.sistema === "perdido");
const vaciadas = [];
for (const [numero, nombre, dias] of EN_LA_PAPELERA) {
    const s = await conversacion(dueno.id, [numero, nombre, null, "Perdido", [], 200]);
    await E.moverConversacion({ sessionId: s.id, embudoId: embudoVentasId, etapaId: perdido.id, movidoPorId: dueno.id });
    vaciadas.push([s.id, dias]);
}
await db.$executeRawUnsafe(
    `INSERT INTO "embudo_vaciadas" ("sessionId","cuentaId","embudoId","etapaId","nombre","remoteJid","vaciadoPorId","vaciadoEn")
     SELECT s."id", s."userId", $1, $2, s."pushName", s."remoteJid", $3, NOW()
     FROM "Session" s WHERE s."id" = ANY($4::int[])`,
    embudoVentasId,
    perdido.id,
    dueno.id,
    vaciadas.map(([id]) => id),
);
for (const [id, dias] of vaciadas) {
    await db.$executeRawUnsafe(
        `UPDATE "embudo_vaciadas" SET "vaciadoEn" = NOW() - make_interval(days => $2::int) WHERE "sessionId" = $1`,
        id,
        dias,
    );
}

// La cuenta hija, con su propio embudo de ventas.
const norteId = await E.asegurarElEmbudoPorDefecto({ cuentaId: hija.id, creadoPorId: dueno.id });
const [norte] = await E.losEmbudosDe(hija.id);
await colocar(hija.id, typeof norteId === "string" ? norteId : norte.id, NORTE);

console.log(
    JSON.stringify({
        ventas: VENTAS.length,
        postventa: POSTVENTA.length,
        papelera: EN_LA_PAPELERA.length,
        norte: NORTE.length,
        equipo: EQUIPO.length,
        modulos: MENU_DE_UN_CLIENTE.length,
    }),
);
await db.$disconnect();
