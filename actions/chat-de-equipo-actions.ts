"use server";

import { randomUUID } from "crypto";

import { currentUser } from "@/lib/auth";
import { crearLosAvisos } from "@/lib/avisos-de-tarea";
import { tituloDelAviso } from "@/lib/avisos-de-tarea-tipos";
import { canManageWorkspace } from "@/lib/workspace-roles";
import {
    comoSeGuardaElTexto,
    extraerMenciones,
    quienFirma,
    type MensajeDeEquipo,
    type PersonaMencionable,
} from "@/lib/chat-de-equipo";
import {
    CANAL_GENERAL,
    NOMBRE_DEL_GENERAL,
    canalDeLaFila,
    comoSeGuardaElNombre,
    llaveDelDirecto,
    ordenDeLosCanales,
    puedeEscribirEnElCanal,
    puedeLeerElCanal,
    type CanalDeEquipo,
} from "@/lib/canales-de-equipo";
import {
    abrirElDirecto,
    canalesDeLaCuenta,
    crearUnCanal,
    elCanal,
    guardarUnMensaje,
    leerElHilo,
    ponerLosMiembros,
    renombrarUnCanal,
    type FilaDeCanal,
} from "@/lib/chat-de-equipo-db";
import { getTeamAdvisorInfos } from "@/actions/team-actions";
import { db } from "@/lib/db";

type Respuesta<T> = { success: true; data: T } | { success: false; message: string };

export type HiloAbierto = {
    canales: CanalDeEquipo[];
    canalId: string;
    mensajes: MensajeDeEquipo[];
    yo: string;
    /** Quién se puede mencionar AQUÍ: la gente de este canal, no la de la cuenta. */
    equipo: PersonaMencionable[];
    /** Todo el equipo, para elegir con quién abrir un directo y a quién meter. */
    gente: PersonaMencionable[];
    puedoEscribir: boolean;
    /** Si quien mira crea, renombra y asigna canales. */
    mando: boolean;
};

/**
 * Quién escribe y en qué cuenta.
 *
 * **La cuenta es el espacio** (`ownerId ?? id`), el mismo valor con el que
 * agrupan Carpetas, Proyectos y Diagramas — y, lo que importa aquí, el mismo
 * con el que `getTeamAdvisorInfos` busca al equipo: si los canales salieran de
 * un id y la lista de gente de otro, se podría meter en un canal a quien no
 * puede leerlo.
 *
 * La identidad es la de `currentUser()`, que ya resuelve el caso de
 * «Ingresar»: dentro de una cuenta ajena esa fila es la de esa cuenta, así que
 * se ven **sus** canales (#756). Y quien firma es la PERSONA (#761).
 */
async function quienYDonde(): Promise<
    | {
          persona: { id: string; nombre: string | null };
          cuentaId: string;
          escritoDesde: string | null;
          manda: boolean;
      }
    | null
> {
    const user = await currentUser();
    if (!user?.id) return null;

    const firma = quienFirma(user);
    if (!firma) return null;

    return {
        persona: { id: firma.personaId, nombre: firma.nombre },
        cuentaId: firma.cuentaId,
        escritoDesde: firma.escritoDesde,
        // La MISMA puerta que el resto del espacio de trabajo: dueño,
        // administrador y superadministrador de verdad. El `agente` participa
        // pero no manda. Escribir aquí una condición nueva es lo que dejó
        // fuera a media gente en Clientes, Equipo y Analíticas.
        manda: canManageWorkspace(user),
    };
}

/**
 * La gente de esta cuenta: el equipo **y la cuenta misma**.
 *
 * `getTeamAdvisorInfos` busca por `owner_id`, así que devuelve al equipo y a
 * las cuentas vinculadas — pero **no al dueño**, cuya fila no cuelga de nadie.
 * Con un chat de hilo único eso solo significaba que al dueño no se le podía
 * mencionar; con directos significa que **nadie puede escribirle**, que es la
 * mitad de para lo que sirve esto.
 *
 * Se añade delante y se deduplica por id: si el dueño ya viniera por el otro
 * camino —una cuenta vinculada— saldría dos veces en la lista de con quién
 * hablar.
 */
