import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
    comoEstiloDeMenu,
    comoRendicion,
    type EstiloDeMenu,
    type RendicionDeMenu,
} from "@/lib/workflow-menu";

/**
 * Los tres ajustes nuevos de los pasos de menú, en `WorkflowNode`:
 *
 *   menu_style        'lista' | 'botones'          (solo el menú con botones)
 *   menu_list_button  el botón que abre la lista   (solo el menú con botones)
 *   menu_fallback     'rama' | 'ia'                (los dos menús)
 *
 * Van en SQL en crudo y NO en `schema.prisma`, a propósito: `WorkflowNode` es
 * del BACKEND, que es quien crea estas columnas con su migración
 * (`20260928160000_menu_interactivo`). Declararlas aquí haría que CADA consulta
 * de Prisma a esa tabla las pidiera, y si la App se desplegara antes que la
 * migración, se caería el creador de flujos entero —es lo que reventó el #360—.
 * En crudo, lo peor que pasa sin la columna es que se leen los valores de
 * siempre (lista, «Ver opciones», rama) y guardar lo dice.
 */

export type AjustesDeMenu = {
    menuStyle: EstiloDeMenu;
    menuListButton: string | null;
    menuFallback: RendicionDeMenu;
};

const DE_SIEMPRE: AjustesDeMenu = { menuStyle: "lista", menuListButton: null, menuFallback: "rama" };

function faltaLaColumna(error: unknown): boolean {
    const e = error as { code?: string; meta?: { code?: string }; message?: string } | null;
    const codigo = e?.meta?.code ?? e?.code ?? "";
    return codigo === "42703" || String(e?.message ?? "").includes("42703");
}

/** Los ajustes de varios pasos a la vez: una consulta por flujo, no por paso. */
export async function leerAjustesDeMenu(nodeIds: string[]): Promise<Map<string, AjustesDeMenu>> {
    const salida = new Map<string, AjustesDeMenu>();
    const ids = [...new Set(nodeIds.filter(Boolean))];
    if (ids.length === 0) return salida;
    try {
        const filas = await db.$queryRaw<
            { id: string; menu_style: string | null; menu_list_button: string | null; menu_fallback: string | null }[]
        >(Prisma.sql`
            SELECT "id", "menu_style", "menu_list_button", "menu_fallback"
              FROM "WorkflowNode"
             WHERE "id" = ANY(${ids}::text[])
        `);
        for (const f of filas) {
            salida.set(f.id, {
                menuStyle: comoEstiloDeMenu(f.menu_style),
                menuListButton: (f.menu_list_button ?? "").trim() || null,
                menuFallback: comoRendicion(f.menu_fallback),
            });
        }
    } catch (error) {
        // Sin la columna (la App llegó antes que la migración del backend) se
        // leen los valores de siempre; se dice, que un ajuste que no se lee
        // sin avisar se ve como que «no se guarda».
        console.warn(
            faltaLaColumna(error)
                ? "[menu] las columnas del menú con botones no existen todavía (falta la migración del backend); se usan los valores de siempre"
                : "[menu] no se pudieron leer los ajustes del menú",
            error,
        );
    }
    return salida;
}

export function ajustesDe(mapa: Map<string, AjustesDeMenu>, nodeId: string): AjustesDeMenu {
    return mapa.get(nodeId) ?? DE_SIEMPRE;
}

/** Escribe solo lo que llega. Devuelve false si la columna todavía no existe. */
export async function escribirAjustesDeMenu(
    nodeId: string,
    cambios: { menuStyle?: EstiloDeMenu; menuListButton?: string | null; menuFallback?: RendicionDeMenu },
): Promise<{ ok: true } | { ok: false; faltaLaMigracion: boolean }> {
    const sets: Prisma.Sql[] = [];
    if (cambios.menuStyle !== undefined) sets.push(Prisma.sql`"menu_style" = ${cambios.menuStyle}`);
    if (cambios.menuListButton !== undefined) sets.push(Prisma.sql`"menu_list_button" = ${cambios.menuListButton}`);
    if (cambios.menuFallback !== undefined) sets.push(Prisma.sql`"menu_fallback" = ${cambios.menuFallback}`);
    if (sets.length === 0) return { ok: true };
    try {
        await db.$executeRaw(Prisma.sql`
            UPDATE "WorkflowNode" SET ${Prisma.join(sets, ", ")} WHERE "id" = ${nodeId}
        `);
        return { ok: true };
    } catch (error) {
        const falta = faltaLaColumna(error);
        console.warn("[menu] no se pudieron guardar los ajustes del menú", { nodeId, faltaLaMigracion: falta }, error);
        return { ok: false, faltaLaMigracion: falta };
    }
}
