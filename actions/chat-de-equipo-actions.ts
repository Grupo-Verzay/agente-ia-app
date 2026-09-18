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
    perteneceAlCanal,
    puedeEscribirEnElCanal,
    puedeLeerElCanal,
    soloLasPersonas,
    type CanalDeEquipo,
} from "@/lib/canales-de-equipo";
import {
    abrirElDirecto,
    canalesQueAlcanzan,
    crearUnCanal,
    elCanal,
    guardarUnMensaje,
    laGenteDeLasCuentas,
    leerElHilo,
    marcarLeido,
    ponerLasCuentas,
    ponerLosMiembros,
    renombrarUnCanal,
    sinLeerPorCanal,
    type FilaDeCanal,
} from "@/lib/chat-de-equipo-db";
import {
    esLaCuentaMadre,
    laFamiliaDeLaCuenta,
    type Familia,
} from "@/lib/familia-de-cuentas";
import { db } from "@/lib/db";

type Respuesta<T> = { success: true; data: T } | { success: false; message: string };

export type HiloAbierto = {
    canales: CanalDeEquipo[];
    canalId: string;
    mensajes: MensajeDeEquipo[];
    yo: string;
    /** Quién se puede mencionar AQUÍ: la gente de este canal, no la de la cuenta. */
    equipo: PersonaMencionable[];
    /**
     * Las PERSONAS: con quién se abre un directo y a quién se mete en un canal.
     *
     * No incluye las cuentas vinculadas de la familia —«Verzay | Atencion»,
     * «Verzay Ventas»—: son líneas, no gente. Salían en DIRECTOS y un directo
     * es entre dos personas.
     */
    gente: PersonaMencionable[];
    /**
     * Cómo se llama cada id, cuentas incluidas.
     *
     * Aparte de `gente` a propósito: una cuenta no es alguien con quien hablar,
     * pero sí puede aparecer como autor de un mensaje viejo o como la otra
     * parte de un directo que ya existía. Sin este mapa saldría «Alguien».
     */
    nombres: Record<string, string>;
    puedoEscribir: boolean;
    /** Si quien mira crea, renombra y asigna canales. */
    mando: boolean;
    /**
     * Las cuentas vinculadas que se pueden meter en un canal que cruza.
     *
     * Solo se llena para la cuenta madre: es la única que reparte canales
     * entre cuentas. Para las demás llega vacío y la pantalla ni lo ofrece.
     */
    cuentasDeLaFamilia: { id: string; nombre: string }[];
    /** Si quien mira actúa por la cuenta madre de su familia. */
    soyLaMadre: boolean;
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
          /** La familia: la cuenta madre y sus vinculadas. */
          familia: Familia;
          escritoDesde: string | null;
          manda: boolean;
      }
    | null
> {
    const user = await currentUser();
    if (!user?.id) return null;

    const firma = quienFirma(user);
    if (!firma) return null;

    // `ownerId ?? id` NO sube a la cuenta madre: una cuenta vinculada por
    // `linked_accounts` es de primer nivel y no tiene `ownerId`. Sin esta
    // línea, Grupo Verzay y la gente de Verzay | Atencion escribían cada uno en
    // un General distinto y nadie veía un error.
    const familia = await laFamiliaDeLaCuenta(firma.cuentaId);

    return {
        persona: { id: firma.personaId, nombre: firma.nombre },
        cuentaId: firma.cuentaId,
        familia,
        escritoDesde: firma.escritoDesde,
        // La MISMA puerta que el resto del espacio de trabajo: dueño,
        // administrador y superadministrador de verdad. El `agente` participa
        // pero no manda. Escribir aquí una condición nueva es lo que dejó
        // fuera a media gente en Clientes, Equipo y Analíticas.
        manda: canManageWorkspace(user),
    };
}

/**
 * La gente de la FAMILIA: los equipos de todas sus cuentas y las cuentas
 * mismas.
 *
 * No es `getTeamAdvisorInfos`, y esa es la mitad del arreglo: aquella resuelve
 * la cuenta por dentro desde `currentUser()`, así que solo sabe mirar desde un
 * lado — desde Grupo Verzay traía «Verzay | Atencion» como gente mencionable,
 * pero desde Verzay | Atencion no traía ni a Grupo Verzay ni a sus hermanas.
 * La lista de a quién se podía mencionar y el hilo donde caían los mensajes
 * tenían alcances distintos, que es justo lo que la regla de este chat
 * prohibía.
 */
