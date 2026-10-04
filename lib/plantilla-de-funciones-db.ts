import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { comoFunciones, losFeaturesDeLasFunciones, type FuncionDelPlan } from "@/lib/pagina-de-plan";
import {
    asegurarLaTablaDeFunciones,
    esTablaQueFalta,
    olvidarLaTablaDeFunciones,
} from "@/lib/plan-funciones-db";
import {
    comoPlantilla,
    completarLaPlantilla,
    conLaPlantilla,
    enCuantosPlanesEstaEncendida,
    laListaConLaPlantillaNueva,
    laListaDelPlan,
    laListaQueManda,
    laPlantillaQueSeGuarda,
    mismaLista,
    type Audiencia,
    type FilaDelPlan,
    type FuncionDeLaPlantilla,
} from "@/lib/plantilla-de-funciones";

/**
 * Dónde vive la PLANTILLA MAESTRA de funciones (`lib/plantilla-de-funciones.ts`):
 * `plan_funciones_maestras`, tabla de la App con `CREATE TABLE IF NOT EXISTS`,
 * una fila por audiencia (clientes y resellers) y sin clave foránea. Ni una
 * columna en `subscription_plans`: esa tabla es del BACKEND (#360).
 *
 * La plantilla y cada plan se escriben JUNTOS, en una transacción con candado
 * por audiencia: con la plantilla escrita y los planes a medias, un plan diría
 * que tiene una función que ya no existe. Y se escribe solo lo que cambia —la
 * plantilla, `plan_funciones` y `features`—, así que pasar por aquí sin cambios
 * no toca ni una fila.
 *
 * La versión es la que dice si quien guarda vio la plantilla de ahora: dos
 * pestañas editando a la vez no pueden pisarse —la segunda resucitaría lo que la
 * primera borró, o borraría lo que la primera creó—.
 */

