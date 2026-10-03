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
import { GUIA_RESPUESTAS_RAPIDAS } from "@/lib/guia-respuestas-rapidas";
import { GUIA_ETIQUETAS } from "@/lib/guia-etiquetas";
import { GUIA_GOOGLE_SHEETS } from "@/lib/guia-google-sheets";
import { GUIA_INTEGRACIONES } from "@/lib/guia-integraciones";
import { GUIA_AGENTE_IA } from "@/lib/guia-agente-ia";
import { GUIA_USUARIOS } from "@/lib/guia-usuarios";
import { GUIA_MACROS } from "@/lib/guia-macros";
import { GUIA_FORMULARIOS } from "@/lib/guia-formularios";
import { GUIA_COPILOTO } from "@/lib/guia-copiloto";
import { GUIA_AI_IMAGENES } from "@/lib/guia-ai-imagenes";
import { GUIA_FINANZAS } from "@/lib/guia-finanzas";
import { GUIA_LLAMADAS } from "@/lib/guia-llamadas";
import { GUIA_PRODUCTOS } from "@/lib/guia-productos";
import { GUIA_FLUJOS } from "@/lib/guia-flujos";
import { GUIA_AGENDA } from "@/lib/guia-agenda";
import { GUIA_RECORDATORIOS } from "@/lib/guia-recordatorios";
import { GUIA_CONEXION } from "@/lib/guia-conexion";
import { GUIA_CHATS } from "@/lib/guia-chats";
import { GUIA_CORREO } from "@/lib/guia-correo";
import { GUIA_FOLLOW_UPS } from "@/lib/guia-follow-ups";
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
    etiquetas: {
        titulo: GUIA_ETIQUETAS.titulo,
        subtitulo: GUIA_ETIQUETAS.subtitulo,
        descripcion: GUIA_ETIQUETAS.descripcion,
    },
    "respuestas-rapidas": {
        titulo: GUIA_RESPUESTAS_RAPIDAS.titulo,
        subtitulo: GUIA_RESPUESTAS_RAPIDAS.subtitulo,
        descripcion: GUIA_RESPUESTAS_RAPIDAS.descripcion,
    },
    "google-sheets": {
        titulo: GUIA_GOOGLE_SHEETS.titulo,
        subtitulo: GUIA_GOOGLE_SHEETS.subtitulo,
        descripcion: GUIA_GOOGLE_SHEETS.descripcion,
    },
    integraciones: {
        titulo: GUIA_INTEGRACIONES.titulo,
        subtitulo: GUIA_INTEGRACIONES.subtitulo,
        descripcion: GUIA_INTEGRACIONES.descripcion,
    },
    "agente-ia": { titulo: GUIA_AGENTE_IA.titulo, subtitulo: GUIA_AGENTE_IA.subtitulo, descripcion: GUIA_AGENTE_IA.descripcion },
    usuarios: { titulo: GUIA_USUARIOS.titulo, subtitulo: GUIA_USUARIOS.subtitulo, descripcion: GUIA_USUARIOS.descripcion },
    macros: { titulo: GUIA_MACROS.titulo, subtitulo: GUIA_MACROS.subtitulo, descripcion: GUIA_MACROS.descripcion },
    formularios: { titulo: GUIA_FORMULARIOS.titulo, subtitulo: GUIA_FORMULARIOS.subtitulo, descripcion: GUIA_FORMULARIOS.descripcion },
    copiloto: { titulo: GUIA_COPILOTO.titulo, subtitulo: GUIA_COPILOTO.subtitulo, descripcion: GUIA_COPILOTO.descripcion },
    "ai-imagenes": {
        titulo: GUIA_AI_IMAGENES.titulo,
        subtitulo: GUIA_AI_IMAGENES.subtitulo,
        descripcion: GUIA_AI_IMAGENES.descripcion,
    },
    finanzas: { titulo: GUIA_FINANZAS.titulo, subtitulo: GUIA_FINANZAS.subtitulo, descripcion: GUIA_FINANZAS.descripcion },
    llamadas: { titulo: GUIA_LLAMADAS.titulo, subtitulo: GUIA_LLAMADAS.subtitulo, descripcion: GUIA_LLAMADAS.descripcion },
    productos: { titulo: GUIA_PRODUCTOS.titulo, subtitulo: GUIA_PRODUCTOS.subtitulo, descripcion: GUIA_PRODUCTOS.descripcion },
    flujos: { titulo: GUIA_FLUJOS.titulo, subtitulo: GUIA_FLUJOS.subtitulo, descripcion: GUIA_FLUJOS.descripcion },
    agenda: { titulo: GUIA_AGENDA.titulo, subtitulo: GUIA_AGENDA.subtitulo, descripcion: GUIA_AGENDA.descripcion },
    recordatorios: {
        titulo: GUIA_RECORDATORIOS.titulo,
        subtitulo: GUIA_RECORDATORIOS.subtitulo,
        descripcion: GUIA_RECORDATORIOS.descripcion,
    },
    conexion: { titulo: GUIA_CONEXION.titulo, subtitulo: GUIA_CONEXION.subtitulo, descripcion: GUIA_CONEXION.descripcion },
    chats: { titulo: GUIA_CHATS.titulo, subtitulo: GUIA_CHATS.subtitulo, descripcion: GUIA_CHATS.descripcion },
    correo: { titulo: GUIA_CORREO.titulo, subtitulo: GUIA_CORREO.subtitulo, descripcion: GUIA_CORREO.descripcion },
    "follow-ups": { titulo: GUIA_FOLLOW_UPS.titulo, subtitulo: GUIA_FOLLOW_UPS.subtitulo, descripcion: GUIA_FOLLOW_UPS.descripcion },
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