async function laGente(familia: Familia): Promise<PersonaMencionable[]> {
    return (await laGenteDeLasCuentas(familia.cuentas)).map(comoPersona);
}

/** El mapa de nombres, cuentas incluidas: para nombrar, no para hablar. */
function losNombres(gente: PersonaMencionable[]): Record<string, string> {
    const mapa: Record<string, string> = {};
    for (const p of gente) mapa[p.id] = p.name?.trim() || p.email || "Alguien";
    return mapa;
}

/**
 * Una fila de `User` como persona mencionable.
 *
 * El correo puede venir nulo en la base y aquí es una cadena. Vacío es seguro:
 * `extraerMenciones` se salta las formas vacías, así que una persona sin correo
 * no convierte cada `@` del texto en una mención suya — que es lo que pasaría
 * sin esa guarda.
 */
const comoPersona = (f: {
    id: string;
    name: string | null;
    email: string | null;
    esCuenta?: boolean;
}) => ({
    id: f.id,
    name: f.name,
    email: f.email ?? "",
    esCuenta: Boolean(f.esCuenta),
});

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
    miCuenta: string,
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
            cuentas: [],
        },
    ];

    for (const f of filas) {
        // Un canal con cuentas manda por CUENTA: si la mía está dentro, estoy
        // dentro, sin que nadie me haya añadido a mano.
        const pertenece = perteneceAlCanal({
            personas: f.miembros,
            cuentas: f.cuentas,
            yo,
            miCuenta,
        });
        if (!puedeLeerElCanal({ tipo: f.tipo, pertenece, manda })) continue;

        // Con quién es el directo, **solo si estoy dentro**. En uno que se
        // supervisa sin ser parte, «el miembro que no soy yo» es uno de los dos
        // ajenos — y eso lo metía en «con quien ya hablo», sacándolo de la lista
        // de con quién abrir uno. O sea: el nombre que se pulsa no era el que
        // parecía.
        const pertenezcoAlDirecto = f.tipo === "directo" && f.miembros.includes(yo);
        const otro = pertenezcoAlDirecto ? f.miembros.find((m) => m !== yo) ?? null : null;
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
            cuentas: f.cuentas,
        });
    }

    return lista.sort(ordenDeLosCanales);
}

/** Quién se puede mencionar en un canal: su gente, no la de la cuenta. */
async function losMencionablesDe(
    canal: CanalDeEquipo,
    fila: FilaDeCanal | null,
    gente: PersonaMencionable[],
): Promise<PersonaMencionable[]> {
    // El general es de toda la familia, así que su gente es toda la gente.
    if (canal.tipo === "general") return gente;

    // Un canal que CRUZA: su gente es la de sus cuentas, y esa no tiene por
    // qué estar en la de la familia de quien mira —desde una vinculada, la
    // familia es la misma, pero un canal puede incluir cuentas que no sean de
    // esta familia si algún día se reparte de otra forma—. Se pregunta por las
    // cuentas del canal, que es de donde sale la pertenencia.
    if (fila?.cuentas.length) {
        const filas = await laGenteDeLasCuentas(fila.cuentas);
        const dentro = new Map<string, PersonaMencionable>(
            filas.map((f) => [f.id, comoPersona(f)]),
        );
        // Y los invitados sueltos que además tenga, sin repetir a nadie.
        for (const p of gente) if (fila.miembros.includes(p.id)) dentro.set(p.id, p);
        return Array.from(dentro.values());
    }

    const dentro = new Set(fila?.miembros ?? []);
    return gente.filter((p) => dentro.has(p.id));
}

/**
 * Las cuentas vinculadas que se pueden meter en un canal, con su nombre.
 *
 * Se excluye la madre: ella ya está dentro de todo lo suyo por ser la dueña
 * del canal, y ofrecérsela como una casilla más haría pensar que se puede
 * quitar a sí misma de un canal que creó.
 */
async function lasCuentasVinculadas(
    familia: Familia,
    cuentaId: string,
): Promise<{ id: string; nombre: string }[]> {
    const otras = familia.cuentas.filter((c) => c && c !== cuentaId);
    if (!otras.length) return [];

    const filas = await db.user
        .findMany({
            where: { id: { in: otras } },
            select: { id: true, name: true, email: true },
            orderBy: { name: "asc" },
        })
        .catch((error) => {
            console.warn("[chat-equipo] no se pudieron leer las cuentas vinculadas", error);
            return [] as { id: string; name: string | null; email: string | null }[];
        });

    return filas.map((f) => ({ id: f.id, nombre: f.name?.trim() || f.email || f.id }));
}

