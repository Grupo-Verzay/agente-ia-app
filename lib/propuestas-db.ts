import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { comoCaracteristicas, ordenarPlantillas, type DatosDePlantilla, type PlantillaDePlan } from "@/lib/plantillas-de-planes";
import {
    comoEslogan,
    comoMoneda,
    comoTipoDeItems,
    comoVisibilidadDeNota,
    esLineaParaEnviar,
    esTokenValido,
    laNotaQueSeEnsena,
    type DatosDePropuesta,
    type Propuesta,
    type PropuestaPublica,
    type ServicioDePropuesta,
} from "@/lib/propuestas";

/**
 * Dónde viven las PROPUESTAS COMERCIALES: `propuestas_comerciales`, tabla de la
 * App con `CREATE TABLE IF NOT EXISTS` y **sin clave foránea**. Ni una columna
 * en `User`: esa es del BACKEND y añadirle columnas desde aquí es lo que reventó
 * el #360.
 *
 * - `cuentaId` es la CUENTA dueña (la fila efectiva), no la persona: la
 *   propuesta la ve y la edita el equipo que administra la cuenta.
 * - `token` es la puerta de la página pública, con índice ÚNICO. Lo genera el
 *   servidor (`randomBytes`) y no se regenera al editar: el enlace que ya se
 *   mandó por WhatsApp tiene que seguir llevando a la propuesta, ahora al día.
 * - `servicios` va en JSONB: son las filas de UNA propuesta, se leen y se
 *   escriben siempre juntas y nunca se consultan por separado.
 */

let tablasListas: Promise<void> | null = null;

/** Solo se traga «ya existe»: dos réplicas pueden crear la tabla a la vez. */
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

