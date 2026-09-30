"use server";

import { revalidatePath } from "next/cache";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { quienMandaEnLaCasa } from "@/lib/puerta-de-la-casa";
import { GUIA_CATALOGO } from "@/lib/guia-catalogo";
import { GUIA_DIAGRAMAS } from "@/lib/guia-diagramas";
import { GUIA_LEADS } from "@/lib/guia-leads";
import { GUIA_REUNIONES } from "@/lib/guia-reuniones";
import { GUIA_NOTAS } from "@/lib/guia-notas";
import { GUIA_MIS_DATOS } from "@/lib/guia-mis-datos";
import { GUIA_GOOGLE_SHEETS } from "@/lib/guia-google-sheets";
import { comoIntroduccion, esModuloConGuia, type Introduccion, type ModuloConGuia } from "@/lib/introduccion-de-la-guia";
import { guardarLaIntroduccion, laIntroduccionGuardada } from "@/lib/introduccion-de-la-guia-db";

/**
 * Editar la INTRODUCCIÓN de una guía pública. Es de la CASA
 * (`quienMandaEnLaCasa`): la guía se le enseña a clientes que todavía no tienen
 * cuenta, así que no es de ninguna cuenta. Una acción de servidor ES un
 * endpoint: la puerta va aquí, no en la pantalla.
 */

const POR_DEFECTO: Record<ModuloConGuia, Introduccion> = {
    leads: { titulo: GUIA_LEADS.titulo, subtitulo: GUIA_LEADS.subtitulo, descripcion: GUIA_LEADS.descripcion },
    catalogo: { titulo: GUIA_CATALOGO.titulo, subtitulo: GUIA_CATALOGO.subtitulo, descripcion: GUIA_CATALOGO.descripcion },
    diagramas: { titulo: GUIA_DIAGRAMAS.titulo, subtitulo: GUIA_DIAGRAMAS.subtitulo, descripcion: GUIA_DIAGRAMAS.descripcion },
    reuniones: { titulo: GUIA_REUNIONES.titulo, subtitulo: GUIA_REUNIONES.subtitulo, descripcion: GUIA_REUNIONES.descripcion },
    notas: { titulo: GUIA_NOTAS.titulo, subtitulo: GUIA_NOTAS.subtitulo, descripcion: GUIA_NOTAS.descripcion },
    "mis-datos": {
        titulo: GUIA_MIS_DATOS.titulo,
        subtitulo: GUIA_MIS_DATOS.subtitulo,
        descripcion: GUIA_MIS_DATOS.descripcion,
    },
    "google-sheets": {
        titulo: GUIA_GOOGLE_SHEETS.titulo,
        subtitulo: GUIA_GOOGLE_SHEETS.subtitulo,
        descripcion: GUIA_GOOGLE_SHEETS.descripcion,
    },
};

export async function introduccionDeLaGuiaAction(modulo: unknown): Promise<{
    success: boolean;
    guardada?: Introduccion | null;
    porDefecto?: Introduccion;
    message?: string;
}> {
    if (!esModuloConGuia(modulo)) return { success: false, message: "Esa guía no existe." };
    if (!(await quienMandaEnLaCasa("guia:leer-introduccion"))) return { success: false, message: "No autorizado." };
    try {
        return { success: true, guardada: await laIntroduccionGuardada(modulo), porDefecto: POR_DEFECTO[modulo] };
    } catch (error) {
        console.error("[guia] no se pudo leer la introducción", error);
        return { success: false, message: "No se pudo cargar la introducción." };
    }
}

export async function guardarIntroduccionDeLaGuiaAction(
    modulo: unknown,
    valor: unknown,
): Promise<{ success: boolean; message?: string }> {
    if (!esModuloConGuia(modulo)) return { success: false, message: "Esa guía no existe." };
    const quien = await quienMandaEnLaCasa("guia:guardar-introduccion");
    if (!quien) return { success: false, message: "No autorizado." };
    const decision = comoIntroduccion(valor);
    if (!decision.ok) return { success: false, message: decision.motivo };
    try {
        await guardarLaIntroduccion(modulo, decision.valor, laPersonaQueActua(quien).id);
        revalidatePath(`/guia/${modulo}`);
        return { success: true };
    } catch (error) {
        console.error("[guia] no se pudo guardar la introducción", error);
        return { success: false, message: "No se pudo guardar la introducción." };
    }
}
