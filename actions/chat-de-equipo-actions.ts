"use server";

import { randomUUID } from "crypto";

import { elOrigenDeLaApp } from "@/lib/origen-de-la-app";
import { currentUser } from "@/lib/auth";
import { crearLosAvisos } from "@/lib/avisos-de-tarea";
import { ponerElSonido, quiereSonido } from "@/lib/preferencias-de-persona-db";
import { aQuienSeLeEmpuja, type AvisoDelEquipo } from "@/lib/aviso-del-equipo";
import {
    comoSeGuardaLaNota,
    laCuentaQuePagaLaTranscripcion,
    puedePedirLaTranscripcion,
} from "@/lib/nota-de-voz-del-equipo";
import { costoDeLaNota, queHacerConLaNota } from "@/lib/transcripcion-de-voz";
import { llaveDelArchivoSubido } from "@/lib/llave-del-bucket";
import {
    descontarLaTranscripcion,
    laClaveDeOpenAi,
    losCreditosQueQuedan,
    pedirleElTextoAOpenAi,
} from "@/lib/creditos-de-transcripcion";
import { empujarAviso } from "@/lib/empujar-aviso";
import { tituloDelAviso } from "@/lib/avisos-de-tarea-tipos";
import { canManageWorkspace } from "@/lib/workspace-roles";
import {
    comoSeGuardaElTexto,
    extraerMenciones,
    quienFirma,
    type MensajeDeEquipo,
    type PersonaMencionable,
} from "@/lib/chat-de-equipo";
import { comoSeGuardaElChat } from "@/lib/chat-compartido";
import { resolveInstanceOwner } from "@/lib/chat-persistence";
import { assertCanAccessTargetUser } from "@/actions/billing/helpers/app-access-guard";
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
import { apartarLasReuniones } from "@/lib/enlaces-del-texto";
import {
    abrirElDirecto,
    buscarEnElEquipo,
    canalesQueAlcanzan,
    crearUnCanal,
    elCanal,
    elHiloAlrededorDe,
    elAudioDelMensaje,
    elMensaje,
    guardarLaTranscripcion,
    guardarUnMensaje,
    loQuePuedeSonar,
    alternarLaReaccion,
    borrarElMensaje,
    editarElTexto,
    elMensajeQueSeToca,
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
    TOPE_DE_RESULTADOS,
    comoConsultaDeBusqueda,
    comoExtractoDeCita,
    comoIdDeMensaje,
    type ResultadoDeBusqueda,
} from "@/lib/busqueda-del-equipo";
import {
    esLaCuentaMadre,
    laFamiliaDeLaCuenta,
    type Familia,
} from "@/lib/familia-de-cuentas";
import { db } from "@/lib/db";
import {
    comoSeGuardaElAdjunto,
    loQueSeLeeDeUnAdjunto,
} from "@/lib/adjuntos-del-equipo";
import { comoSeGuardaLaReaccion } from "@/lib/reacciones-del-equipo";
import { sePuedeBorrar, sePuedeEditar } from "@/lib/editar-del-equipo";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
import { confirmaLaLimpieza } from "@/lib/historial-del-equipo";
import { limpiarLaConversacion, quitarDelBucket } from "@/lib/historial-del-equipo.server";
import { posicionesDelTablero } from "@/lib/orden-de-tablero-db";
import type { PosicionesDelTablero } from "@/lib/orden-del-tablero";

type Respuesta<T> = { success: true; data: T } | { success: false; message: string };

export type HiloAbierto = {
    canales: CanalDeEquipo[];
    canalId: string;
    mensajes: MensajeDeEquipo[];
    yo: string;
    /**
     * La cuenta por la que se está mirando.
     *
     * Baja al navegador **solo para la llave del último canal abierto**: ese
     * recuerdo se separa por cuenta y por persona, y `yo` de aquí al lado es
     * la persona. No abre nada — a qué canal se llega lo sigue decidiendo
     * `losCanalesQueVe`, aquí mismo.
     */
    cuentaId: string;
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
    /**
     * El origen de la plataforma, para que la burbuja sepa qué enlace es suyo.
     *
     * Viene del SERVIDOR y no se lee de `window` al pintar: la burbuja también
     * se pinta en el servidor, y leer ahí `window` daría una salida distinta
     * en cada lado — o sea una hidratación rota. Y es el de la petición, no una
     * variable fija: la App se abre por más de un dominio.
     */
    origen: string;
    /**
     * Las reuniones que se nombran en esta página, por su código.
     *
     * Resueltas en UNA consulta y solo si algún mensaje trae un enlace de
     * reunión: la inmensa mayoría de las páginas no trae ninguno y entonces no
     * cuesta nada. Lo que no esté aquí se pinta como una tarjeta genérica.
     */
    reuniones: Record<string, { titulo: string | null; abierta: boolean; dentro: number }>;
    /**
     * Si quien mira puede LIMPIAR el historial de una conversación.
     *
     * Solo el súper administrador de verdad (`esSuperAdminDeVerdad`), esté en
     * la cuenta que esté —y nunca dentro de la de un cliente por «Ingresar»,
     * que es la excepción de esa misma función—. Enseñar el botón no es abrir
     * la puerta: `limpiarHistorialDelCanalAction` lo vuelve a preguntar.
     */
    puedoLimpiar: boolean;
    /**
     * El orden que ESTA persona le puso a su lista de directos, por la persona
     * con quien habla (`lib/orden-de-los-directos.ts`). Vacío = sin tocar.
     */
    ordenDeDirectos: PosicionesDelTablero;
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
          /** Súper administrador de verdad: el único que limpia un historial. */
          superAdmin: boolean;
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
        superAdmin: esSuperAdminDeVerdad(user),
    };
}

/**
 * El orden de los directos de esta persona.
 *
 * **Nunca tumba el hilo**: si no se puede leer, la lista sale en el orden de
 * siempre, que es exactamente lo que había antes de que esto existiera. Pero
 * no es mudo — un orden que se guarda y al volver no está se lee como que la
 * App pierde lo que haces.
 */
