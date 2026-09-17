"use server";

import { randomUUID } from "crypto";

import { currentUser } from "@/lib/auth";
import { crearLosAvisos } from "@/lib/avisos-de-tarea";
import { tituloDelAviso } from "@/lib/avisos-de-tarea-tipos";
import {
    comoSeGuardaElTexto,
    extraerMenciones,
    type MensajeDeEquipo,
    type PersonaMencionable,
} from "@/lib/chat-de-equipo";
import { guardarUnMensaje, leerElHilo } from "@/lib/chat-de-equipo-db";
import { getTeamAdvisorInfos } from "@/actions/team-actions";

type Respuesta<T> = { success: true; data: T } | { success: false; message: string };

/**
 * Quién escribe y en qué hilo.
 *
 * **El hilo es la CUENTA** (`ownerId ?? id`), el mismo valor con el que agrupan
 * Carpetas, Proyectos y Diagramas — y, lo que importa aquí, el mismo con el que
 * `getTeamAdvisorInfos` busca al equipo: si el hilo saliera de un id y la lista
 * de mencionables de otro, se podría mencionar a gente que no lee ese hilo.
 *
 * Y la identidad es la de `currentUser()`, que ya resuelve por sí solo el caso
 * de «Ingresar»: dentro de una cuenta ajena esa fila es la de esa cuenta, así
 * que se ve **su** hilo y se escribe en él (#756). Quien entra a una cuenta
 * entra a ver lo que ve su dueño, y el chat interno no es una excepción.
 */
async function quienYDonde(): Promise<
    { persona: { id: string; nombre: string | null }; cuentaId: string } | null
> {
    const user = await currentUser();
    if (!user?.id) return null;
    return {
        persona: { id: user.id, nombre: user.name ?? null },
        cuentaId: user.ownerId ?? user.id,
    };
}

/** El hilo del equipo, y con quién se puede mencionar. */
export async function hiloDelEquipoAction(): Promise<
    Respuesta<{ mensajes: MensajeDeEquipo[]; yo: string; equipo: PersonaMencionable[] }>
> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };

        const [mensajes, equipo] = await Promise.all([
            leerElHilo(quien.cuentaId),
            elEquipo(),
        ]);
        return { success: true, data: { mensajes, yo: quien.persona.id, equipo } };
    } catch (error) {
        console.error("[chat-equipo] no se pudo leer el hilo", error);
        return { success: false, message: "No se pudo cargar el chat del equipo." };
    }
}

/**
 * Escribe en el hilo, y avisa a los mencionados.
 *
 * Dos cosas del orden, y las dos importan:
 *
 * 1. **El mensaje se guarda ANTES de avisar.** Si avisar tarda o revienta, lo
 *    que la persona escribió ya está — al revés quedaría un aviso apuntando a
 *    un mensaje que no existe.
 * 2. **Avisar no puede tumbar el envío**, pero tampoco puede ser mudo:
 *    `crearLosAvisos` no lanza y deja su línea en la consola. Un aviso que no
 *    sale sin decirlo se lee como «a mí nunca me llega nada», que es el fallo
 *    original de todo este asunto.
 */
export async function enviarAlEquipoAction(
    texto: string,
): Promise<Respuesta<MensajeDeEquipo>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };

        const limpio = comoSeGuardaElTexto(texto);
        if (!limpio) return { success: false, message: "Escribe algo antes de enviar." };

        // A quién se mencionó lo decide el SERVIDOR sobre el equipo de esta
        // cuenta. Lo que diga el navegador no se da por bueno: sería una lista
        // de destinatarios que llega de fuera.
        const equipo = await elEquipo();
        const mencionados = extraerMenciones(limpio, equipo);

        const mensaje: MensajeDeEquipo = {
            id: randomUUID(),
            autorId: quien.persona.id,
            autorNombre: quien.persona.nombre,
            texto: limpio,
            mencionados,
            creadoEn: new Date().toISOString(),
        };

        await guardarUnMensaje({
            id: mensaje.id,
            cuentaId: quien.cuentaId,
            autorId: mensaje.autorId,
            autorNombre: mensaje.autorNombre,
            texto: mensaje.texto,
            mencionados,
        });

        if (mencionados.length) {
            // El MISMO aviso de los comentarios de tarea: la misma tabla, la
            // misma ventana que interrumpe y la misma campanita. Un aviso más,
            // en otro sitio y con otra forma de despacharse, se aprende a
            // ignorar — que es de lo que venimos.
            await crearLosAvisos(
                mencionados.map((destinatarioId) => ({
                    id: randomUUID(),
                    // Sin tarea: es lo único que distingue a un aviso del chat,
                    // y de ahí sale que el clic lleve a `/chat-equipo`.
                    taskId: null,
                    projectId: null,
                    ownerId: quien.cuentaId,
                    destinatarioId,
                    actorId: quien.persona.id,
                    actorNombre: quien.persona.nombre,
                    tipo: "mencion" as const,
                    titulo: tituloDelAviso("mencion", quien.persona.nombre, ""),
                    texto: limpio,
                })),
            );
        }

        return { success: true, data: mensaje };
    } catch (error) {
        console.error("[chat-equipo] no se pudo enviar el mensaje", error);
        return { success: false, message: "No se pudo enviar. Inténtalo de nuevo." };
    }
}

/** El equipo de esta cuenta, tal como lo ve el resto de la App. */
async function elEquipo(): Promise<PersonaMencionable[]> {
    const res = await getTeamAdvisorInfos();
    if (!res.success || !res.data) return [];
    return res.data.map((a) => ({ id: a.id, name: a.name, email: a.email }));
}
