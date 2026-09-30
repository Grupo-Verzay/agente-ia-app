"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { mandaEnLaCasaDeVerdad } from "@/lib/mando-de-la-casa";
import { MODULOS_CON_GUIA } from "@/lib/introduccion-de-la-guia";
import { guardarLaColumna, posicionesDelTablero } from "@/lib/orden-de-tablero-db";
import {
    TARJETAS_DE_LA_PORTADA,
    comoTipoDeOrdenPropio,
    losIdsQueValen,
    type TipoDeOrdenPropio,
} from "@/lib/orden-propio";
import type { OrdenGuardado } from "@/lib/orden-de-las-tarjetas";

/**
 * El orden propio de una lista (ver `lib/orden-propio.ts`).
 *
 * Un módulo `'use server'` solo exporta funciones asíncronas: los tipos y las
 * constantes viven en `lib/orden-propio.ts`.
 *
 * **La persona la pone el servidor**, nunca el navegador: ninguna de las dos
 * acciones recibe un id de persona. Así nadie reordena la pantalla de otro.
 */

type Resultado<T> = { success: true; data: T } | { success: false; message: string };

async function laPersona(): Promise<{ persona: string; casa: () => Promise<boolean> }> {
    const user = await currentUser();
    if (!user) throw new Error("No autorizado.");
    const persona = laPersonaQueActua(user).id;
    if (!persona) throw new Error("No autorizado.");
    return { persona, casa: () => mandaEnLaCasaDeVerdad(user) };
}

/** Qué ids pueden estar en cada lista: la misma que la pantalla pinta. */
async function losIdsDeLaLista(tipo: TipoDeOrdenPropio, casa: () => Promise<boolean>): Promise<string[]> {
    if (tipo === "doc-portada") return [...TARJETAS_DE_LA_PORTADA];
    if (tipo === "guias-publicadas") {
        // Solo la casa ve esta lista (el editor de introducciones es suyo).
        if (!(await casa())) throw new Error("No autorizado.");
        return [...MODULOS_CON_GUIA];
    }
    const filas = await db.guideUrl.findMany({ select: { id: true } });
    return filas.map((f) => f.id);
}

export async function leerMiOrdenAction(tipoCrudo: unknown): Promise<Resultado<OrdenGuardado>> {
    try {
        const tipo = comoTipoDeOrdenPropio(tipoCrudo);
        if (!tipo) return { success: false, message: "Lista desconocida." };
        const { persona } = await laPersona();
        return { success: true, data: await posicionesDelTablero(tipo, persona) };
    } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo leer el orden.";
        // Mudo, esto se ve como «las tarjetas no se quedan donde las dejo».
        console.warn("[orden-propio] no se pudo leer el orden", { tipo: String(tipoCrudo), message });
        return { success: false, message };
    }
}

/**
 * Guarda la lista ENTERA en el orden en que tiene que quedar. Cada escritura es
 * una foto completa: dos pestañas a la vez acaban en el orden que vio una.
 */
export async function guardarMiOrdenAction(tipoCrudo: unknown, idsCrudos: unknown): Promise<Resultado<null>> {
    try {
        const tipo = comoTipoDeOrdenPropio(tipoCrudo);
        if (!tipo) return { success: false, message: "Lista desconocida." };
        const { persona, casa } = await laPersona();
        const ids = losIdsQueValen(idsCrudos, await losIdsDeLaLista(tipo, casa));
        if (ids.length > 0) await guardarLaColumna({ tipo, tableroId: persona, ids });
        return { success: true, data: null };
    } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo guardar el orden.";
        console.warn("[orden-propio] no se pudo guardar el orden", { tipo: String(tipoCrudo), message });
        return { success: false, message };
    }
}