async function elOrdenDeMisDirectos(personaId: string): Promise<PosicionesDelTablero> {
    try {
        return await posicionesDelTablero("directos", personaId);
    } catch (error) {
        console.warn("[chat-equipo] no se pudo leer el orden de los directos", {
            persona: personaId,
            error: error instanceof Error ? error.message : String(error),
        });
        return {};
    }
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
    /**
     * El mensaje al que hay que llegar, si se viene de un resultado de búsqueda
     * o de un aviso.
     *
     * Sin esto se traen los ÚLTIMOS `TOPE_DE_MENSAJES`, y un resultado de hace
     * tres meses no está entre ellos: se aterrizaba al final del hilo y el
     * anillo no aparecía nunca. Con esto se trae el hilo **alrededor** de ese
     * mensaje.
     */
    mensajePedido?: string | null,
    /**
     * Si el canal pedido sale de un RECUERDO y no de algo que se pulsó.
     *
     * Lo único que cambia es el aviso de la caída al General, y por eso no es
     * cosmético: esa caída **no puede ser muda** cuando alguien pulsó algo
     * —así se veía el directo que no se abría—, pero un canal recordado que
     * ya no existe es lo normal (lo borraron, o esa persona salió de él). Sin
     * separarlos, el aviso saltaría a diario por comportamiento correcto y se
     * aprendería a despachar sin leer.
     */
    deRecuerdo?: boolean,
): Promise<Respuesta<HiloAbierto>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };

        const [filas, gente, ordenDeDirectos] = await Promise.all([
            canalesQueAlcanzan({
                cuentaId: quien.cuentaId,
                personaId: quien.persona.id,
                manda: quien.manda,
            }),
            laGente(quien.familia),
            elOrdenDeMisDirectos(quien.persona.id),
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
            //
            // Pero un canal RECORDADO que ya no está es lo esperado, no un
            // fallo, así que va como `info`: con el mismo `warn` para los dos,
            // el aviso saltaría cada vez que alguien sale de un canal y
            // dejaría de señalar nada. El navegador se cura solo — se le
            // devuelve el General y eso es lo que guarda.
            const donde = "[chat-equipo] se pidió un canal que no está en la lista";
            const detalle = {
                pedido,
                cuenta: quien.cuentaId,
                persona: quien.persona.id,
                canales: canales.length,
            };
            if (deRecuerdo) console.info(`${donde} (recordado, se abre el General)`, detalle);
            else console.warn(donde, detalle);
        }

        const fila = filas.find((f) => f.id === canal.id) ?? null;
        // Si se viene a por un mensaje concreto, el hilo se trae ALREDEDOR de
        // él. Y si ese mensaje ya no está —se pudo borrar entre encontrarlo y
        // pulsarlo— se cae al hilo de siempre: mejor el final de la
        // conversación que una pantalla vacía.
        const aPorUno = comoIdDeMensaje(mensajePedido);
        const [mensajes, equipo] = await Promise.all([
            aPorUno
                ? elHiloAlrededorDe({
                      canalId: canal.id,
                      cuentas: quien.familia.cuentas,
                      mensajeId: aPorUno,
                      yo: quien.persona.id,
                  }).then((alrededor) =>
                      alrededor.length
                          ? alrededor
                          : leerElHilo(quien.familia.cuentas, canal.id, quien.persona.id),
                  )
                // El general se lee sobre la familia entera; un canal, por su id.
                : leerElHilo(quien.familia.cuentas, canal.id, quien.persona.id),
            losMencionablesDe(canal, fila, gente),
        ]);

        const soyLaMadre = esLaCuentaMadre(quien.familia, quien.cuentaId);
        const origen = await elOrigenDeLaApp();

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
                cuentaId: quien.cuentaId,
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
                origen,
                reuniones: await lasReunionesDeEstaPagina(mensajes, canal.id, origen),
                puedoLimpiar: quien.superAdmin,
                ordenDeDirectos,
            },
        };
    } catch (error) {
        console.error("[chat-equipo] no se pudo leer el hilo", error);
        return { success: false, message: "No se pudo cargar el chat del equipo." };
    }
}


/**
 * Las reuniones nombradas en esta página de mensajes.
 *
 * **Solo se consulta si hay alguna.** La inmensa mayoría de las páginas no
 * trae ningún enlace de reunión, y el hilo se relee cada cinco segundos: una
 * consulta incondicional aquí sería una más en el camino más caliente de la
 * pantalla, para no devolver nada.
 *
 * Y **nunca tumba el hilo**: si falla, los mensajes salen igual y la tarjeta
 * se pinta genérica. Pero no es muda — una tarjeta sin nombre sin explicación
 * se lee como que la reunión se perdió.
 */
async function lasReunionesDeEstaPagina(
    mensajes: MensajeDeEquipo[],
    canalId: string,
    origen: string,
): Promise<Record<string, { titulo: string | null; abierta: boolean; dentro: number }>> {
    if (!origen) return {};
    const codigos: string[] = [];
    for (const m of mensajes) {
        if (!m.texto) continue;
        for (const c of apartarLasReuniones(m.texto, origen).codigos) {
            if (!codigos.includes(c)) codigos.push(c);
        }
    }
    if (!codigos.length) return {};

    try {
        const { lasReunionesDeLosMensajes } = await import("@/lib/salas-de-video-db");
        const mapa = await lasReunionesDeLosMensajes(codigos, canalId);
        return Object.fromEntries(mapa);
    } catch (error) {
        console.warn("[chat-equipo] no se pudieron leer las reuniones del hilo", error);
        return {};
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
/**
 * Los canales donde esta persona PUEDE ESCRIBIR, para el diálogo de Chats.
 *
 * Trae lo mínimo —id, nombre y tipo— y **ni un mensaje**: se pide al abrir el
 * diálogo, desde una pantalla que ya es de las más caras de la App. Llamar a
 * `hiloDelEquipoAction` aquí traería el hilo entero del general por el gusto de
 * pintar un desplegable.
 *
 * Y se filtra por `puedoEscribir`, no por `pertenezco`: un administrador LEE
 * los directos de su cuenta y **no escribe en ellos** —meterse en la
 * conversación de otros dos no es supervisar, es suplantar—, así que
 * ofrecérselos sería ofrecer un destino que la acción luego rechaza. Un botón
 * que al pulsarlo da error es peor que no tenerlo.
 */
export async function canalesParaCompartirAction(): Promise<
    Respuesta<{ canales: { id: string; nombre: string; tipo: string }[] }>
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
        )
            .filter((c) => c.puedoEscribir)
            .map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo }));

        return { success: true, data: { canales } };
    } catch (error) {
        // Mudo aquí se ve como un desplegable vacío, que se lee como «no
        // tengo ningún canal» y no como un fallo.
        console.warn("[chat-equipo] no se pudieron leer los canales para compartir", error);
        return { success: false, message: "No se pudieron cargar los canales." };
    }
}

/**
 * Si esa línea es de una cuenta sobre la que manda quien está llamando.
 *
 * Es la misma puerta que el resto de la App —`assertCanAccessTargetUser` sobre
 * el dueño que resuelve `resolveInstanceOwner`—, y va aquí y no en la pantalla
 * por el motivo de siempre: **esconder el botón no cierra la petición
 * directa**. Sin esto, cualquiera publicaría en su canal una referencia a una
 * línea ajena, con el nombre y el número de un contacto que no es suyo.
 *
 * Y **no lanza**: devuelve un `false` que quien llama convierte en un aviso.
 * Un `throw` aquí acabaría en el `catch` de la acción como «Error interno»,
 * que es tanto como no decir por qué.
 */
