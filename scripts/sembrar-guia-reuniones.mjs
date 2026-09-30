/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Reuniones, encima de
 * `sembrar-barra.mjs` (la cuenta y su equipo). El MARCO de la pantalla —la
 * cuenta de un cliente, su menú y la barra de arriba— es el de todas las guías
 * (`sembrar-marco-de-la-guia.mjs`): solo cambia lo de dentro.
 *
 * Con una lista vacía una guía de Reuniones no enseña nada, así que la cuenta
 * trae lo que tiene una cuenta que se reúne de verdad:
 *
 * - tres reuniones ABIERTAS, con las tres caducidades que más se usan (un día,
 *   siete días y «no caduca») y dos anfitrionas distintas;
 * - cuatro PASADAS con su gente —una con un invitado de fuera, otra en la que
 *   no entró nadie—, fechadas hacia atrás para que la duración y el orden
 *   digan algo;
 * - y dos GRABACIONES: una de video con su transcripción y sus puntos
 *   tratados, y una de solo audio sin transcribir, que enseña el botón con su
 *   precio.
 *
 * Las tablas de las reuniones las crea el propio módulo de la App
 * (`lib/salas-de-video-db.ts`) con `CREATE TABLE IF NOT EXISTS`, igual que en
 * producción: por eso se compila y se le llama, en vez de escribir aquí otra
 * copia de su esquema, que se quedaría atrás el día que cambie.
 *
 * Los ficheros de las grabaciones los sirve el script de capturas en
 * `S3_PUBLIC_URL` (un servidor de ficheros de usar y tirar): la fila solo
 * guarda la dirección.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

/*
 * La zona del NAVEGADOR de las capturas. La semilla dice «a las 10:00» con
 * `setHours`, que usa la zona del proceso, y en el contenedor esa es UTC: las
 * reuniones de la mañana salían a las 5:00. Node la toma al asignarla.
 */
process.env.TZ = "America/Bogota";

/*
 * El módulo de salas, compilado para Node. Lleva `import "server-only"`, que
 * fuera de Next revienta al cargarse: se quita del compilado (en la App es lo
 * que impide que llegue al navegador; aquí no hay navegador).
 */
const RAIZ = path.resolve(import.meta.dirname, "..");
const COMPILADO = path.join(RAIZ, "lib", "__tests__", ".compilado", "guia-reuniones");
mkdirSync(COMPILADO, { recursive: true });
const SALAS_DB = path.join(COMPILADO, "salas-de-video-db.mjs");
execFileSync(
    "npx",
    [
        "esbuild", "lib/salas-de-video-db.ts", "--bundle", "--platform=node", "--format=esm",
        `--outfile=${SALAS_DB}`, "--external:@prisma/client", "--external:server-only", "--log-level=error",
    ],
    { cwd: RAIZ, stdio: "inherit" },
);
writeFileSync(SALAS_DB, readFileSync(SALAS_DB, "utf8").replace(/^import "server-only";\n/m, ""));
const salas = await import(SALAS_DB);

const db = new PrismaClient();

/** Dónde se sirven los ficheros de las grabaciones de ejemplo. */
export const PUBLICO = (process.env.S3_PUBLIC_URL ?? "http://localhost:9000").replace(/\/$/, "");

/*
 * El marco, con el módulo de GRABACIÓN: se vende aparte y lo decide la ruta
 * `/reuniones/grabaciones` (`laCuentaPuedeGrabar`). Sin un módulo que la lleve,
 * el botón de grabar y la pestaña Grabaciones no salen y la guía no podría
 * enseñarlos. Va escondido del menú: el menú de la guía es el de un cliente.
 */
const marco = await sembrarElMarco(
    db,
    {
        path: "/reuniones",
        title: "Guía de Reuniones",
        description: "Aprende a hacer videollamadas con tu equipo y clientes en la plataforma",
        url: "/guia/reuniones",
    },
    { modulosQueSeVenden: [{ label: "Grabaciones", route: "/reuniones/grabaciones", icon: "CalendarDaysIcon" }] },
);
const sofia = await db.user.findUniqueOrThrow({ where: { email: "sofia@banco.test" } });

/*
 * En una reunión sale el nombre de la PERSONA en su recuadro. «Mi Negocio»
 * (lo que deja el marco) es el nombre de la cuenta, y un recuadro que dice
 * «Mi Negocio» no se lee como una persona. La empresa sigue siendo
 * «Mi Negocio»: es lo que ve el cliente como cuenta.
 */
