"use server";

import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { leerLaNotaRapida, guardarLaNotaRapida } from "@/lib/nota-rapida-db";
import {
    comoContenidoDeNota,
    comoTextoDeLaNota,
    elTituloDeLaNota,
    sePuedeMandarAlModulo,
    seRecorto,
} from "@/lib/nota-rapida";
import { createNote } from "@/actions/notes-actions";

/**
 * La nota rápida de quien está mirando.
 *
 * # De quién es: el id NO llega del navegador
 *
 * Ninguna de estas tres acciones recibe un `userId`, y eso no es comodidad: es
 * la puerta. **Una acción de servidor ES un endpoint**, así que un id que
 * llegara de fuera sería la forma de leer —y de pisar— la nota de otro. Aquí no
 * hay nada que comprobar porque no hay nada que aceptar: la persona sale de la
 * sesión y punto. Es la misma decisión que `elDuenoDeLasNotas` tomó después de
 * que la pestaña Notas de un chat enseñara las notas privadas de un dueño a
 * todo su equipo, sin el rodeo de aceptar un id para después ignorarlo.
 *
 * Por eso tampoco pasa por `laCuentaDeLaAccion`: eso resuelve un ALCANCE —a qué
 * cuenta llego— y esto no tiene alcance ninguno. Es de una persona, y de una
 * sola.
 */
async function laPersonaDeLaNota(): Promise<{ id: string; nombre: string | null } | null> {
    const user = await currentUser();
    if (!user?.id) return null;
    const persona = laPersonaQueActua(user);
    return persona.id ? persona : null;
}

export async function leerMiNotaRapidaAction(): Promise<{
    success: boolean;
    texto: string;
    message?: string;
}> {
    try {
        const persona = await laPersonaDeLaNota();
        if (!persona) return { success: false, texto: "", message: "No autorizado." };
        return { success: true, texto: await leerLaNotaRapida(persona.id) };
    } catch (error) {
        // Que no se pueda leer no puede ser mudo: desde fuera se ve como una
        // nota que se vació sola, que es lo más alarmante que puede hacer.
        console.error("[nota-rapida] no se pudo leer la nota", error);
        return { success: false, texto: "", message: "No se pudo abrir la nota." };
    }
}

export async function guardarMiNotaRapidaAction(texto: unknown): Promise<{
    success: boolean;
    /** Lo que de verdad quedó guardado. Con el texto recortado, no es lo que se mandó. */
    texto: string;
    recortada?: boolean;
    message?: string;
}> {
    try {
        const persona = await laPersonaDeLaNota();
        if (!persona) return { success: false, texto: "", message: "No autorizado." };
        const contenido = comoTextoDeLaNota(texto);
        const recortada = seRecorto(texto);
        await guardarLaNotaRapida(persona.id, contenido);
        return { success: true, texto: contenido, recortada };
    } catch (error) {
        console.error("[nota-rapida] no se pudo guardar la nota", error);
        return { success: false, texto: "", message: "No se pudo guardar." };
    }
}

/**
 * Asciende la nota a nota formal del módulo de Notas, y **vacía el papel**.
 *
 * # Se vacía a propósito, y no se pierde nada
 *
 * Lo apuntado ya está guardado en Notas cuando el papel se vacía, así que lo
 * que se borra es la copia. Dejándolo puesto, el botón se pulsa dos veces sin
 * querer y quedan dos notas iguales — y entonces hay que ir a Notas a borrar
 * una, que es exactamente el trabajo que esto viene a quitar. Por eso la
 * respuesta trae el título: lo que se dice después del clic no es «listo», es
 * qué se guardó y dónde.
 *
 * # Y la crea `createNote`, la de siempre
 *
 * No hay un segundo camino para crear una nota. De ahí salen gratis el registro
 * de auditoría y **dónde aterriza**: la nota cae donde `/notas` la crearía para
 * quien está mirando ahora mismo, así que se encuentra donde se va a buscar.
 * Dentro de una cuenta ajena con «Ingresar» eso es la cuenta de esa pantalla,
 * que es la que se ve al abrir Notas desde ahí.
 *
 * El papel, en cambio, es de la PERSONA — son dos preguntas distintas y por eso
 * las contestan dos funciones. Ver `lib/nota-rapida-db.ts`.
 *
 * # Y si Notas falla, el papel NO se vacía
 *
 * El orden importa y es el único posible: primero se crea la nota, y solo
 * cuando existe se vacía. Al revés, un fallo de `createNote` se llevaría por
 * delante lo apuntado sin haberlo guardado en ninguna parte.
 */
export async function mandarLaNotaAlModuloAction(texto: unknown): Promise<{
    success: boolean;
    titulo?: string;
    noteId?: string;
    message?: string;
}> {
    try {
        const persona = await laPersonaDeLaNota();
        if (!persona) return { success: false, message: "No autorizado." };

        const contenido = comoTextoDeLaNota(texto);
        if (!sePuedeMandarAlModulo(contenido)) {
            return { success: false, message: "La nota está vacía." };
        }

        const titulo = elTituloDeLaNota(contenido);
        // `createNote` resuelve por su cuenta de quién es la nota con
        // `currentUser()`; el primer parámetro lo ignora a propósito desde que
        // se cerró el agujero de la pestaña Notas de un chat.
        const creada = await createNote(
            persona.id,
            null,
            comoContenidoDeNota(contenido),
            titulo,
        );
        if (!creada?.success) {
            return { success: false, message: creada?.error ?? "No se pudo guardar en Notas." };
        }

        await guardarLaNotaRapida(persona.id, "");
        return { success: true, titulo, noteId: creada.data?.id };
    } catch (error) {
        console.error("[nota-rapida] no se pudo mandar la nota a Notas", error);
        return { success: false, message: "No se pudo guardar en Notas." };
    }
}