async function esMiLinea(instanceName: string): Promise<boolean> {
    try {
        const linea = await resolveInstanceOwner(instanceName);
        if (!linea?.userId) return false;
        await assertCanAccessTargetUser(linea.userId);
        return true;
    } catch (error) {
        console.warn("[chat-equipo] no se pudo compartir esa línea", {
            instanceName,
            error: error instanceof Error ? error.message : error,
        });
        return false;
    }
}

export async function enviarAlEquipoAction(
    texto: string,
    canalPedido?: string,
    /**
     * La conversación de Chats que el mensaje señala, si señala alguna.
     *
     * Llega del navegador, así que **no se da por buena**: se sanea y, sobre
     * todo, se comprueba que esa línea sea de una cuenta sobre la que quien
     * escribe manda. Sin eso, cualquiera publicaría una referencia a una línea
     * ajena y el equipo del canal vería nombre y número de un contacto que no
     * es suyo.
     */
    chatPedido?: {
        linea?: string;
        jid?: string;
        identidades?: string[];
        nombre?: string | null;
        numero?: string | null;
    },
    /**
     * El mensaje al que se responde, si se responde a alguno.
     *
     * Llega solo el **id**: el nombre y el extracto los copia el servidor del
     * original, no el navegador. Si los mandara el navegador, cualquiera
     * publicaría un recuadro de cita con el texto que quisiera a nombre de
     * quien quisiera — una cita falsa que parece la de verdad.
     */
    citaPedida?: string | null,
    /**
     * La nota de voz, cuando el mensaje es una.
     *
     * Llega **ya subida al bucket** por el navegador, por el mismo `/api/upload`
     * que usan los adjuntos de una tarea — que ya comprueba sesión y que la
     * carpeta sea de una cuenta sobre la que se manda. Aquí se vuelve a
     * comprobar que la dirección sea de NUESTRO bucket y con la forma que
     * escribe esa ruta: lo que llega del navegador no decide qué se guarda.
     */
    audioPedido?: { url?: string; segundos?: number; mime?: string | null } | null,
    /**
     * El archivo que lleva el mensaje, si lleva alguno.
     *
     * Llega **ya subido al bucket** por el mismo `/api/upload` que los
     * adjuntos de una tarea y las notas de voz — esa ruta ya comprueba sesión
     * y que la carpeta sea de una cuenta sobre la que se manda. Aquí se vuelve
     * a comprobar que la dirección sea de NUESTRO bucket y con la forma que
     * escribe esa ruta: sin eso, la burbuja pintaría un `<img>` —o un
     * `<video>`— apuntando a donde dijera quien manda el mensaje, y esa
     * petición saldría del navegador de todo el canal.
     *
     * **Uno por mensaje.** Varios archivos son varios mensajes, y los manda la
     * pantalla en serie; ver `lib/adjuntos-del-equipo.ts`.
     */
    adjuntoPedido?: {
        url?: string;
        nombre?: string | null;
        mime?: string | null;
        tamano?: number;
    } | null,
): Promise<Respuesta<{ mensaje: MensajeDeEquipo; canalId: string }>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };

        const limpio = comoSeGuardaElTexto(texto);
        // La nota de voz, saneada antes de mirar nada más: si la dirección no
        // es de nuestro bucket no hay nota, y entonces el mensaje vuelve a
        // necesitar texto.
        const audio = comoSeGuardaLaNota(audioPedido, {
            publicUrl: process.env.S3_PUBLIC_URL,
            nombre: process.env.S3_BUCKET_NAME || "verzay-media",
        });
        if (audioPedido?.url && !audio) {
            // No es mudo: un botón de enviar que se pulsa y publica un mensaje
            // vacío se lee como que la App perdió la grabación.
            console.warn("[chat-equipo] llegó una nota de voz que no es de nuestro bucket", {
                url: audioPedido.url,
            });
            return { success: false, message: "No se pudo adjuntar la nota de voz." };
        }
        // El ARCHIVO, por la misma puerta y con la misma regla: si la
        // dirección no es de nuestro bucket no hay adjunto, y entonces el
        // mensaje vuelve a necesitar texto.
        const adjunto = comoSeGuardaElAdjunto(adjuntoPedido, {
            publicUrl: process.env.S3_PUBLIC_URL,
            nombre: process.env.S3_BUCKET_NAME || "verzay-media",
        });
        if (adjuntoPedido?.url && !adjunto) {
            console.warn("[chat-equipo] llegó un adjunto que no es de nuestro bucket", {
                url: adjuntoPedido.url,
            });
            return { success: false, message: "No se pudo adjuntar ese archivo." };
        }
        // Una nota de voz —o un archivo— ES el mensaje: con ellos, el texto
        // sobra. Sin esta condición, grabar y enviar contestaba «Escribe algo
        // antes de enviar» con la nota ya subida al bucket — o sea, el botón
        // no hace nada y además deja basura.
        if (!limpio && !audio && !adjunto) {
            return {
                success: false,
                message: "Escribe algo, adjunta un archivo o graba una nota antes de enviar.",
            };
        }

        const chat = chatPedido ? comoSeGuardaElChat(chatPedido) : null;
        if (chatPedido && !chat) {
            // Media referencia no es una referencia: sin línea no hay a dónde
            // llevar y sin jid no hay qué abrir. Y se dice, porque desde fuera
            // un mensaje que sale sin la tarjeta se lee como que el botón no
            // hizo nada.
            console.warn("[chat-equipo] se pidió compartir un chat incompleto", {
                linea: chatPedido.linea,
                tieneJid: Boolean(chatPedido.jid),
            });
            return { success: false, message: "No se pudo identificar esa conversación." };
        }
        if (chat && !(await esMiLinea(chat.linea))) {
            return { success: false, message: "Esa conversación no es de una línea tuya." };
        }

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

        // La CITA. Se resuelve aquí, con el canal ya comprobado, y son dos
        // preguntas distintas:
        //
        // 1. **El texto lo copia el servidor del original**, no el navegador.
        //    Aceptando el extracto de fuera, cualquiera publicaría una cita
        //    falsa con el nombre de otro y con el aspecto de una de verdad.
        // 2. **Solo se cita del MISMO canal.** Es lo que impide que una cita
        //    sea una forma de sacar contenido de donde no se puede leer: quien
        //    administra lee los directos de su cuenta, así que sin esta
        //    condición podría citar un directo dentro del general y enseñárselo
        //    a todo el equipo con un clic.
        let cita: { id: string; autorNombre: string | null; extracto: string } | null = null;
        const idCitado = comoIdDeMensaje(citaPedida);
        if (citaPedida && !idCitado) {
            console.warn("[chat-equipo] se pidió citar un id que no lo es", { citaPedida });
        }
        if (idCitado) {
            const original = await elMensaje(idCitado);
            // Un mensaje BORRADO no se cita: su contenido ya no está, así que
            // el recuadro saldría vacío. Se trata como «no existe», que es lo
            // que es a efectos de citarlo.
            const mismoCanal =
                original &&
                !original.borradoEn &&
                canalDeLaFila(original.canalId) === canal.id;
            if (!mismoCanal) {
                // No es mudo: desde fuera, un mensaje que sale sin el recuadro
                // se lee como que la cita no funciona.
                console.warn("[chat-equipo] se pidió citar un mensaje de otro canal", {
                    citado: idCitado,
                    canal: canal.id,
                    existe: Boolean(original),
                });
                return {
                    success: false,
                    message: "Solo puedes citar un mensaje de esta misma conversación.",
                };
            }
            cita = {
                id: original.id,
                autorNombre: original.autorNombre,
                // Una nota de voz no tiene texto, así que su extracto saldría
                // EN BLANCO: un recuadro de cita vacío no dice a qué se está
                // respondiendo, que es lo único para lo que sirve.
                extracto:
                    comoExtractoDeCita(original.texto) ||
                    (original.audioUrl ? "🎤 Nota de voz" : "") ||
                    // Un mensaje que solo lleva un archivo tiene el texto
                    // VACÍO, igual que una nota de voz: un recuadro de cita en
                    // blanco no dice a qué se está respondiendo, que es lo
                    // único para lo que sirve.
                    (original.adjuntoUrl
                        ? loQueSeLeeDeUnAdjunto({
                              mime: original.adjuntoMime,
                              nombre: original.adjuntoNombre,
                              url: original.adjuntoUrl,
                          })
                        : ""),
            };
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
            chat,
            // Recién escrita, el original está: se acaba de comprobar.
            cita: cita ? { ...cita, sigueAhi: true } : null,
            audio,
            // Recién enviada, nadie la ha pedido todavía: se transcribe **bajo
            // demanda**, nunca sola.
            transcripcion: null,
            adjunto,
            // Recién escrito, nadie ha reaccionado ni lo ha tocado.
            reacciones: [],
            editadoEn: null,
            borradoEn: null,
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
            chat,
            cita,
            audio,
            adjunto,
        });

        // Lo que se lee en un aviso cuando el mensaje es solo una nota de voz.
        // Sin esto, la ventana que interrumpe y el empuje al teléfono salían
        // con el cuerpo **vacío**: un aviso en blanco no dice ni quién escribió
        // ni de qué, y se despacha sin mirar — que es el fallo del que viene
        // toda esta familia.
        const loQueSeLee =
            limpio ||
            (audio ? "🎤 Nota de voz" : "") ||
            (adjunto ? loQueSeLeeDeUnAdjunto(adjunto) : "");

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
                    texto: loQueSeLee,
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

        // Y el EMPUJE, que es lo único que llega con la plataforma cerrada.
        //
        // Las condiciones son **las mismas que las del sonido** y por eso las
        // decide la misma función, `aQuienSeLeEmpuja`, que vive al lado de
        // `loQueMereceSonar`: un directo, o una mención en cualquier canal. Con
        // la regla copiada aquí, el día que se afine una la otra se queda
        // atrás, y eso no se ve como un error — se ve como «a veces suena y no
        // me llega el aviso».
        //
        // Va **de fondo, sin `await`**: el mensaje ya está guardado, y hablar
        // con FCM o con Apple puede tardar segundos que quien escribe no tiene
        // por qué esperar. `empujarAviso` nunca lanza y, sin las llaves VAPID
        // puestas, no hace absolutamente nada.
        const aEmpujar = aQuienSeLeEmpuja({
            tipo: canal.tipo,
            miembros: fila?.miembros ?? [],
            autorId: quien.persona.id,
            mencionados,
        });
        if (aEmpujar.length) {
            void empujarAviso(aEmpujar, {
                // En un directo, quién escribe basta. En un canal, además
                // dónde: `canal.nombre` de un directo es el nombre de la OTRA
                // persona resuelto para quien mira, así que ahí diría el nombre
                // de quien recibe el aviso.
                titulo:
                    canal.tipo === "directo"
                        ? quien.persona.nombre || "Mensaje del equipo"
                        : `${quien.persona.nombre || "Alguien"} en ${canal.nombre}`,
                texto: loQueSeLee,
                url:
                    `/chat-equipo?canal=${encodeURIComponent(canal.id)}` +
                    `&mensaje=${encodeURIComponent(mensaje.id)}`,
                // **La misma etiqueta que usa `avisarEnElSistema`** en
                // `hooks/useSinLeerDelEquipo`, y no es un detalle: con la
                // pestaña abierta llegan los dos caminos, y con etiquetas
                // distintas el mismo mensaje saldría dos veces. Además agrupa
                // por conversación: cinco mensajes del mismo canal son un
                // aviso, no cinco.
                etiqueta: `chat-equipo-${canal.id}`,
            }).catch((error) => {
                console.warn("[push] falló el empuje del chat de equipo", error);
            });
        }

        return { success: true, data: { mensaje, canalId: canal.id } };
    } catch (error) {
        console.error("[chat-equipo] no se pudo enviar el mensaje", error);
        return { success: false, message: "No se pudo enviar. Inténtalo de nuevo." };
    }
}