async function elEquipo(cuentaId: string): Promise<PersonaMencionable[]> {
    const [res, cuenta] = await Promise.all([
        getTeamAdvisorInfos(),
        db.user
            .findUnique({ where: { id: cuentaId }, select: { id: true, name: true, email: true } })
            .catch(() => null),
    ]);

    const gente: PersonaMencionable[] = [];
    const vistos = new Set<string>();
    const meter = (p: PersonaMencionable) => {
        if (!p.id || vistos.has(p.id)) return;
        vistos.add(p.id);
        gente.push(p);
    };

    if (cuenta) meter({ id: cuenta.id, name: cuenta.name, email: cuenta.email });
    for (const a of res.success && res.data ? res.data : []) {
        meter({ id: a.id, name: a.name, email: a.email });
    }
    return gente;
}

/**
 * Los canales que ve una persona, ya resueltos.
 *
 * El **general va delante y no sale de la base**: es una constante, así que no
 * hay que crearlo en cada cuenta ni acordarse de hacerlo en las que ya
 * existen. Y un **directo se llama como la otra persona**, que es lo único que
 * le dice a quien mira de qué conversación se trata.
 */
function losCanalesQueVe(
    filas: FilaDeCanal[],
    yo: string,
    manda: boolean,
    gente: PersonaMencionable[],
): CanalDeEquipo[] {
    const nombrePorId = new Map(gente.map((p) => [p.id, p.name?.trim() || p.email || "Alguien"]));

    const lista: CanalDeEquipo[] = [
        {
            id: CANAL_GENERAL,
            tipo: "general",
            nombre: NOMBRE_DEL_GENERAL,
            conQuienId: null,
            pertenezco: true,
            puedoEscribir: true,
        },
    ];

    for (const f of filas) {
        const pertenece = f.miembros.includes(yo);
        if (!puedeLeerElCanal({ tipo: f.tipo, pertenece, manda })) continue;

        const otro = f.tipo === "directo" ? f.miembros.find((m) => m !== yo) ?? null : null;
        lista.push({
            id: f.id,
            tipo: f.tipo,
            nombre:
                f.tipo === "directo"
                    ? // Un directo entre otros dos —los que un administrador
                      // lee sin ser parte— se nombra con los dos, o no habría
                      // forma de saber de quién es.
                      pertenece
                        ? nombrePorId.get(otro ?? "") ?? "Directo"
                        : f.miembros.map((m) => nombrePorId.get(m) ?? "Alguien").join(" · ")
                    : f.nombre,
            conQuienId: otro,
            pertenezco: pertenece,
            puedoEscribir: puedeEscribirEnElCanal({ tipo: f.tipo, pertenece, manda }),
        });
    }

    return lista.sort(ordenDeLosCanales);
}

/** Quién se puede mencionar en un canal: su gente, no la de la cuenta. */
function losMencionablesDe(
    canal: CanalDeEquipo,
    fila: FilaDeCanal | null,
    gente: PersonaMencionable[],
): PersonaMencionable[] {
    if (canal.tipo === "general") return gente;
    const dentro = new Set(fila?.miembros ?? []);
    return gente.filter((p) => dentro.has(p.id));
}

/** El hilo de un canal, con la lista de canales al lado. */
export async function hiloDelEquipoAction(
    canalPedido?: string,
): Promise<Respuesta<HiloAbierto>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };

        const [filas, gente] = await Promise.all([
            canalesDeLaCuenta(quien.cuentaId),
            elEquipo(quien.cuentaId),
        ]);

        const canales = losCanalesQueVe(filas, quien.persona.id, quien.manda, gente);

        // Lo que llega del navegador no decide a qué se llega: si el canal
        // pedido no está entre los que esta persona ve, se cae al general en
        // vez de contestar con él.
        const pedido = canalDeLaFila(canalPedido);
        const canal = canales.find((c) => c.id === pedido) ?? canales[0];

        const mensajes = await leerElHilo(quien.cuentaId, canal.id);
        const fila = filas.find((f) => f.id === canal.id) ?? null;

        return {
            success: true,
            data: {
                canales,
                canalId: canal.id,
                mensajes,
                yo: quien.persona.id,
                equipo: losMencionablesDe(canal, fila, gente),
                gente,
                puedoEscribir: canal.puedoEscribir,
                mando: quien.manda,
            },
        };
    } catch (error) {
        console.error("[chat-equipo] no se pudo leer el hilo", error);
        return { success: false, message: "No se pudo cargar el chat del equipo." };
    }
}