/** El hilo de un canal, con la lista de canales al lado. */
export async function hiloDelEquipoAction(
    canalPedido?: string,
): Promise<Respuesta<HiloAbierto>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };

        const [filas, gente] = await Promise.all([
            canalesQueAlcanzan({
                cuentaId: quien.cuentaId,
                personaId: quien.persona.id,
                manda: quien.manda,
            }),
            laGente(quien.familia),
        ]);

        const canales = losCanalesQueVe(
            filas,
            quien.persona.id,
            quien.cuentaId,
            quien.manda,
            gente,
        );

        // Lo que llega del navegador no decide a qué se llega: si el canal
        // pedido no está entre los que esta persona ve, se cae al general en
        // vez de contestar con él.
        const pedido = canalDeLaFila(canalPedido);
        const encontrado = canales.find((c) => c.id === pedido);
        const canal = encontrado ?? canales[0];
        if (!encontrado && pedido !== CANAL_GENERAL) {
            // La caída al general NO puede ser muda. Así es como se veía el
            // directo que no se abría: se pulsaba un nombre y la pantalla
            // volvía al General, sin un error en ninguna parte.
            console.warn("[chat-equipo] se pidió un canal que no está en la lista", {
                pedido,
                cuenta: quien.cuentaId,
                persona: quien.persona.id,
                canales: canales.length,
            });
        }

        const fila = filas.find((f) => f.id === canal.id) ?? null;
        const [mensajes, equipo] = await Promise.all([
            // El general se lee sobre la familia entera; un canal, por su id.
            leerElHilo(quien.familia.cuentas, canal.id),
            losMencionablesDe(canal, fila, gente),
        ]);

        const soyLaMadre = esLaCuentaMadre(quien.familia, quien.cuentaId);

        // Tener el canal delante ES haberlo leído, así que la marca se pone
        // aquí y con la hora del ÚLTIMO MENSAJE QUE SE ENSEÑA — nunca `now()`:
        // un mensaje que entrara entre esta consulta y la marca quedaría dado
        // por leído sin que nadie lo hubiera visto, y un mensaje que se pierde
        // así no vuelve a avisar nunca.
        //
        // No lanza: el hilo ya está leído y eso es lo que la persona vino a
        // hacer. Pero no es mudo — una marca que no se guarda se ve como un
        // contador que no baja.
        const ultimo = mensajes[mensajes.length - 1];
        if (ultimo) {
            await marcarLeido(quien.persona.id, canal.id, new Date(ultimo.creadoEn)).catch(
                (error) => {
                    console.warn("[chat-equipo] no se pudo marcar el canal como leído", {
                        canal: canal.id,
                        error: error instanceof Error ? error.message : String(error),
                    });
                },
            );
        }

        return {
            success: true,
            data: {
                canales,
                canalId: canal.id,
                mensajes,
                yo: quien.persona.id,
                equipo: soloLasPersonas(equipo, quien.familia.raiz),
                gente: soloLasPersonas(gente, quien.familia.raiz),
                nombres: losNombres(gente),
                puedoEscribir: canal.puedoEscribir,
                mando: quien.manda,
                // Solo la madre reparte canales entre cuentas, así que solo
                // ella recibe la lista. Sin esto, la pantalla de una vinculada
                // ofrecería unas casillas que la acción luego rechaza.
                cuentasDeLaFamilia:
                    soyLaMadre && quien.manda
                        ? await lasCuentasVinculadas(quien.familia, quien.cuentaId)
                        : [],
                soyLaMadre,
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
            canalesQueAlcanzan({
                cuentaId: quien.cuentaId,
                personaId: quien.persona.id,
                manda: quien.manda,
            }),
            laGente(quien.familia),
        ]);
        const canales = losCanalesQueVe(
            filas,
            quien.persona.id,
            quien.cuentaId,
            quien.manda,
            gente,
        );
        const canal = canales.find((c) => c.id === canalDeLaFila(canalPedido));
        if (!canal) return { success: false, message: "Ese canal no existe aquí." };
        if (!canal.puedoEscribir) {
            return { success: false, message: "No puedes escribir en este canal." };
        }

        // A quién se mencionó lo decide el SERVIDOR, y sobre la gente de ESTE
        // canal. Lo que diga el navegador no se da por bueno: sería una lista
        // de destinatarios que llega de fuera.
        const fila = filas.find((f) => f.id === canal.id) ?? null;
        const mencionados = extraerMenciones(
            limpio,
            await losMencionablesDe(canal, fila, gente),
        );

        // Bajo qué cuenta cae el mensaje: la del CANAL, o la raíz de la familia
        // si es el general. Nunca la de quien escribe — así el hilo de un canal
        // que cruza no se parte en tantos trozos como cuentas tenga dentro, y
        // el general converge en un solo sitio. Es la misma regla que ya rige
        // en Proyectos compartidos.
        const cuentaDelMensaje = fila?.cuentaId || quien.familia.raiz || quien.cuentaId;

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
            cuentaId: cuentaDelMensaje,
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
                    // Contabilidad, no permiso: la campanita y la ventana leen
                    // por `destinatarioId`, así que un aviso llega a su persona
                    // esté en la cuenta que esté — que es lo que hace que una
                    // mención en un canal que cruza funcione sin tocar nada.
                    ownerId: cuentaDelMensaje,
                    destinatarioId,
                    actorId: quien.persona.id,
                    actorNombre: quien.persona.nombre,
                    tipo: "mencion" as const,
                    titulo: tituloDelAviso("mencion", quien.persona.nombre, ""),
                    texto: limpio,
                    // El canal Y el mensaje viajan en el aviso. El canal, para
                    // que el clic abra la conversación donde se dijo y no el
                    // general; el mensaje, porque en un canal con tráfico
                    // aterrizar al final del hilo no es encontrar la mención —
                    // hay que ponerla delante.
                    enlace:
                        `/chat-equipo?canal=${encodeURIComponent(canal.id)}` +
                        `&mensaje=${encodeURIComponent(mensaje.id)}`,
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
    cuentas: string[] = [],
): Promise<Respuesta<{ canalId: string }>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };
        if (!quien.manda) return { success: false, message: "Solo un administrador crea canales." };

        const limpio = comoSeGuardaElNombre(nombre);
        if (!limpio) return { success: false, message: "Ponle un nombre al canal." };

        // Quién puede estar dentro sale de la gente de ESTA familia, no de la
        // lista que llegue: una lista de fuera metería en un canal a alguien de
        // otra cuenta, y entonces sus mensajes le llegarían.
        const gente = await laGente(quien.familia);
        const validos = new Set(gente.map((p) => p.id));
        const dentro = miembros.filter((m) => validos.has(m));

        const queCuentas = lasCuentasQueSePuedenMeter(quien, cuentas);
        if (queCuentas === null) {
            return {
                success: false,
                message: "Solo la cuenta principal puede repartir un canal entre cuentas.",
            };
        }

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
            cuentas: queCuentas,
        });
        return { success: true, data: { canalId } };
    } catch (error) {
        console.error("[chat-equipo] no se pudo crear el canal", error);
        return { success: false, message: "No se pudo crear el canal." };
    }
}