/**
 * El canal de un mensaje, con la puerta ya resuelta.
 *
 * **Se pregunta contra el canal del MENSAJE, nunca contra el que diga el
 * navegador.** Sin esto, mandar el id de un mensaje de un directo ajeno sería
 * reaccionar —o intentar borrar— dentro de él. Es la misma forma en que la
 * transcripción resuelve su puerta, y por eso las tres acciones de abajo
 * entran por aquí y no repiten la cadena.
 *
 * Devuelve también `pertenezco` y `puedoEscribir`, que son **dos preguntas
 * distintas** y cada cosa usa la suya: reaccionar pide pertenecer, editar y
 * borrar piden poder escribir.
 */
async function elCanalDeUnMensaje(mensajeId: string): Promise<
    | {
          quien: NonNullable<Awaited<ReturnType<typeof quienYDonde>>>;
          mensaje: NonNullable<Awaited<ReturnType<typeof elMensajeQueSeToca>>>;
          canal: CanalDeEquipo;
          fila: FilaDeCanal | null;
      }
    | { error: string }
> {
    const quien = await quienYDonde();
    if (!quien) return { error: "No autorizado." };

    const mensaje = await elMensajeQueSeToca(comoIdDeMensaje(mensajeId) ?? "");
    // «No existe» y «no puedes» se contestan igual a propósito: decir «no
    // puedes» sobre un id ya revela que ese mensaje existe. Misma regla que
    // `getFlowAction` y que un proyecto no compartido.
    if (!mensaje) return { error: "Ese mensaje ya no está." };

    const filas = await canalesQueAlcanzan({
        cuentaId: quien.cuentaId,
        personaId: quien.persona.id,
        manda: quien.manda,
    });
    const gente = await laGente(quien.familia);
    const canales = losCanalesQueVe(
        filas,
        quien.persona.id,
        quien.cuentaId,
        quien.manda,
        gente,
    );
    const canal = canales.find((c) => c.id === mensaje.canalId);
    if (!canal) return { error: "Ese mensaje ya no está." };

    return { quien, mensaje, canal, fila: filas.find((f) => f.id === canal.id) ?? null };
}