const jefe = await db.user.update({ where: { id: marco.id }, data: { name: "Andrea Torres", company: "Mi Negocio" } });
await db.user.update({ where: { id: sofia.id }, data: { name: "Sofía Rojas" } });

// Deja las tablas creadas (y vacías de otras vueltas).
await salas.lasSalasVivasDeLaFamilia([jefe.id]);
await db.$executeRawUnsafe(`DELETE FROM "grabaciones_de_reunion" WHERE "cuentaId" = $1`, jefe.id);
await db.$executeRawUnsafe(
    `DELETE FROM "sala_participantes" WHERE "salaId" IN (SELECT "id" FROM "salas_de_video" WHERE "cuentaId" = $1)`,
    jefe.id,
);
await db.$executeRawUnsafe(
    `DELETE FROM "sala_mensajes" WHERE "salaId" IN (SELECT "id" FROM "salas_de_video" WHERE "cuentaId" = $1)`,
    jefe.id,
);
await db.$executeRawUnsafe(`DELETE FROM "salas_de_video" WHERE "cuentaId" = $1`, jefe.id);

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const ahora = Date.now();

/** Una fecha de hace `dias` días a la hora `hora`, en la zona del navegador de las capturas (ver `process.env.TZ` arriba). */
function haceDias(dias, hora, minuto = 0) {
    const d = new Date(ahora - dias * DIA);
    d.setHours(hora, minuto, 0, 0);
    return d;
}

async function unaSala({ titulo, anfitrion, expiraEn, creadoEn }) {
    const s = await salas.crearLaSala({
        cuentaId: jefe.id,
        canalId: null,
        anfitrionId: anfitrion.id,
        anfitrionNombre: anfitrion.name,
        titulo,
        expiraEn,
    });
    if (creadoEn) {
        await db.$executeRawUnsafe(`UPDATE "salas_de_video" SET "creadoEn" = $2 WHERE "id" = $1`, s.id, creadoEn);
    }
    return s;
}

const andrea = { id: jefe.id, name: "Andrea Torres" };
const sofiaRojas = { id: sofia.id, name: "Sofía Rojas" };

/* ── Las ABIERTAS ────────────────────────────────────────────────────────
 * Van de la más vieja a la más nueva: la lista las ordena al revés, por fecha
 * de creación, así que la de arriba es la última que se abrió. */
await unaSala({
    titulo: "Atención a clientes",
    anfitrion: andrea,
    expiraEn: null,
    creadoEn: new Date(ahora - 20 * DIA),
});
await unaSala({
    titulo: "Reunión semanal del equipo",
    anfitrion: sofiaRojas,
    expiraEn: new Date(ahora + 20 * HORA),
    creadoEn: new Date(ahora - 4 * HORA),
});
await unaSala({
    titulo: "Revisión de la propuesta",
    anfitrion: andrea,
    expiraEn: new Date(ahora + 6 * DIA),
    creadoEn: new Date(ahora - 1 * DIA),
});

/* ── Las PASADAS ─────────────────────────────────────────────────────────
 * Caducadas o revocadas, con su gente. La duración la calcula la pantalla
 * desde que entra la primera persona hasta el último latido
 * (`lib/reuniones-de-la-cuenta.ts`), así que se siembran esas tres horas. */
async function unaPasada({ titulo, anfitrion, dias, hora, minutos, gente, revocada = false }) {
    const creadoEn = haceDias(dias, hora - 1);
    const s = await unaSala({ titulo, anfitrion, expiraEn: haceDias(dias, hora + 3), creadoEn });
    if (revocada) {
        await db.$executeRawUnsafe(`UPDATE "salas_de_video" SET "revocadaEn" = $2 WHERE "id" = $1`, s.id, haceDias(dias, hora + 2));
    }
    const empieza = haceDias(dias, hora);
    for (const [i, g] of gente.entries()) {
        const entra = new Date(empieza.getTime() + i * 2 * MIN);
        const sale = new Date(empieza.getTime() + minutos * MIN - (gente.length - 1 - i) * MIN);
        await db.$executeRawUnsafe(
            `INSERT INTO "sala_participantes"
                ("id", "salaId", "personaId", "invitadoToken", "nombre", "esInvitado", "estado",
                 "creadoEn", "entradoEn", "vistoEn", "salidoEn", "motivoDeSalida")
             VALUES ($1, $2, $3, $4, $5, $6, 'fuera', $7, $7, $8, $8, 'salio')`,
            `p-${s.id}-${i}`,
            s.id,
            g.personaId ?? null,
            g.personaId ? null : `tok-${s.id}-${i}`,
            g.nombre,
            !g.personaId,
            entra,
            sale,
        );
    }
    return s;
}