/**
 * Qué cuentas se pueden meter en un canal.
 *
 * `null` = no se puede, y quien llama lo convierte en un mensaje. Vacío = un
 * canal de una sola cuenta, que es lo de siempre.
 *
 * **Solo la cuenta madre reparte canales entre cuentas**, y solo entre las de
 * SU familia. Las dos mitades importan: sin la primera, el administrador de
 * una vinculada se metería en las cuentas hermanas; sin la segunda, una lista
 * que llega del navegador podría nombrar cualquier cuenta de la plataforma y
 * su gente empezaría a leer este canal.
 */
function lasCuentasQueSePuedenMeter(
    quien: { cuentaId: string; familia: Familia; manda: boolean },
    pedidas: string[],
): string[] | null {
    const limpias = Array.from(new Set((pedidas ?? []).map((c) => c?.trim()).filter(Boolean)));
    if (!limpias.length) return [];

    if (!esLaCuentaMadre(quien.familia, quien.cuentaId) || !quien.manda) return null;

    const deLaFamilia = new Set(quien.familia.cuentas);
    const validas = limpias.filter((c) => deLaFamilia.has(c));
    if (!validas.length) return null;

    // La madre entra siempre en un canal suyo que cruza: es la dueña, y sin
    // ella dentro su propia gente se quedaría fuera del canal que acaba de
    // repartir.
    return Array.from(new Set([quien.cuentaId, ...validas]));
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
    cuentas?: string[],
): Promise<Respuesta<true>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };
        if (!quien.manda) return { success: false, message: "Solo un administrador asigna canales." };

        // `elCanal` acota a la cuenta de quien llama, así que un canal que
        // cruza solo lo toca su DUEÑA: el administrador de una vinculada
        // participa en él, pero no agrega ni quita cuentas ni gente.
        const fila = await elCanal(quien.cuentaId, canalId);
        if (!fila) return { success: false, message: "Ese canal no existe aquí." };
        if (fila.tipo !== "area") {
            // Un directo son dos y no se toca: meter a un tercero convertiría
            // en grupo una conversación que los dos abrieron como privada.
            return { success: false, message: "Ese canal no admite cambios de gente." };
        }

        const gente = await laGente(quien.familia);
        const validos = new Set(gente.map((p) => p.id));
        await ponerLosMiembros(canalId, miembros.filter((m) => validos.has(m)));

        // Las cuentas solo se tocan si llegaron: sin el campo, un canal que ya
        // cruzaba se quedaría sin ninguna cuenta al guardar solo la gente, y
        // desaparecería de la pantalla de todas menos de la suya.
        if (cuentas !== undefined) {
            const queCuentas = lasCuentasQueSePuedenMeter(quien, cuentas);
            if (queCuentas === null) {
                return {
                    success: false,
                    message: "Solo la cuenta principal puede repartir un canal entre cuentas.",
                };
            }
            await ponerLasCuentas(canalId, queCuentas);
        }

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

        const gente = await laGente(quien.familia);
        if (!gente.some((p) => p.id === conQuienId)) {
            return { success: false, message: "Esa persona no está en esta cuenta." };
        }

        const llave = llaveDelDirecto(quien.persona.id, conQuienId);
        if (!llave) return { success: false, message: "No puedes abrir un directo contigo." };

        const canalId = await abrirElDirecto({
            id: randomUUID(),
            // Bajo la RAÍZ de la familia, no bajo la cuenta de quien lo abre:
            // si no, el directo entre dos personas de cuentas hermanas saldría
            // duplicado —uno por cada lado, con la mitad de los mensajes en
            // cada uno—, que es el mismo fallo que la llave ordenada evita
            // dentro de una cuenta.
            cuentaId: quien.familia.raiz || quien.cuentaId,
            llave,
            miembros: [quien.persona.id, conQuienId],
        });
        return { success: true, data: { canalId } };
    } catch (error) {
        console.error("[chat-equipo] no se pudo abrir el directo", error);
        return { success: false, message: "No se pudo abrir la conversación." };
    }
}