/**
 * Poner o quitar una reacción sobre un mensaje.
 *
 * **Es un interruptor**: el mismo gesto pone y quita, que es como se espera
 * que funcione. Quién gana cuando dos pestañas pulsan a la vez lo decide la
 * base con su clave primaria, no un `SELECT` nuestro de antes.
 *
 * La puerta es **PERTENECER al canal**, no poder leerlo — el mismo reparto con
 * el que se cuenta lo sin leer, con el que suena el aviso y con el que se paga
 * una transcripción. Un administrador lee los directos de su cuenta, decisión
 * tomada a propósito, y eso no le deja dejar su huella dentro de la
 * conversación de otros dos: leer no es participar.
 */
export async function reaccionarEnElEquipoAction(
    mensajeId: string,
    emoji: string,
): Promise<Respuesta<{ mensajeId: string; emoji: string; puesta: boolean }>> {
    try {
        const donde = await elCanalDeUnMensaje(mensajeId);
        if ("error" in donde) return { success: false, message: donde.error };
        const { quien, mensaje, canal } = donde;

        if (!canal.pertenezco) {
            return { success: false, message: "No participas en esta conversación." };
        }
        // Un mensaje borrado no tiene a qué reaccionar: su contenido ya no
        // está y lo que queda es la señal.
        if (mensaje.borradoEn) {
            return { success: false, message: "Ese mensaje ya no está." };
        }

        // Lo que llega del navegador **no decide** qué se guarda: sin esto,
        // «reaccionar» sería un segundo canal para escribir — un chip con una
        // frase dentro, debajo del mensaje de otro y sin forma de quitarlo.
        const limpio = comoSeGuardaLaReaccion(emoji);
        if (!limpio) {
            console.warn("[chat-equipo] se pidió reaccionar con algo que no es un emoji", {
                largo: typeof emoji === "string" ? emoji.length : null,
            });
            return { success: false, message: "Eso no es un emoji." };
        }

        const hecho = await alternarLaReaccion({
            mensajeId: mensaje.id,
            personaId: quien.persona.id,
            emoji: limpio,
        });
        if ("lleno" in hecho) {
            return {
                success: false,
                message: "Ya has puesto demasiadas reacciones en ese mensaje.",
            };
        }
        return {
            success: true,
            data: { mensajeId: mensaje.id, emoji: limpio, puesta: hecho.puesta },
        };
    } catch (error) {
        console.error("[chat-equipo] no se pudo reaccionar", error);
        return { success: false, message: "No se pudo reaccionar. Inténtalo de nuevo." };
    }
}

/**
 * Editar el texto de un mensaje PROPIO.
 *
 * Dos cosas que hay que mantener, y las dos son decisiones:
 *
 * 1. **Editar no vuelve a avisar.** Las menciones se recalculan —si no, el
 *    resaltado ámbar de la burbuja diría una cosa y el texto otra— pero no se
 *    crea ningún aviso ni sale ningún empuje. Con aviso, editar sería la forma
 *    de hacerle saltar la ventana que interrumpe a alguien tantas veces como
 *    uno quisiera sobre el mismo mensaje.
 * 2. **El archivo y la nota de voz no se tocan.** Editar es corregir lo que se
 *    escribió; cambiar el archivo por otro dejaría a quien ya lo vio hablando
 *    de algo que ya no está ahí. Para eso se borra y se manda de nuevo.
 */
export async function editarMensajeDelEquipoAction(
    mensajeId: string,
    texto: string,
): Promise<Respuesta<{ mensajeId: string; texto: string; editadoEn: string }>> {
    try {
        const donde = await elCanalDeUnMensaje(mensajeId);
        if ("error" in donde) return { success: false, message: donde.error };
        const { quien, mensaje, canal, fila } = donde;

        // La MISMA regla que usa la pantalla para ofrecer el botón. Con la
        // condición escrita dos veces, el día que se afine una la pantalla
        // ofrecería algo que la acción rechaza — que es peor que no ofrecerlo.
        if (
            !sePuedeEditar({
                mensaje: {
                    autorId: mensaje.autorId,
                    borradoEn: mensaje.borradoEn,
                    llamada: mensaje.esLlamada ? { fin: "", segundos: 0 } : null,
                },
                yo: quien.persona.id,
                puedoEscribir: canal.puedoEscribir,
            })
        ) {
            return { success: false, message: "Solo puedes editar tus propios mensajes." };
        }

        const limpio = comoSeGuardaElTexto(texto);
        // Vaciar el texto NO es editar, es borrar — y borrar tiene su propio
        // botón, que además deja la señal. Sin esta condición, editar a vacío
        // dejaría una burbuja en blanco que nadie sabe explicar.
        if (!limpio) {
            return {
                success: false,
                message: "Un mensaje no puede quedarse vacío. Bórralo si quieres quitarlo.",
            };
        }

        const gente = await laGente(quien.familia);
        const mencionados = extraerMenciones(
            limpio,
            await losMencionablesDe(canal, fila, gente),
        );

        const tocadas = await editarElTexto({
            id: mensaje.id,
            autorId: quien.persona.id,
            texto: limpio,
            mencionados,
        });
        // Cero filas es «no era tuyo o ya no está». Un `UPDATE` que no toca
        // nada y se contesta con un «listo» es un botón que parece funcionar.
        if (tocadas === 0) {
            return { success: false, message: "Ese mensaje ya no se puede editar." };
        }

        return {
            success: true,
            data: { mensajeId: mensaje.id, texto: limpio, editadoEn: new Date().toISOString() },
        };
    } catch (error) {
        console.error("[chat-equipo] no se pudo editar el mensaje", error);
        return { success: false, message: "No se pudo editar. Inténtalo de nuevo." };
    }
}