/**
 * Escribe en un canal, y avisa a los mencionados.
 *
 * Tres cosas del orden, y las tres importan:
 *
 * 1. **Se comprueba que se puede escribir AHÍ**, no solo que hay sesión. El
 *    canal llega del navegador, así que sin esto cualquiera escribiría en el
 *    directo de otros dos poniendo su id a mano.
 * 2. **El mensaje se guarda ANTES de avisar.** Si avisar tarda o revienta, lo
 *    que la persona escribió ya está — al revés quedaría un aviso apuntando a
 *    un mensaje que no existe.
 * 3. **Avisar no puede tumbar el envío**, pero tampoco puede ser mudo:
 *    `crearLosAvisos` no lanza y deja su línea en la consola. Un aviso que no
 *    sale sin decirlo se lee como «a mí nunca me llega nada», que es el fallo
 *    original de todo este asunto.
 */
export async function enviarAlEquipoAction(
    texto: string,
    canalPedido?: string,
): Promise<Respuesta<{ mensaje: MensajeDeEquipo; canalId: string }>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };

        const limpio = comoSeGuardaElTexto(texto);
        if (!limpio) return { success: false, message: "Escribe algo antes de enviar." };

        const [filas, gente] = await Promise.all([
            canalesDeLaCuenta(quien.cuentaId),
            elEquipo(quien.cuentaId),
        ]);
        const canales = losCanalesQueVe(filas, quien.persona.id, quien.manda, gente);
        const canal = canales.find((c) => c.id === canalDeLaFila(canalPedido));
        if (!canal) return { success: false, message: "Ese canal no existe aquí." };
        if (!canal.puedoEscribir) {
            return { success: false, message: "No puedes escribir en este canal." };
        }

        // A quién se mencionó lo decide el SERVIDOR, y sobre la gente de ESTE
        // canal. Lo que diga el navegador no se da por bueno: sería una lista
        // de destinatarios que llega de fuera.
        const fila = filas.find((f) => f.id === canal.id) ?? null;
        const mencionados = extraerMenciones(limpio, losMencionablesDe(canal, fila, gente));

        const mensaje: MensajeDeEquipo = {
            id: randomUUID(),
            autorId: quien.persona.id,
            autorNombre: quien.persona.nombre,
            escritoDesde: quien.escritoDesde,
            texto: limpio,
            mencionados,
            creadoEn: new Date().toISOString(),
        };

        await guardarUnMensaje({
            id: mensaje.id,
            cuentaId: quien.cuentaId,
            canalId: canal.id,
            autorId: mensaje.autorId,
            autorNombre: mensaje.autorNombre,
            escritoDesde: quien.escritoDesde,
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
                    // El canal viaja en el aviso para que el clic abra la
                    // conversación donde se dijo, y no el general.
                    enlace: `/chat-equipo?canal=${encodeURIComponent(canal.id)}`,
                })),
            );
        }

        return { success: true, data: { mensaje, canalId: canal.id } };
    } catch (error) {
        console.error("[chat-equipo] no se pudo enviar el mensaje", error);
        return { success: false, message: "No se pudo enviar. Inténtalo de nuevo." };
    }
}