/**
 * Cuántos mensajes sin leer tiene quien mira, en total y por canal.
 *
 * Es lo que alimenta el número del botón del borde, así que corre **con el
 * panel cerrado** y en todas las pantallas de la App. De ahí las dos cosas que
 * la hacen barata: una consulta para todos los canales, y nada de traerse los
 * mensajes — solo se cuentan.
 *
 * **Suma solo los canales donde se PERTENECE**, no los que se pueden leer. Un
 * administrador lee todos los directos de su cuenta; contárselos le pondría
 * encima el tráfico de todo el mundo, que es tanto como no tener contador.
 */
export async function sinLeerDelEquipoAction(): Promise<
    Respuesta<{ total: number; porCanal: Record<string, number> }>
> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };

        const [filas, gente] = await Promise.all([
            canalesQueAlcanzan({
                cuentaId: quien.cuentaId,
                personaId: quien.persona.id,
                manda: quien.manda,
            }),
            laGente(quien.familia),
        ]);
        const canales = losCanalesQueVe(
            filas,
            quien.persona.id,
            quien.cuentaId,
            quien.manda,
            gente,
        );

        const mios = canales.filter((c) => c.pertenezco && c.tipo !== "general").map((c) => c.id);
        const cuentas = await sinLeerPorCanal({
            personaId: quien.persona.id,
            canales: mios,
            familia: quien.familia.cuentas,
            // El general es de toda la familia y se pertenece a él siempre.
            conGeneral: canales.some((c) => c.tipo === "general"),
        });

        const porCanal: Record<string, number> = {};
        let total = 0;
        for (const c of cuentas) {
            porCanal[c.canalId] = c.sinLeer;
            total += c.sinLeer;
        }

        return { success: true, data: { total, porCanal } };
    } catch (error) {
        // Mudo aquí se ve como «el contador nunca sube», que es justo el fallo
        // que esto viene a arreglar.
        console.warn("[chat-equipo] no se pudo contar lo que falta por leer", error);
        return { success: false, message: "No se pudo contar." };
    }
}