/**
 * Borrar un mensaje PROPIO. La señal se queda, el contenido no.
 *
 * Y lo que colgaba del bucket se quita **best-effort**, detrás de la misma
 * regla que ya decide qué se puede borrar de ahí (`llaveDelArchivoSubido`, la
 * de `/api/upload/borrar`). Si eso falla, la fila ya está limpia: lo que queda
 * es un archivo huérfano con una dirección que ya no enseña nadie, no un
 * borrado a medias. Es el mismo criterio que los adjuntos de una tarea, que
 * nunca han tocado el bucket.
 */
export async function borrarMensajeDelEquipoAction(
    mensajeId: string,
): Promise<Respuesta<{ mensajeId: string; borradoEn: string }>> {
    try {
        const donde = await elCanalDeUnMensaje(mensajeId);
        if ("error" in donde) return { success: false, message: donde.error };
        const { quien, mensaje, canal } = donde;

        if (
            !sePuedeBorrar({
                mensaje: { autorId: mensaje.autorId, borradoEn: mensaje.borradoEn },
                yo: quien.persona.id,
                puedoEscribir: canal.puedoEscribir,
            })
        ) {
            return { success: false, message: "Solo puedes borrar tus propios mensajes." };
        }

        const hecho = await borrarElMensaje({ id: mensaje.id, autorId: quien.persona.id });
        if (hecho.tocadas === 0) {
            return { success: false, message: "Ese mensaje ya no está." };
        }

        // De fondo y sin `await`: quien borró ya tiene su respuesta, y hablar
        // con el bucket puede tardar. Nunca lanza.
        if (hecho.archivos.length) void quitarDelBucket(hecho.archivos);

        return {
            success: true,
            data: { mensajeId: mensaje.id, borradoEn: new Date().toISOString() },
        };
    } catch (error) {
        console.error("[chat-equipo] no se pudo borrar el mensaje", error);
        return { success: false, message: "No se pudo borrar. Inténtalo de nuevo." };
    }
}

/**
 * Limpiar el historial ENTERO de una conversación: un canal, el General o un
 * directo. **Irreversible.**
 *
 * La puerta es una sola y no es la de siempre: **solo el súper administrador
 * de verdad** (`esSuperAdminDeVerdad`). Ni el dueño ni el administrador de una
 * cuenta: vaciar un canal se lleva lo que escribió todo el mundo, y no es algo
 * que se deba poder hacer desde un puesto del equipo. Esconder el botón no
 * cierra la petición directa; esto sí.
 *
 * Y el canal **tiene que estar entre los que esa persona ve** —la misma lista
 * con la que se pinta la barra de canales—. Un id que llega del navegador no
 * decide qué se borra: sin esto, un súper administrador metido en una cuenta
 * limpiaría por id un canal de otra familia que no tiene delante.
 *
 * `confirmacion` es la palabra tecleada (`PALABRA_PARA_LIMPIAR`), comprobada
 * también aquí: el diálogo que la pide es la fachada.
 */