export const LA_PLANTILLA_CAMBIO =
    "La plantilla de funciones cambió mientras la editabas. Vuelve a abrirla para ver los cambios.";

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
    tablaLista ??= ddl(
        () => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "plan_funciones_maestras" (
                "audiencia" TEXT PRIMARY KEY,
                "funciones" JSONB NOT NULL DEFAULT '[]'::jsonb,
                "version" INTEGER NOT NULL DEFAULT 0,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `,
    ).catch((error) => {
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

async function conLasTablas<T>(hacer: () => Promise<T>): Promise<T> {
    await Promise.all([asegurarLaTabla(), asegurarLaTablaDeFunciones()]);
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        // El recuerdo de «ya las creé» es del proceso, no de la base.
        tablaLista = null;
        olvidarLaTablaDeFunciones();
        await Promise.all([asegurarLaTabla(), asegurarLaTablaDeFunciones()]);
        return hacer();
    }
}

/* ─── La sincronización ────────────────────────────────────────────────── */

/**
 * Lo que se cambia al sincronizar:
 * - `plantilla`: el editor de la plantilla manda la lista entera. Lleva la
 *   versión que vio; si no es la de ahora, no se guarda nada.
 * - `plan`: el editor de UN plan manda su lista (encendidas, destacadas, orden
 *   y alguna función nueva). La versión es opcional: sin ella no se comprueba.
 *   `guardarLaFila` escribe la fila del plan (precio, nombre, créditos…) DENTRO
 *   de la misma transacción y devuelve su id: con la fila guardada y las
 *   funciones no, el plan quedaría a medias. Sin `funciones` solo se pone de
 *   acuerdo con la plantilla lo que ya tenía (es lo que hace «Inicializar»).
 */
export type CambioDeLaPlantilla =
    | { tipo: "plantilla"; lista: unknown; version: number }
    | {
          tipo: "plan";
          planId?: string;
          guardarLaFila?: (tx: Prisma.TransactionClient) => Promise<string>;
          funciones?: unknown;
          version?: number | null;
      };

export type PlantillaSincronizada = {
    ok: true;
    plantilla: FuncionDeLaPlantilla[];
    version: number;
    /** Cuántos planes tienen encendida cada función (por id). */
    encendidas: Record<string, number>;
    /** Cuántas funciones entraron en la plantilla desde los planes en esta vuelta. */
    agregadas: number;
    /** Cuántas filas de planes se reescribieron. */
    planesTocados: number;
    /** Si se escribió algo: la plantilla o algún plan. */
    hubo: boolean;
    /** El plan que se guardó, cuando el cambio era de un plan. */
    planId: string | null;
};

export type ResultadoDeLaSincronizacion = PlantillaSincronizada | { ok: false; motivo: string };

type FilaGuardada = { funciones: unknown; version: number };

/**
 * Un «no» que llega DESPUÉS de haber escrito algo se lanza, para que la
 * transacción lo deshaga: devolverlo la confirmaría con la fila del plan ya
 * guardada.
 */
class Rechazo extends Error {
    constructor(readonly motivo: string) {
        super(motivo);
    }
}

function laVersion(v: unknown): number {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : 0;
}

function mismasFeatures(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Pone la plantilla de una audiencia y sus planes de acuerdo, y aplica el
 * cambio si llega. La primera vez arma la plantilla con el inventario de lo que
 * tienen los planes hoy y deja cada plan con SUS encendidas, en SU orden y con
 * SUS destacadas; lo que no tenía, apagado.
 */
export async function sincronizarLaAudiencia(
    audiencia: Audiencia,
    cambio?: CambioDeLaPlantilla,
): Promise<ResultadoDeLaSincronizacion> {
    try {
        return await conLasTablas(() => sincronizar(audiencia, cambio));
    } catch (error) {
        if (error instanceof Rechazo) return { ok: false, motivo: error.motivo };
        throw error;
    }
}

function sincronizar(audiencia: Audiencia, cambio?: CambioDeLaPlantilla): Promise<ResultadoDeLaSincronizacion> {
    return db.$transaction(
        async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"plantilla-de-funciones:" + audiencia}))`;

            const [guardada] = await tx.$queryRaw<FilaGuardada[]>`
                SELECT "funciones", "version" FROM "plan_funciones_maestras" WHERE "audiencia" = ${audiencia}
            `;
            const version = laVersion(guardada?.version);
            const base = comoPlantilla(guardada?.funciones);

            // La versión se mira ANTES de escribir la fila del plan: un
            // «no» después obligaría a deshacerla.
            if (cambio?.tipo === "plan" && typeof cambio.version === "number" && laVersion(cambio.version) !== version) {
                return { ok: false as const, motivo: LA_PLANTILLA_CAMBIO };
            }
            let planId: string | null = null;
            if (cambio?.tipo === "plan") {
                planId = cambio.guardarLaFila ? await cambio.guardarLaFila(tx) : (cambio.planId ?? null);
            }

            const planes = await tx.subscriptionPlan.findMany({
                where: { isResellerPlan: audiencia === "reseller" },
                select: { id: true, plan: true, assistanceType: true, isActive: true, features: true },
            });
            const ids = planes.map((p) => p.id);
            const listas = ids.length
                ? await tx.$queryRaw<{ subscriptionPlanId: string; funciones: unknown }[]>`
                      SELECT "subscriptionPlanId", "funciones" FROM "plan_funciones"
                      WHERE "subscriptionPlanId" = ANY(${ids}::text[])
                  `
                : [];
            const porPlan = new Map(listas.map((l) => [l.subscriptionPlanId, l.funciones]));
            const filas: FilaDelPlan[] = planes.map((p) => ({
                id: p.id,
                plan: String(p.plan),
                assistanceType: p.assistanceType,
                isActive: p.isActive,
                features: p.features ?? [],
                guardadas: porPlan.get(p.id),
            }));

            const { plantilla: completa, agregadas } = completarLaPlantilla(base, filas);

            let nueva: FuncionDeLaPlantilla[] = completa;
            const listaDe = new Map<string, FuncionDelPlan[]>();

            if (cambio?.tipo === "plantilla") {
                // Lo que vio quien guarda tiene que ser lo de ahora, también
                // si una función entró por otro camino desde entonces: sin
                // ella en su lista, guardarla la borraría de todos los planes.
                if (laVersion(cambio.version) !== version || agregadas > 0) {
                    return { ok: false as const, motivo: LA_PLANTILLA_CAMBIO };
                }
                const r = laPlantillaQueSeGuarda(cambio.lista, completa);
                if (!r.ok) return { ok: false as const, motivo: r.motivo };
                nueva = r.plantilla;
                for (const fila of filas) listaDe.set(fila.id, laListaConLaPlantillaNueva(fila, completa, nueva));
            } else if (cambio?.tipo === "plan" && cambio.funciones !== undefined) {
                const fila = filas.find((f) => f.id === planId);
                if (!fila) throw new Rechazo("Ese plan no existe.");
                const { nuevas, estados } = laListaQueManda(completa, cambio.funciones);
                nueva = [...completa, ...nuevas];
                for (const f of filas) {
                    listaDe.set(f.id, f.id === fila.id ? conLaPlantilla(estados, nueva) : laListaDelPlan(f, nueva));
                }
            } else {
                for (const fila of filas) listaDe.set(fila.id, laListaDelPlan(fila, nueva));
            }

            const plantillaCambio = !guardada || JSON.stringify(nueva) !== JSON.stringify(base);
            const versionNueva = plantillaCambio ? version + 1 : version;
            if (plantillaCambio) {
                const json = JSON.stringify(nueva);
                await tx.$executeRaw`
                    INSERT INTO "plan_funciones_maestras" ("audiencia", "funciones", "version", "actualizadoEn")
                    VALUES (${audiencia}, ${json}::jsonb, ${versionNueva}, CURRENT_TIMESTAMP)
                    ON CONFLICT ("audiencia")
                    DO UPDATE SET "funciones" = EXCLUDED."funciones", "version" = EXCLUDED."version",
                                  "actualizadoEn" = CURRENT_TIMESTAMP
                `;
            }

            let planesTocados = 0;
            for (const fila of filas) {
                const lista = comoFunciones(listaDe.get(fila.id) ?? []);
                const features = losFeaturesDeLasFunciones(lista);
                let tocado = false;
                if (!mismaLista(fila.guardadas, lista)) {
                    const json = JSON.stringify(lista);
                    await tx.$executeRaw`
                        INSERT INTO "plan_funciones" ("subscriptionPlanId", "funciones", "actualizadoEn")
                        VALUES (${fila.id}, ${json}::jsonb, CURRENT_TIMESTAMP)
                        ON CONFLICT ("subscriptionPlanId")
                        DO UPDATE SET "funciones" = EXCLUDED."funciones", "actualizadoEn" = CURRENT_TIMESTAMP
                    `;
                    tocado = true;
                }
                if (!mismasFeatures(fila.features, features)) {
                    await tx.subscriptionPlan.update({ where: { id: fila.id }, data: { features } });
                    tocado = true;
                }
                if (tocado) planesTocados++;
            }

            const encendidas = Object.fromEntries(enCuantosPlanesEstaEncendida([...listaDe.values()]));
            return {
                ok: true as const,
                plantilla: nueva,
                version: versionNueva,
                encendidas,
                agregadas,
                planesTocados,
                hubo: plantillaCambio || planesTocados > 0,
                planId,
            };
        },
        // La primera vez se reescriben todos los planes de la audiencia.
        { maxWait: 10_000, timeout: 30_000, isolationLevel: "ReadCommitted" as Prisma.TransactionIsolationLevel },
    );
}
