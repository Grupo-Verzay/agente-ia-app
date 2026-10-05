import "server-only";

import { db } from "@/lib/db";
import { comoNombreDelEnlace } from "@/lib/enlace-del-catalogo";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { elEnlaceConSufijo } from "@/lib/videollamada-ia";

/**
 * El enlace legible de una agenda pública: `/schedule/<nombre>/agenda` y
 * `/bookings/<nombre>/agenda`, en vez del id de la cuenta. Se guarda UNA vez
 * por cuenta y tipo en `enlaces_de_agenda` (tabla de la App, sin clave
 * foránea): lo ya enviado sigue abriendo aunque la cuenta cambie de nombre, y
 * el enlace viejo con el id también sigue abriendo.
 */

export type TipoDeAgenda = "schedule" | "bookings";

let tablaLista: Promise<void> | null = null;

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
    tablaLista ??= (async () => {
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "enlaces_de_agenda" (
                "slug" TEXT NOT NULL,
                "tipo" TEXT NOT NULL,
                "cuentaId" TEXT NOT NULL,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY ("tipo", "slug")
            )`);
        await ddl(() => db.$executeRaw`
            CREATE UNIQUE INDEX IF NOT EXISTS "enlaces_de_agenda_cuenta_tipo_key"
            ON "enlaces_de_agenda" ("cuentaId", "tipo")`);
    })().catch((error) => {
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

/** Un slug que no pueda confundirse con un id: letras, números y guiones. */
function laBaseDelSlug(nombre: string, cuentaId: string): string {
    const base = comoNombreDelEnlace(nombre).slice(0, 40).replace(/-+$/, "");
    return base.length >= 2 ? base : `agenda-${cuentaId.slice(-6).toLowerCase()}`;
}

/** El slug legible de la agenda de una cuenta; lo crea la primera vez. */
export async function elSlugDeLaAgenda(cuentaId: string, tipo: TipoDeAgenda): Promise<string> {
    await asegurarLaTabla();
    const ya = await db.$queryRaw<{ slug: string }[]>`
        SELECT "slug" FROM "enlaces_de_agenda" WHERE "cuentaId" = ${cuentaId} AND "tipo" = ${tipo} LIMIT 1`;
    if (ya[0]) return ya[0].slug;

    const cuenta = await db.user.findUnique({
        where: { id: cuentaId },
        select: { company: true, name: true, email: true },
    });
    const base = laBaseDelSlug(nombreDeLaCuenta(cuenta ?? {}).split("@")[0], cuentaId);
    for (let intento = 1; intento <= 50; intento++) {
        const candidato = elEnlaceConSufijo(base, intento);
        const puestas = await db.$executeRaw`
            INSERT INTO "enlaces_de_agenda" ("slug", "tipo", "cuentaId") VALUES (${candidato}, ${tipo}, ${cuentaId})
            ON CONFLICT DO NOTHING`;
        if (puestas > 0) return candidato;
        const otra = await db.$queryRaw<{ slug: string }[]>`
            SELECT "slug" FROM "enlaces_de_agenda" WHERE "cuentaId" = ${cuentaId} AND "tipo" = ${tipo} LIMIT 1`;
        if (otra[0]) return otra[0].slug;
    }
    throw new Error("no quedó ningún enlace de agenda libre");
}

/** Igual, pero nunca lanza: sin slug, `null` y se dice. */
export async function elSlugDeLaAgendaSiSePuede(cuentaId: string, tipo: TipoDeAgenda): Promise<string | null> {
    try {
        return await elSlugDeLaAgenda(cuentaId, tipo);
    } catch (error) {
        console.warn("[agenda] no se pudo armar el enlace legible", { cuenta: cuentaId, tipo, error });
        return null;
    }
}

/** La cuenta de un slug, o `null`. */
export async function laCuentaDelEnlaceDeAgenda(slug: string, tipo: TipoDeAgenda): Promise<string | null> {
    await asegurarLaTabla();
    const filas = await db.$queryRaw<{ cuentaId: string }[]>`
        SELECT "cuentaId" FROM "enlaces_de_agenda" WHERE "tipo" = ${tipo} AND "slug" = ${slug} LIMIT 1`;
    return filas[0]?.cuentaId ?? null;
}

/** El enlace público completo: legible si se puede, con el id si no. */
export async function elEnlacePublicoDeLaAgenda(origen: string, cuentaId: string, tipo: TipoDeAgenda): Promise<string> {
    const base = origen.replace(/\/+$/, "");
    const slug = await elSlugDeLaAgendaSiSePuede(cuentaId, tipo);
    return slug
        ? `${base}/${tipo}/${encodeURIComponent(slug)}/agenda`
        : `${base}/${tipo}/${encodeURIComponent(cuentaId)}`;
}