export async function limpiarHistorialDelCanalAction(
    canalId: string,
    confirmacion: string,
): Promise<Respuesta<{ canalId: string; mensajes: number }>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };
        if (!quien.superAdmin) {
            console.warn("[chat-equipo] se intentó limpiar un historial sin ser súper administrador", {
                persona: quien.persona.id,
                canal: canalId,
            });
            return { success: false, message: "Solo el súper administrador puede limpiar el historial." };
        }
        if (!confirmaLaLimpieza(confirmacion)) {
            return { success: false, message: "Escribe la palabra de confirmación para limpiar el historial." };
        }

        const [filas, gente] = await Promise.all([
            canalesQueAlcanzan({
                cuentaId: quien.cuentaId,
                personaId: quien.persona.id,
                manda: quien.manda,
            }),
            laGente(quien.familia),
        ]);
        const canales = losCanalesQueVe(filas, quien.persona.id, quien.cuentaId, quien.manda, gente);
        const pedido = canalDeLaFila(canalId);
        const canal = canales.find((c) => c.id === pedido);
        if (!canal) return { success: false, message: "Esa conversación no está aquí." };

        const hecho = await limpiarLaConversacion({
            canalId: canal.id,
            cuentas: quien.familia.cuentas,
        });

        // Un borrado que no se puede deshacer deja rastro de quién y cuándo.
        // Va como `info`, que sobrevive al build (ver la regla de
        // `removeConsole`).
        console.info("[chat-equipo] historial limpiado", {
            canal: canal.id,
            tipo: canal.tipo,
            persona: quien.persona.id,
            cuenta: quien.cuentaId,
            mensajes: hecho.mensajes,
            avisos: hecho.avisos,
        });

        return { success: true, data: { canalId: canal.id, mensajes: hecho.mensajes } };
    } catch (error) {
        console.error("[chat-equipo] no se pudo limpiar el historial", error);
        return { success: false, message: "No se pudo limpiar el historial. Inténtalo de nuevo." };
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
 * Buscar por texto en lo que esa persona puede leer.
 *
 * **La puerta es la de siempre y no hay una segunda.** El alcance sale de
 `canalesQueAlcanzan` + `losCanalesQueVe`, exactamente las mismas funciones que
 * arman el listado del hilo, así que lo que la lista esconde la búsqueda no lo
 * encuentra. Escribir aquí una condición propia sería tener dos reglas de
 * permisos que mantener a la par, y el día que se separen esto se convierte en
 * la forma de leer lo que no se puede leer.
 *
 * Lo que se teclea **nunca llega en crudo a la consulta**: pasa por
 * `comoConsultaDeBusqueda`, que se queda solo con letras y números y pone los
 * operadores. `to_tsquery` tiene su propia sintaxis y un `!` suelto no es una
 * búsqueda rara — revienta la consulta entera.
 */
export async function buscarEnElEquipoAction(
    texto: string,
    /** `null` = en todos los canales que alcanzo; un id = solo en ese. */
    soloEsteCanal?: string | null,
): Promise<Respuesta<{ resultados: ResultadoDeBusqueda[] }>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };

        const consulta = comoConsultaDeBusqueda(texto);
        // Escribir una letra no es buscar: devolver medio hilo como
        // «resultados» es ruido, no una respuesta.
        if (!consulta) return { success: true, data: { resultados: [] } };

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

        // Acotar a un canal es acotar a uno de los MÍOS. Un id que llega de
        // fuera y no está en la lista no acota a ese canal: se ignora y se
        // busca en todos los que alcanzo, que es lo suyo.
        const pedido = soloEsteCanal ? canalDeLaFila(soloEsteCanal) : null;
        const acotado = pedido && canales.some((c) => c.id === pedido) ? pedido : null;
        if (soloEsteCanal && !acotado) {
            console.warn("[chat-equipo] se pidió buscar en un canal que no está en la lista", {
                pedido: soloEsteCanal,
                persona: quien.persona.id,
            });
        }

        const nombreDeCanal = new Map(canales.map((c) => [c.id, c.nombre]));

        const filasEncontradas = await buscarEnElEquipo({
            // Solo los canales CON FILA: el general no es una fila y se busca
            // por la familia, dentro de la consulta.
            canalIds: canales.filter((c) => c.id !== CANAL_GENERAL).map((c) => c.id),
            cuentas: quien.familia.cuentas,
            consulta,
            soloEsteCanal: acotado,
            tope: TOPE_DE_RESULTADOS,
        });

        const resultados: ResultadoDeBusqueda[] = filasEncontradas.map((f) => {
            const canalId = canalDeLaFila(f.canalId);
            return {
                id: f.id,
                canalId,
                // El nombre viaja con el resultado para que la lista no tenga
                // que buscarlo: un resultado que dice «en algún canal» no
                // ayuda a decidir si es el que se busca.
                canalNombre: nombreDeCanal.get(canalId) ?? NOMBRE_DEL_GENERAL,
                autorNombre: f.autorNombre,
                texto: f.texto,
                creadoEn: f.creadoEn.toISOString(),
            };
        });

        return { success: true, data: { resultados } };
    } catch (error) {
        // Un buscador que falla en silencio se lee como «no hay resultados»,
        // que es la peor respuesta posible: parece que el mensaje no existe.
        console.error("[chat-equipo] no se pudo buscar", error);
        return { success: false, message: "No se pudo buscar. Inténtalo de nuevo." };
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
/**
 * Cuántos mensajes faltan por leer, **qué de eso merece sonar** y si esta
 * persona quiere que suene.
 *
 * Las tres cosas en una vuelta a propósito. Es el reloj que corre en TODAS las
 * pantallas de todo el mundo con el panel cerrado: partirlo en tres acciones
 * sería triplicar sus peticiones para pintar un número y dar un pitido —
 * «muchas peticiones pequeñas son turno, no trabajo», aplicado al reloj más
 * caro de tener. Y no son dos viajes en paralelo: **Next serializa las
 * acciones de servidor de una misma página**, así que la segunda esperaría a
 * la primera y de paso ocuparía la cola que necesita Chats.
 *
 * Y la preferencia viaja aquí y no en su propia consulta por lo mismo: es una
 * lectura de una fila de dos columnas, pegada a una consulta que ya va.
 *
 * # Lo que esto ya NO trae, y por qué
 *
 * Trajo un rato la otra mitad del número de la pestaña: cuántos chats de
 * clientes esperaban respuesta. Se fue en el #838 y no vuelve por este camino:
 * el servidor **no puede saber qué está sin leer** —eso sale de las marcas de
 * `seenMessages`, que viven en el navegador— así que lo que mandaba era un
 * sustituto («el último mensaje es del contacto») que decía `9+` con nada
 * pendiente, y seguía diciéndolo con la cuenta entera borrada. Lo cuenta la
 * bandeja o no lo cuenta nadie.
 */
export async function sinLeerDelEquipoAction(): Promise<
    Respuesta<{
        total: number;
        porCanal: Record<string, number>;
        avisos: AvisoDelEquipo[];
        sonido: boolean;
        /**
         * De quién es esta vuelta.
         *
         * Va aquí y no como prop desde el layout porque la llave de «esto ya
         * sonó» es de la PERSONA —dos cuentas en el mismo navegador no pueden
         * pisarse— y quien sabe quién es de verdad es el servidor: dentro de
         * una cuenta ajena con «Ingresar» la fila efectiva es la del cliente y
         * la persona es otra.
         */
        personaId: string;
    }>
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

        const mios = canales.filter((c) => c.pertenezco && c.tipo !== "general");
        const conGeneral = canales.some((c) => c.tipo === "general");

        // Los canales donde PERTENECE, no los que puede leer. Quien administra
        // lee todos los directos de su cuenta, y sonarle con el tráfico de todo
        // el mundo es tanto como no tener sonido.
        const [cuentas, avisos, sonido] = await Promise.all([
            sinLeerPorCanal({
                personaId: quien.persona.id,
                canales: mios.map((c) => c.id),
                familia: quien.familia.cuentas,
                // El general es de toda la familia y se pertenece a él siempre.
                conGeneral,
            }),
            loQuePuedeSonar({
                personaId: quien.persona.id,
                directos: mios.filter((c) => c.tipo === "directo").map((c) => c.id),
                otros: mios.filter((c) => c.tipo !== "directo").map((c) => c.id),
                familia: quien.familia.cuentas,
                conGeneral,
            }),
            quiereSonido(quien.persona.id),
        ]);

        const porCanal: Record<string, number> = {};
        let total = 0;
        for (const c of cuentas) {
            porCanal[c.canalId] = c.sinLeer;
            total += c.sinLeer;
        }

        return {
            success: true,
            data: { total, porCanal, avisos, sonido, personaId: quien.persona.id },
        };
    } catch (error) {
        // Mudo aquí se ve como «el contador nunca sube», que es justo el fallo
        // que esto viene a arreglar.
        console.warn("[chat-equipo] no se pudo contar lo que falta por leer", error);
        return { success: false, message: "No se pudo contar." };
    }
}

/**
 * Encender o apagar el sonido del chat del equipo.
 *
 * Se guarda contra la PERSONA —`quienYDonde` resuelve `sessionUserId ?? id`—,
 * así que dentro de una cuenta ajena con «Ingresar» se sigue guardando para
 * quien está sentado delante y no para el cliente. Es el mismo reparto de
 * `quienFirma`.
 */
export async function cambiarSonidoDelEquipoAction(
    quiere: boolean,
): Promise<Respuesta<{ sonido: boolean }>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };
        await ponerElSonido(quien.persona.id, quiere);
        return { success: true, data: { sonido: quiere } };
    } catch (error) {
        // Un interruptor que no dice que no ha guardado es un interruptor que
        // se vuelve solo a su sitio y nadie sabe por qué.
        console.warn("[chat-equipo] no se pudo guardar el sonido", error);
        return { success: false, message: "No se pudo guardar la preferencia." };
    }
}