function asegurarLasTablas(): Promise<void> {
    tablasListas ??= (async () => {
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "propuestas_comerciales" (
                "id" TEXT PRIMARY KEY,
                "cuentaId" TEXT NOT NULL,
                "token" TEXT NOT NULL,
                "cliente" TEXT NOT NULL,
                "fecha" DATE NOT NULL,
                "moneda" TEXT NOT NULL DEFAULT 'COP',
                "servicios" JSONB NOT NULL DEFAULT '[]'::jsonb,
                "mantenimientoMensual" NUMERIC(18,2),
                "mantenimientoDescripcion" TEXT NOT NULL DEFAULT '',
                "condiciones" TEXT NOT NULL DEFAULT '',
                "creadoPorId" TEXT,
                "vecesAbierta" INTEGER NOT NULL DEFAULT 0,
                "ultimaVezAbierta" TIMESTAMP(3),
                "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE UNIQUE INDEX IF NOT EXISTS "propuestas_comerciales_token_key"
            ON "propuestas_comerciales" ("token")
        `);
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "propuestas_comerciales_cuenta_idx"
            ON "propuestas_comerciales" ("cuentaId", "creadaEn" DESC)
        `);
        // Los campos nuevos entran con ADD COLUMN IF NOT EXISTS y no reescribiendo
        // el CREATE: la tabla ya está en producción y un CREATE TABLE IF NOT
        // EXISTS no toca una que ya existe. Todos con su valor de siempre, así
        // que las propuestas que ya había se leen igual que antes.
        await ddl(() => db.$executeRaw`
            ALTER TABLE "propuestas_comerciales"
                ADD COLUMN IF NOT EXISTS "tipoDeItems" TEXT NOT NULL DEFAULT 'servicios',
                ADD COLUMN IF NOT EXISTS "empresa" TEXT NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS "whatsapp" TEXT NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS "linea" TEXT NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS "correo" TEXT NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS "vigencia" DATE,
                ADD COLUMN IF NOT EXISTS "nota" TEXT NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS "notaVisibilidad" TEXT NOT NULL DEFAULT 'interna',
                ADD COLUMN IF NOT EXISTS "metodoPago" TEXT NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS "medioPago" TEXT NOT NULL DEFAULT ''
        `);
        // Las PLANTILLAS DE PLANES de la cuenta: independientes de Productos y
        // sin tope de cuántas. Una propuesta no guarda su id: guarda una COPIA
        // (ver `lib/plantillas-de-planes.ts`), así que editarlas o borrarlas no
        // mueve ninguna propuesta ya hecha.
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "propuestas_plantillas" (
                "id" TEXT PRIMARY KEY,
                "cuentaId" TEXT NOT NULL,
                "nombre" TEXT NOT NULL,
                "precio" NUMERIC(18,2) NOT NULL DEFAULT 0,
                "moneda" TEXT NOT NULL DEFAULT 'COP',
                "caracteristicas" JSONB NOT NULL DEFAULT '[]'::jsonb,
                "creadoPorId" TEXT,
                "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await ddl(() => db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "propuestas_plantillas_cuenta_idx"
            ON "propuestas_plantillas" ("cuentaId")
        `);
        // El eslogan es de la CUENTA, no de una propuesta: sale en todas.
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "propuestas_ajustes" (
                "cuentaId" TEXT PRIMARY KEY,
                "eslogan" TEXT NOT NULL DEFAULT '',
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
    })().catch((error) => {
        tablasListas = null;
        throw error;
    });
    return tablasListas;
}

function esTablaQueFalta(error: unknown): boolean {
    const e = error as { code?: string; meta?: { code?: string }; message?: string };
    return e?.meta?.code === "42P01" || e?.code === "42P01" || Boolean(e?.message?.includes("42P01"));
}

async function conLasTablas<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLasTablas();
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        // El recuerdo de «ya la creé» es del proceso, no de la base.
        tablasListas = null;
        await asegurarLasTablas();
        return hacer();
    }
}

/** 24 bytes de azar en `base64url`: 32 caracteres, 192 bits. */
export function nuevoToken(): string {
    return randomBytes(24).toString("base64url");
}

type Fila = {
    id: string;
    token: string;
    cliente: string;
    fecha: Date | string;
    moneda: string;
    servicios: unknown;
    mantenimientoMensual: unknown;
    mantenimientoDescripcion: string;
    condiciones: string;
    vecesAbierta: number | bigint | null;
    ultimaVezAbierta: Date | null;
    creadaEn: Date;
    actualizadaEn: Date;
    tipoDeItems: string | null;
    empresa: string | null;
    whatsapp: string | null;
    linea: string | null;
    correo: string | null;
    vigencia: Date | string | null;
    nota: string | null;
    notaVisibilidad: string | null;
    metodoPago: string | null;
    medioPago: string | null;
};

const COLUMNAS = `"id", "token", "cliente", "fecha", "moneda", "servicios", "mantenimientoMensual",
       "mantenimientoDescripcion", "condiciones", "vecesAbierta", "ultimaVezAbierta", "creadaEn", "actualizadaEn",
       "tipoDeItems", "empresa", "whatsapp", "linea", "correo", "vigencia", "nota", "notaVisibilidad",
       "metodoPago", "medioPago"`;

function comoServicios(v: unknown): ServicioDePropuesta[] {
    const lista = Array.isArray(v) ? v : typeof v === "string" ? safeParse(v) : [];
    return lista
        .map((s) => (s ?? {}) as Record<string, unknown>)
        .map((s) => ({
            nombre: String(s.nombre ?? ""),
            alcance: String(s.alcance ?? ""),
            inversion: Number(s.inversion) || 0,
        }))
        .filter((s) => s.nombre);
}

function safeParse(s: string): unknown[] {
    try {
        const v = JSON.parse(s);
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}

/** La fecha de una columna DATE, sin pasar por la zona del servidor. */
function comoDia(v: Date | string): string {
    if (typeof v === "string") return v.slice(0, 10);
    return v.toISOString().slice(0, 10);
}

function comoPropuestaDeLaFila(f: Fila): Propuesta {
    const mant = f.mantenimientoMensual;
    return {
        id: f.id,
        token: f.token,
        cliente: f.cliente,
        fecha: comoDia(f.fecha),
        moneda: comoMoneda(f.moneda),
        servicios: comoServicios(f.servicios),
        mantenimientoMensual: mant === null || mant === undefined ? null : Number(mant),
        mantenimientoDescripcion: f.mantenimientoDescripcion ?? "",
        condiciones: f.condiciones ?? "",
        tipoDeItems: comoTipoDeItems(f.tipoDeItems),
        empresa: f.empresa ?? "",
        whatsapp: f.whatsapp ?? "",
        linea: f.linea ?? "",
        correo: f.correo ?? "",
        vigencia: f.vigencia ? comoDia(f.vigencia) : null,
        nota: f.nota ?? "",
        notaVisibilidad: comoVisibilidadDeNota(f.notaVisibilidad),
        metodoPago: f.metodoPago ?? "",
        medioPago: f.medioPago ?? "",
        vecesAbierta: Number(f.vecesAbierta ?? 0) || 0,
        ultimaVezAbierta: f.ultimaVezAbierta ? new Date(f.ultimaVezAbierta).toISOString() : null,
        creadaEn: new Date(f.creadaEn).toISOString(),
        actualizadaEn: new Date(f.actualizadaEn).toISOString(),
    };
}

/** Los campos que se añadieron después, en el MISMO orden en crear y en editar. */
function camposNuevos(d: DatosDePropuesta): unknown[] {
    return [
        d.tipoDeItems,
        d.empresa,
        d.whatsapp,
        d.linea,
        d.correo,
        d.vigencia,
        d.nota,
        d.notaVisibilidad,
        d.metodoPago,
        d.medioPago,
    ];
}

/** Las de una cuenta, la más reciente primero. */
export async function lasPropuestasDe(cuentaId: string, tope = 500): Promise<Propuesta[]> {
    return conLasTablas(async () => {
        const filas = await db.$queryRawUnsafe<Fila[]>(
            `SELECT ${COLUMNAS} FROM "propuestas_comerciales"
             WHERE "cuentaId" = $1
             ORDER BY "creadaEn" DESC, "id" DESC
             LIMIT $2`,
            cuentaId,
            tope,
        );
        return filas.map(comoPropuestaDeLaFila);
    });
}

/** Una propuesta de ESA cuenta, o `null`: «no existe» y «no es tuya» se contestan igual. */
export async function laPropuestaDeLaCuenta(cuentaId: string, id: string): Promise<Propuesta | null> {
    return conLasTablas(async () => {
        const filas = await db.$queryRawUnsafe<Fila[]>(
            `SELECT ${COLUMNAS} FROM "propuestas_comerciales" WHERE "id" = $1 AND "cuentaId" = $2 LIMIT 1`,
            id,
            cuentaId,
        );
        return filas[0] ? comoPropuestaDeLaFila(filas[0]) : null;
    });
}

export async function crearPropuesta(datos: DatosDePropuesta & { cuentaId: string; creadoPorId: string | null }): Promise<Propuesta> {
    return conLasTablas(async () => {
        const filas = await db.$queryRawUnsafe<Fila[]>(
            `INSERT INTO "propuestas_comerciales"
                ("id", "cuentaId", "token", "cliente", "fecha", "moneda", "servicios",
                 "mantenimientoMensual", "mantenimientoDescripcion", "condiciones", "creadoPorId",
                 "tipoDeItems", "empresa", "whatsapp", "linea", "correo", "vigencia", "nota",
                 "notaVisibilidad", "metodoPago", "medioPago")
             VALUES ($1, $2, $3, $4, $5::date, $6, $7::jsonb, $8::numeric, $9, $10, $11,
                     $12, $13, $14, $15, $16, $17::date, $18, $19, $20, $21)
             RETURNING ${COLUMNAS}`,
            randomUUID(),
            datos.cuentaId,
            nuevoToken(),
            datos.cliente,
            datos.fecha,
            datos.moneda,
            JSON.stringify(datos.servicios),
            datos.mantenimientoMensual,
            datos.mantenimientoDescripcion,
            datos.condiciones,
            datos.creadoPorId,
            ...camposNuevos(datos),
        );
        return comoPropuestaDeLaFila(filas[0]!);
    });
}

/**
 * Edita una propuesta de ESA cuenta. **No toca el token**: el enlace que ya se
 * mandó sigue siendo el mismo y enseña la versión nueva.
 */
export async function editarPropuesta(cuentaId: string, id: string, datos: DatosDePropuesta): Promise<Propuesta | null> {
    return conLasTablas(async () => {
        const filas = await db.$queryRawUnsafe<Fila[]>(
            `UPDATE "propuestas_comerciales" SET
                "cliente" = $3, "fecha" = $4::date, "moneda" = $5, "servicios" = $6::jsonb,
                "mantenimientoMensual" = $7::numeric, "mantenimientoDescripcion" = $8,
                "condiciones" = $9, "tipoDeItems" = $10, "empresa" = $11, "whatsapp" = $12,
                "linea" = $13, "correo" = $14, "vigencia" = $15::date, "nota" = $16,
                "notaVisibilidad" = $17, "metodoPago" = $18, "medioPago" = $19,
                "actualizadaEn" = CURRENT_TIMESTAMP
             WHERE "id" = $1 AND "cuentaId" = $2
             RETURNING ${COLUMNAS}`,
            id,
            cuentaId,
            datos.cliente,
            datos.fecha,
            datos.moneda,
            JSON.stringify(datos.servicios),
            datos.mantenimientoMensual,
            datos.mantenimientoDescripcion,
            datos.condiciones,
            ...camposNuevos(datos),
        );
        return filas[0] ? comoPropuestaDeLaFila(filas[0]) : null;
    });
}

export async function borrarPropuesta(cuentaId: string, id: string): Promise<boolean> {
    return conLasTablas(async () => {
        const n = await db.$executeRawUnsafe(
            `DELETE FROM "propuestas_comerciales" WHERE "id" = $1 AND "cuentaId" = $2`,
            id,
            cuentaId,
        );
        return n > 0;
    });
}

/**
 * La propuesta de la página pública, por su token, y cuenta la visita.
 *
 * Lo que sale de aquí va a un navegador SIN sesión, así que se elige campo por
 * campo: ni el id de la fila, ni la cuenta, ni cuántas veces se abrió. Del
 * negocio, su nombre y su logo —lo que hace falta para saber de quién es la
 * propuesta— y el logo solo si vive en NUESTRO almacenamiento o va dentro de la
 * propia fila: esa dirección la escribió la cuenta, y la página no le pide al
 * navegador del cliente nada que no sea nuestro.
 */
export async function laPropuestaPublica(token: string): Promise<PropuestaPublica | null> {
    if (!esTokenValido(token)) return null;
    return conLasTablas(async () => {
        const filas = await db.$queryRawUnsafe<(Fila & { cuentaId: string })[]>(
            `UPDATE "propuestas_comerciales"
             SET "vecesAbierta" = "vecesAbierta" + 1, "ultimaVezAbierta" = CURRENT_TIMESTAMP
             WHERE "token" = $1
             RETURNING ${COLUMNAS}, "cuentaId"`,
            token,
        );
        const f = filas[0];
        if (!f) return null;
        const p = comoPropuestaDeLaFila(f);
        const [cuenta, eslogan] = await Promise.all([
            db.user
                .findUnique({
                    where: { id: f.cuentaId },
                    select: { brandName: true, company: true, name: true, email: true, image: true },
                })
                .catch(() => null),
            elEsloganDe(f.cuentaId).catch(() => ""),
        ]);
        const nombre = cuenta?.brandName?.trim() || (cuenta ? nombreDeLaCuenta(cuenta) : "") || "";
        const imagen = cuenta?.image?.trim() || null;
        return {
            token: p.token,
            cliente: p.cliente,
            fecha: p.fecha,
            moneda: p.moneda,
            servicios: p.servicios,
            mantenimientoMensual: p.mantenimientoMensual,
            mantenimientoDescripcion: p.mantenimientoDescripcion,
            condiciones: p.condiciones,
            actualizadaEn: p.actualizadaEn,
            tipoDeItems: p.tipoDeItems,
            empresa: p.empresa,
            vigencia: p.vigencia,
            nota: laNotaQueSeEnsena(p),
            metodoPago: p.metodoPago,
            medioPago: p.medioPago,
            negocio: { nombre, logo: elLogoQueSeEnsena(imagen, process.env.S3_PUBLIC_URL), eslogan },
        };
    });
}

/** El logo solo si es nuestro (o va dentro de la fila); si no, las iniciales. */
export function elLogoQueSeEnsena(url: string | null, publicUrl: string | undefined): string | null {
    if (!url) return null;
    if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(url)) return url;
    if (!publicUrl) return null;
    try {
        const destino = new URL(url);
        const nuestro = new URL(publicUrl);
        if (destino.protocol !== "https:" && destino.protocol !== "http:") return null;
        return destino.origin === nuestro.origin ? url : null;
    } catch {
        return null;
    }
}

/** El eslogan de la cuenta para el encabezado de sus propuestas; vacío = ninguno. */
export async function elEsloganDe(cuentaId: string): Promise<string> {
    return conLasTablas(async () => {
        const filas = await db.$queryRaw<{ eslogan: string }[]>`
            SELECT "eslogan" FROM "propuestas_ajustes" WHERE "cuentaId" = ${cuentaId} LIMIT 1
        `;
        return comoEslogan(filas[0]?.eslogan ?? "");
    });
}

/** Guarda el eslogan; vacío BORRA la fila, para que «sin fila» signifique una sola cosa. */
export async function ponerElEslogan(cuentaId: string, eslogan: string): Promise<string> {
    const limpio = comoEslogan(eslogan);
    return conLasTablas(async () => {
        if (!limpio) {
            await db.$executeRaw`DELETE FROM "propuestas_ajustes" WHERE "cuentaId" = ${cuentaId}`;
            return "";
        }
        await db.$executeRaw`
            INSERT INTO "propuestas_ajustes" ("cuentaId", "eslogan", "actualizadoEn")
            VALUES (${cuentaId}, ${limpio}, CURRENT_TIMESTAMP)
            ON CONFLICT ("cuentaId") DO UPDATE SET "eslogan" = EXCLUDED."eslogan", "actualizadoEn" = CURRENT_TIMESTAMP
        `;
        return limpio;
    });
}

export type LineaParaEnviar = { instanceName: string; nombre: string; tipo: string };

/**
 * Las líneas de ESTA cuenta desde las que se puede mandar un WhatsApp. Es la
 * lista que se ofrece al crear la propuesta y la MISMA con la que se comprueba
 * al guardar y al enviar: una línea que no sale de aquí no se acepta.
 */
export async function lasLineasParaEnviar(cuentaId: string): Promise<LineaParaEnviar[]> {
    const filas = await db.instancia.findMany({
        where: { userId: cuentaId },
        select: { instanceName: true, displayName: true, instanceType: true, metaChannel: true },
        orderBy: { instanceName: "asc" },
    });
    return filas
        .filter((i) => i.instanceName && esLineaParaEnviar(i))
        .map((i) => ({
            instanceName: i.instanceName!,
            nombre: i.displayName?.trim() || i.instanceName!,
            tipo: (i.instanceType ?? "Whatsapp").toString(),
        }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Plantillas de planes
// ─────────────────────────────────────────────────────────────────────────────

type FilaDePlantilla = {
    id: string;
    nombre: string;
    precio: unknown;
    moneda: string;
    caracteristicas: unknown;
    creadaEn: Date;
    actualizadaEn: Date;
};

const COLUMNAS_DE_PLANTILLA = `"id", "nombre", "precio", "moneda", "caracteristicas", "creadaEn", "actualizadaEn"`;

function comoPlantillaDeLaFila(f: FilaDePlantilla): PlantillaDePlan {
    const car = typeof f.caracteristicas === "string" ? safeParse(f.caracteristicas) : f.caracteristicas;
    return {
        id: f.id,
        nombre: f.nombre,
        precio: Number(f.precio) || 0,
        moneda: comoMoneda(f.moneda),
        caracteristicas: comoCaracteristicas(car),
        creadaEn: new Date(f.creadaEn).toISOString(),
        actualizadaEn: new Date(f.actualizadaEn).toISOString(),
    };
}

/** Todas las plantillas de una cuenta, sin tope de cuántas, en orden de precio. */
export async function lasPlantillasDe(cuentaId: string): Promise<PlantillaDePlan[]> {
    return conLasTablas(async () => {
        const filas = await db.$queryRawUnsafe<FilaDePlantilla[]>(
            `SELECT ${COLUMNAS_DE_PLANTILLA} FROM "propuestas_plantillas" WHERE "cuentaId" = $1`,
            cuentaId,
        );
        return ordenarPlantillas(filas.map(comoPlantillaDeLaFila));
    });
}

export async function crearPlantilla(
    datos: DatosDePlantilla & { cuentaId: string; creadoPorId: string | null },
): Promise<PlantillaDePlan> {
    return conLasTablas(async () => {
        const filas = await db.$queryRawUnsafe<FilaDePlantilla[]>(
            `INSERT INTO "propuestas_plantillas" ("id", "cuentaId", "nombre", "precio", "moneda", "caracteristicas", "creadoPorId")
             VALUES ($1, $2, $3, $4::numeric, $5, $6::jsonb, $7)
             RETURNING ${COLUMNAS_DE_PLANTILLA}`,
            randomUUID(),
            datos.cuentaId,
            datos.nombre,
            datos.precio,
            datos.moneda,
            JSON.stringify(datos.caracteristicas),
            datos.creadoPorId,
        );
        return comoPlantillaDeLaFila(filas[0]!);
    });
}

/** Edita una plantilla de ESA cuenta. No toca ninguna propuesta: guardan su copia. */
export async function editarPlantilla(cuentaId: string, id: string, datos: DatosDePlantilla): Promise<PlantillaDePlan | null> {
    return conLasTablas(async () => {
        const filas = await db.$queryRawUnsafe<FilaDePlantilla[]>(
            `UPDATE "propuestas_plantillas" SET
                "nombre" = $3, "precio" = $4::numeric, "moneda" = $5, "caracteristicas" = $6::jsonb,
                "actualizadaEn" = CURRENT_TIMESTAMP
             WHERE "id" = $1 AND "cuentaId" = $2
             RETURNING ${COLUMNAS_DE_PLANTILLA}`,
            id,
            cuentaId,
            datos.nombre,
            datos.precio,
            datos.moneda,
            JSON.stringify(datos.caracteristicas),
        );
        return filas[0] ? comoPlantillaDeLaFila(filas[0]) : null;
    });
}

export async function borrarPlantilla(cuentaId: string, id: string): Promise<boolean> {
    return conLasTablas(async () => {
        const n = await db.$executeRawUnsafe(
            `DELETE FROM "propuestas_plantillas" WHERE "id" = $1 AND "cuentaId" = $2`,
            id,
            cuentaId,
        );
        return n > 0;
    });
}