/** Crea un canal de área. Solo quien manda en la cuenta. */
export async function crearCanalAction(
    nombre: string,
    miembros: string[],
): Promise<Respuesta<{ canalId: string }>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };
        if (!quien.manda) return { success: false, message: "Solo un administrador crea canales." };

        const limpio = comoSeGuardaElNombre(nombre);
        if (!limpio) return { success: false, message: "Ponle un nombre al canal." };

        // Quién puede estar dentro sale del equipo de ESTA cuenta, no de la
        // lista que llegue: una lista de fuera metería en un canal a alguien
        // de otra cuenta, y entonces sus mensajes le llegarían.
        const gente = await elEquipo(quien.cuentaId);
        const validos = new Set(gente.map((p) => p.id));
        const dentro = miembros.filter((m) => validos.has(m));

        const canalId = randomUUID();
        await crearUnCanal({
            id: canalId,
            cuentaId: quien.cuentaId,
            nombre: limpio,
            creadoPorId: quien.persona.id,
            // Quien lo crea entra dentro. Lo vería igual por ser quien manda,
            // pero le saldría marcado como ajeno —con su candado— en el canal
            // que acaba de abrir, y eso no lo entiende nadie.
            miembros: Array.from(new Set([quien.persona.id, ...dentro])),
        });
        return { success: true, data: { canalId } };
    } catch (error) {
        console.error("[chat-equipo] no se pudo crear el canal", error);
        return { success: false, message: "No se pudo crear el canal." };
    }
}

/** Le cambia el nombre a un canal de área. */
export async function renombrarCanalAction(
    canalId: string,
    nombre: string,
): Promise<Respuesta<true>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };
        if (!quien.manda) return { success: false, message: "Solo un administrador renombra canales." };

        const limpio = comoSeGuardaElNombre(nombre);
        if (!limpio) return { success: false, message: "Ponle un nombre al canal." };

        // El `UPDATE` va acotado a la cuenta y al tipo: ni se renombra un canal
        // de otra cuenta, ni se le pone nombre a un directo, que se llama con
        // la otra persona y no con lo que alguien escriba.
        const tocadas = await renombrarUnCanal(quien.cuentaId, canalId, limpio);
        if (!tocadas) return { success: false, message: "Ese canal no se puede renombrar." };
        return { success: true, data: true };
    } catch (error) {
        console.error("[chat-equipo] no se pudo renombrar el canal", error);
        return { success: false, message: "No se pudo renombrar el canal." };
    }
}

/** Cambia quién pertenece a un canal de área. */
export async function ponerMiembrosAction(
    canalId: string,
    miembros: string[],
): Promise<Respuesta<true>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };
        if (!quien.manda) return { success: false, message: "Solo un administrador asigna canales." };

        const fila = await elCanal(quien.cuentaId, canalId);
        if (!fila) return { success: false, message: "Ese canal no existe aquí." };
        if (fila.tipo !== "area") {
            // Un directo son dos y no se toca: meter a un tercero convertiría
            // en grupo una conversación que los dos abrieron como privada.
            return { success: false, message: "Ese canal no admite cambios de gente." };
        }

        const gente = await elEquipo(quien.cuentaId);
        const validos = new Set(gente.map((p) => p.id));
        await ponerLosMiembros(canalId, miembros.filter((m) => validos.has(m)));
        return { success: true, data: true };
    } catch (error) {
        console.error("[chat-equipo] no se pudieron guardar los miembros", error);
        return { success: false, message: "No se pudo guardar." };
    }
}

/**
 * Abre el directo con otra persona de la cuenta, creándolo si no existía.
 *
 * Lo abre **cualquiera**, no solo quien manda: un directo es entre dos, y
 * pedir permiso para hablar con un compañero es tanto como no tenerlo.
 */
export async function abrirDirectoAction(
    conQuienId: string,
): Promise<Respuesta<{ canalId: string }>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };

        const gente = await elEquipo(quien.cuentaId);
        if (!gente.some((p) => p.id === conQuienId)) {
            return { success: false, message: "Esa persona no está en esta cuenta." };
        }

        const llave = llaveDelDirecto(quien.persona.id, conQuienId);
        if (!llave) return { success: false, message: "No puedes abrir un directo contigo." };

        const canalId = await abrirElDirecto({
            id: randomUUID(),
            cuentaId: quien.cuentaId,
            llave,
            miembros: [quien.persona.id, conQuienId],
        });
        return { success: true, data: { canalId } };
    } catch (error) {
        console.error("[chat-equipo] no se pudo abrir el directo", error);
        return { success: false, message: "No se pudo abrir la conversación." };
    }
}