/**
 * Transcribir una nota de voz del chat del equipo, **bajo demanda**.
 *
 * # Por qué bajo demanda y nunca sola
 *
 * Las notas de voz de Chats se transcriben solas porque son de un CLIENTE y el
 * asesor tiene que saber qué le dijeron sin ponerse los auriculares. Un canal
 * del equipo es al revés: son compañeros hablando todo el día, y transcribir
 * cada nota a seis créditos el minuto es una factura que nadie pidió. Aquí la
 * paga quien la quiere, cuando la quiere.
 *
 * # Y se guarda, así que solo se paga UNA vez
 *
 * Si la fila ya tiene texto se devuelve ese y **no se toca un solo crédito**.
 * Es la mitad que importa: en un canal de ocho personas, sin guardarla, la
 * misma nota se pagaría ocho veces.
 *
 * # La puerta es PERTENECER, no poder leer
 *
 * Un administrador lee los directos de su cuenta —decisión tomada a propósito—
 * y eso no le deja gastar créditos transcribiendo la conversación de otros dos.
 * Es el mismo reparto con el que ya se cuenta lo sin leer y con el que suena el
 * aviso.
 *
 * # Y paga la CUENTA, nunca la persona
 *
 * `ia_credits` tiene una fila por cuenta; cobrarle a la persona sería cobrarle
 * a una fila que normalmente no existe, y entonces nadie podría transcribir
 * nada. Va a la **raíz de la familia**, así que en el chat interno de Grupo
 * Verzay lo paga Grupo Verzay escriba quien escriba desde Atención o Ventas.
 */
export async function transcribirNotaDelEquipoAction(
    mensajeId: string,
): Promise<Respuesta<{ transcripcion: string; yaEstaba: boolean }>> {
    try {
        const quien = await quienYDonde();
        if (!quien) return { success: false, message: "No autorizado." };

        const id = comoIdDeMensaje(mensajeId);
        if (!id) return { success: false, message: "Ese mensaje no existe." };

        const fila = await elAudioDelMensaje(id);
        if (!fila?.audioUrl) {
            return { success: false, message: "Ese mensaje no es una nota de voz." };
        }

        // Ya pagada: se devuelve y no se cobra. Va ANTES de resolver canales y
        // créditos — es el camino más común en cuanto alguien la pide una vez,
        // y no necesita ninguna de las dos cosas.
        if (fila.transcripcion) {
            return {
                success: true,
                data: { transcripcion: fila.transcripcion, yaEstaba: true },
            };
        }

        // La puerta: el canal del MENSAJE, no el que diga el navegador.
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
        const canal = canales.find((c) => c.id === fila.canalId);
        if (!canal || !puedePedirLaTranscripcion(canal)) {
            return {
                success: false,
                message: "Solo quien participa en la conversación puede transcribirla.",
            };
        }

        // Quién paga: la cuenta de quien pide, y la madre dentro de una familia.
        const paga = laCuentaQuePagaLaTranscripcion({
            cuentaId: quien.cuentaId,
            raizDeLaFamilia: quien.familia.raiz,
        });

        // La MISMA tarifa de Chats —seis créditos por minuto prorrateado— y la
        // misma comprobación, que va en CRÉDITOS y nunca toca `used` y `total`
        // en la misma expresión.
        const quedan = await losCreditosQueQuedan(paga);
        const que = queHacerConLaNota({
            segundos: fila.audioSegundos ?? 0,
            creditosDisponibles: quedan,
        });

        if (que.hacer === "saltar") {
            return {
                success: false,
                message: "La nota es demasiado larga para transcribirla.",
            };
        }
        if (que.hacer === "esperar") {
            // Se dice con el número delante: «no hay créditos» sin decir cuántos
            // hacían falta no le sirve a quien tiene que recargar.
            const costo = costoDeLaNota(fila.audioSegundos ?? 0);
            return {
                success: false,
                message: `No hay créditos suficientes: hacen falta ${costo.creditos} y quedan ${quedan ?? 0}.`,
            };
        }

        const clave = await laClaveDeOpenAi(paga);
        if (!clave) {
            return { success: false, message: "Esta cuenta no tiene configurada su IA." };
        }

        const audio = await bajarLaNota(fila.audioUrl);
        if (!audio) return { success: false, message: "No se pudo leer la nota de voz." };

        const texto = await pedirleElTextoAOpenAi({
            audio: audio.bytes,
            clave,
            nombre: audio.nombre,
        });
        if (!texto) {
            // **No se cobra y no se deja marca.** Un fallo de OpenAI es de hoy,
            // no de la nota: marcarlo dejaría esa nota sin transcribir para
            // siempre, y quien la pidió no tiene forma de saber por qué.
            return { success: false, message: "No se pudo transcribir. Inténtalo otra vez." };
        }

        await guardarLaTranscripcion(id, texto);

        // Se cobra DESPUÉS de tener el texto: cobrar antes y que la llamada
        // falle sería cobrar por algo que no se entregó. Y no se cobra cuando
        // la cuenta paga su propia IA (`quedan === null`).
        if (quedan !== null) {
            await descontarLaTranscripcion(paga, que.costo.tokens);
        }

        console.info("[chat-equipo] nota de voz transcrita", {
            mensaje: id,
            canal: canal.id,
            paga,
            segundos: fila.audioSegundos,
            creditos: quedan === null ? "ilimitados" : que.costo.creditos,
        });

        return { success: true, data: { transcripcion: texto, yaEstaba: false } };
    } catch (error) {
        console.warn("[chat-equipo] no se pudo transcribir la nota de voz", error);
        return { success: false, message: "No se pudo transcribir. Inténtalo otra vez." };
    }
}

/**
 * Bajarse la nota del bucket.
 *
 * La dirección **ya se comprobó al guardarla** (`comoSeGuardaLaNota`), y se
 * vuelve a comprobar aquí: entre las dos cosas hay una fila en la base, y una
 * fila puede haberse escrito por otro camino o haberse tocado a mano. Una
 * petición que sale de nuestro servidor hacia una dirección que no controlamos
 * es lo que no puede pasar.
 *
 * El **nombre** sale de la llave del bucket, y no es cosmético: su extensión es
 * lo que le dice el formato a OpenAI.
 */
async function bajarLaNota(
    url: string,
): Promise<{ bytes: Buffer; nombre: string } | null> {
    const bucket = process.env.S3_BUCKET_NAME || "verzay-media";
    const llave = llaveDelArchivoSubido(url, process.env.S3_PUBLIC_URL, bucket);
    if (!llave) {
        console.warn("[chat-equipo] la nota no apunta a nuestro bucket", { url });
        return null;
    }

    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.warn("[chat-equipo] no se pudo bajar la nota de voz", {
                estado: res.status,
            });
            return null;
        }
        const bytes = Buffer.from(await res.arrayBuffer());
        if (!bytes.length) return null;
        const nombre = llave.llave.split("/").pop() || "nota.webm";
        return { bytes, nombre };
    } catch (error) {
        console.warn("[chat-equipo] falló la descarga de la nota de voz", error);
        return null;
    }
}