const capacitacion = await unaPasada({
    titulo: "Capacitación del equipo",
    anfitrion: andrea,
    dias: 2,
    hora: 10,
    minutos: 45,
    gente: [{ personaId: jefe.id, nombre: "Andrea Torres" }, { personaId: sofia.id, nombre: "Sofía Rojas" }],
});
await unaPasada({
    titulo: "Demo con Óptica Visión",
    anfitrion: andrea,
    dias: 5,
    hora: 15,
    minutos: 28,
    gente: [{ personaId: jefe.id, nombre: "Andrea Torres" }, { nombre: "Mariana Toro" }],
    revocada: true,
});
await unaPasada({
    titulo: "Seguimiento del pedido",
    anfitrion: sofiaRojas,
    dias: 9,
    hora: 11,
    minutos: 0,
    gente: [],
});
const revision = await unaPasada({
    titulo: "Revisión semanal",
    anfitrion: andrea,
    dias: 12,
    hora: 9,
    minutos: 65,
    gente: [
        { personaId: jefe.id, nombre: "Andrea Torres" },
        { personaId: sofia.id, nombre: "Sofía Rojas" },
        { nombre: "Andrés Gómez" },
    ],
});

/* ── Las GRABACIONES ─────────────────────────────────────────────────────
 * Los ficheros los pone el script de capturas en el servidor de usar y
 * tirar; aquí va la fila, con el peso y la duración de una reunión de verdad
 * (45 min de video y 65 min de audio). */
const RESUMEN = [
    "• Se presentó el catálogo nuevo y los precios de temporada.",
    "• Sofía se encarga de responder las cotizaciones pendientes antes del viernes.",
    "• Los pedidos de más de 20 unidades pasan a revisión antes de confirmarse.",
    "• Próxima capacitación: el martes a las 10:00.",
].join("\n");
const TRANSCRIPCION =
    "Andrea: Buenos días a todos, hoy vamos a repasar el catálogo nuevo. " +
    "Sofía: Perfecto, ya tengo las cotizaciones que quedaron pendientes de la semana pasada. " +
    "Andrea: Muy bien. Los pedidos grandes, de más de veinte unidades, los revisamos antes de confirmarlos. " +
    "Sofía: De acuerdo, los marco en la bandeja para no perderlos. " +
    "Andrea: Nos vemos el martes a las diez para la siguiente capacitación.";

await db.$executeRawUnsafe(
    `INSERT INTO "grabaciones_de_reunion"
        ("id", "salaId", "cuentaId", "salaTitulo", "pedidaPorId", "pedidaPorNombre", "modo", "estado",
         "audioUrl", "audioBytes", "videoUrl", "videoBytes", "segundos", "transcripcion", "resumen",
         "transcritaEn", "creadaEn", "terminadaEn")
     VALUES ($1, $2, $3, $4, $5, $6, 'video', 'lista', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    "grab-guia-capacitacion",
    capacitacion.id,
    jefe.id,
    "Capacitación del equipo",
    jefe.id,
    "Andrea Torres",
    `${PUBLICO}/guia-reuniones/capacitacion.webm`,
    10_800_000,
    `${PUBLICO}/guia-reuniones/capacitacion-video.webm`,
    642_000_000,
    45 * 60,
    TRANSCRIPCION,
    RESUMEN,
    haceDias(2, 12),
    haceDias(2, 10, 2),
    haceDias(2, 10, 47),
);
await db.$executeRawUnsafe(
    `INSERT INTO "grabaciones_de_reunion"
        ("id", "salaId", "cuentaId", "salaTitulo", "pedidaPorId", "pedidaPorNombre", "modo", "estado",
         "audioUrl", "audioBytes", "segundos", "creadaEn", "terminadaEn")
     VALUES ($1, $2, $3, $4, $5, $6, 'audio', 'lista', $7, $8, $9, $10, $11)`,
    "grab-guia-revision",
    revision.id,
    jefe.id,
    "Revisión semanal",
    sofia.id,
    "Sofía Rojas",
    `${PUBLICO}/guia-reuniones/revision.webm`,
    15_600_000,
    65 * 60,
    haceDias(12, 9, 3),
    haceDias(12, 10, 8),
);

console.log(JSON.stringify({ abiertas: 3, pasadas: 4, grabaciones: 2 }));
await db.$disconnect();
