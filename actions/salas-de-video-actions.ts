"use server";

import { headers } from "next/headers";

import { currentUser } from "@/lib/auth";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { quienFirma } from "@/lib/chat-de-equipo";
import { laFamiliaDeLaCuenta } from "@/lib/familia-de-cuentas";
import { canalesQueAlcanzan, guardarUnMensaje } from "@/lib/chat-de-equipo-db";
import {
    CANAL_GENERAL,
    NOMBRE_DEL_GENERAL,
    perteneceAlCanal,
} from "@/lib/canales-de-equipo";
import { losServidoresIce } from "@/lib/llamada-de-voz";
import {
    TOPE_DE_LA_SALA,
    comoEstaLaSala,
    comoSeGuardaElNombre,
    comoSeGuardaElSdp,
    cuandoCaduca,
    cuandoCaducaAlCambiar,
    esTipoDeSenal,
    esUnaDuracion,
    laDireccionDeLaSala,
    loQueSeLeDiceAlQueLlegaTarde,
    type TipoDeSenal,
} from "@/lib/sala-de-video";
import {
    DIAS_DE_HISTORICO,
    TOPE_DEL_HISTORICO,
    comoSeLeeLaDuracion,
    cuandoTermino,
    cuantoDuro,
    esDeMiCuenta,
    puedeAbrirUnaReunion,
    puedeAdministrarLaSala,
} from "@/lib/reuniones-de-la-cuenta";
import {
    barrerSenalesViejas,
    crearLaSala,
    dejarLaSenal,
    dejarPasar,
    elInvitadoDelToken,
    entrarConCuenta,
    cambiarLaCaducidad,
    elHistorialDeLaCuenta,
    lasSalasVivasDeLaCuenta,
    lasSalasVivasDelCanal,
    laSalaPorCodigo,
    laSalaPorId,
    latirEnLaSala,
    llamarALaPuerta,
    losDeLaSala,
    revocarLaSala,
    sacarALosQueNoDanSenales,
    sacarDeLaSala,
    vaciarElBuzon,
    type FilaDeParticipante,
    type FilaDeSala,
} from "@/lib/salas-de-video-db";

/**
 * Las salas de video: crear el enlace, dejar pasar, y el reloj de dentro.
 *
 * # Dos clases de persona, y solo una tiene sesión
 *
 * Todo lo de aquí lo llaman **dos** navegadores muy distintos: el de alguien
 * del equipo, con su sesión, y el de alguien de fuera que abrió un enlace y no
 * tiene cuenta ninguna. De ahí sale la forma de este fichero:
 *
 * | quién es | con qué se identifica | cómo entra |
 * | --- | --- | --- |
 * | del equipo | la sesión, y **pertenecer al canal** | directo |
 * | de fuera | un **token** que le dio el servidor al llamar a la puerta | cuando el anfitrión le deja |
 *
 * Y la regla que lo sostiene: **el token lo genera el servidor y nunca llega
 * del navegador como identidad**. Cuando una acción necesita saber quién está
 * al otro lado, lo resuelve `quienEsEnLaSala`; ninguna acepta un `participante`
 * suelto en los parámetros. Si lo aceptara, cualquiera dentro de una sala
 * podría dejar una oferta firmada con el id de otro.
 *
 * # Y el enlace no es la puerta
 *
 * Tener el enlace deja **llamar**, no entrar. Quien pasa lo decide alguien que
 * ya está dentro. Eso es lo que permite que el enlace se pueda pegar en un
 * correo sin que el correo sea la llave.
 */

type Respuesta<T> =
    | ({ success: true } & T)
    | { success: false; message: string };

async function quien() {
    const user = await currentUser();
    if (!user?.id) return null;
    const firma = quienFirma(user);
    if (!firma) return null;
    return {
        personaId: firma.personaId,
        nombre: firma.nombre,
        cuentaId: firma.cuentaId,
        manda: canManageWorkspace(user),
    };
}

/**
 * El canal desde el que se abre una sala, y si quien pregunta PERTENECE.
 *
 * **Pertenecer, no poder leer** — la misma puerta que las reacciones, la
 * transcripción y la llamada de voz. Un administrador lee los directos de su
 * cuenta, y eso no le deja abrir una reunión dentro de la conversación de otros
 * dos ni, mucho menos, repartir un enlace público que lleve a ella.
 */
async function elCanal(canalId: string, yo: NonNullable<Awaited<ReturnType<typeof quien>>>) {
    const familia = await laFamiliaDeLaCuenta(yo.cuentaId);
    const filas = await canalesQueAlcanzan({
        cuentaId: yo.cuentaId,
        personaId: yo.personaId,
        manda: yo.manda,
    });

    // El general no es una fila: es una constante, y lo tiene toda la familia.
    if (canalId === CANAL_GENERAL) {
        // El general se escribe bajo la RAÍZ de la familia y se lee sobre toda
        // ella: `ownerId ?? id` no sube a la madre. Con la cuenta a secas, una
        // reunión abierta desde una cuenta vinculada caería en un general
        // distinto del de la madre — el mismo fallo que ya partió el hilo en
        // dos, por otra puerta.
        return {
            id: CANAL_GENERAL,
            nombre: NOMBRE_DEL_GENERAL,
            cuentaId: familia.raiz || yo.cuentaId,
            pertenece: true,
        };
    }

    const fila = filas.find((f) => f.id === canalId);
    if (!fila) return null;
    const pertenece = perteneceAlCanal({
        personas: fila.miembros ?? [],
        cuentas: fila.cuentas ?? [],
        yo: yo.personaId,
        miCuenta: yo.cuentaId,
    });
    if (!pertenece) return null;
    return { id: fila.id, nombre: fila.nombre, cuentaId: fila.cuentaId, pertenece };
}

/**
 * Si quien pregunta PERTENECE a esta sala, y por dónde.
 *
 * Es la única función que contesta esa pregunta, y ramifica por lo único que
 * distingue las dos clases de sala:
 *
 * | la sala | pertenece | igual que |
 * | --- | --- | --- |
 * | **con canal** | quien pertenece al canal | exactamente como antes |
 * | **sin canal** | quien es de la cuenta | la pantalla de Reuniones |
 *
 * Que sea **una** importa: lo preguntan tres sitios —abrir el enlace, cada
 * vuelta del reloj de la sala y la puerta—, y con la condición copiada en los
 * tres, el día que una de las dos ramas se afine los otros dos se quedan atrás.
 * Eso aquí no se ve como un error: se ve como alguien que entra a una reunión
 * a la que no debía, o como alguien que no entra a la suya.
 *
 * **La rama del canal no se toca.** Sigue siendo `elCanal`, con su
 * «pertenecer, no poder leer»: un administrador lee los directos de su cuenta y
 * eso no le mete en una reunión abierta dentro de la conversación de otros dos.
 */
async function perteneceALaSala(
    sala: FilaDeSala,
    yo: NonNullable<Awaited<ReturnType<typeof quien>>>,
): Promise<boolean> {
    if (sala.canalId) {
        return Boolean(await elCanal(sala.canalId, yo));
    }
    return esDeMiCuenta(sala, yo.cuentaId);
}

/**
 * Dónde vive esta plataforma, para componer el enlace.
 *
 * Se lee de la **petición** y no de una variable de entorno: la App se abre por
 * más de un dominio —el de producción y el que cada quien tenga delante— y un
 * enlace compuesto con el dominio equivocado es un enlace que no abre. Si la
 * cabecera faltara, se cae a `NEXT_PUBLIC_APP_URL`, que es lo que ya usan los
 * enlaces de pago.
 */
async function laRaizDeLaApp(): Promise<string> {
    try {
        const h = await headers();
        const host = h.get("x-forwarded-host") || h.get("host");
        if (host) {
            const proto = h.get("x-forwarded-proto") || "https";
            return `${proto}://${host}`;
        }
    } catch {
        // Fuera de una petición no hay cabeceras; se usa el respaldo.
    }
    return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
}

// ── Crear, listar y revocar ─────────────────────────────────────────────────

export type SalaParaLaPantalla = {
    id: string;
    codigo: string;
    enlace: string;
    /** `null` en una reunión de la cuenta, sin canal detrás. */
    canalId: string | null;
    anfitrionId: string;
    anfitrionNombre: string | null;
    titulo: string | null;
    creadoEn: string;
    expiraEn: string;
    soyElAnfitrion: boolean;
    /**
     * Si puedo revocarla o moverle la caducidad.
     *
     * Baja como dato y **no se vuelve a calcular en la pantalla**: con la
     * condición escrita también allí, el día que se afine una las dos dejarían
     * de coincidir y saldría un botón que al pulsarlo dice «no autorizado» —el
     * «menú abierto, puerta cerrada» que este repositorio ya pagó cuatro veces—.
     * Quien decide de verdad sigue siendo la acción.
     */
    puedoAdministrar: boolean;
};

function comoSeVeLaSala(
    fila: FilaDeSala,
    raiz: string,
    yo: string | null,
    quienPregunta?: Awaited<ReturnType<typeof quien>>,
): SalaParaLaPantalla {
    return {
        id: fila.id,
        codigo: fila.codigo,
        enlace: laDireccionDeLaSala(fila.codigo, raiz),
        canalId: fila.canalId,
        anfitrionId: fila.anfitrionId,
        anfitrionNombre: fila.anfitrionNombre,
        titulo: fila.titulo,
        creadoEn: fila.creadoEn.toISOString(),
        expiraEn: fila.expiraEn.toISOString(),
        soyElAnfitrion: Boolean(yo) && fila.anfitrionId === yo,
        puedoAdministrar: puedeAdministrarLaSala(fila, quienPregunta),
    };
}

/**
 * Abrir una sala y dejar su enlace en el canal.
 *
 * El mensaje en el canal **no es decoración**: una reunión que solo existe en
 * la pestaña de quien la creó es una reunión a la que nadie más sabe entrar, y
 * el enlace acabaría copiado a mano en otro sitio. Escrito en el hilo, lo ven
 * todos los del canal y queda con su fecha.
 *
 * Y **nunca tumba la creación**: la sala ya existe cuando se escribe, así que
 * un fallo ahí deja el enlace igual de válido. Pero tampoco es mudo.
 */
export async function crearLaSalaAction(
    canalId: string,
    duracion: string,
    titulo?: string | null,
): Promise<Respuesta<{ sala: SalaParaLaPantalla }>> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };

        const canal = await elCanal(canalId, yo);
        if (!canal) {
            // «No perteneces» y «no existe» se contestan igual: decir cuál de
            // las dos ya cuenta algo de un canal que quizá no sea suyo.
            return { success: false, message: "Aquí no se puede abrir una reunión." };
        }

        const limpio = (titulo ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
        const fila = await crearLaSala({
            cuentaId: canal.cuentaId,
            canalId: canal.id,
            anfitrionId: yo.personaId,
            anfitrionNombre: yo.nombre ?? null,
            titulo: limpio,
            expiraEn: cuandoCaduca(duracion),
        });

        const raiz = await laRaizDeLaApp();
        const enlace = laDireccionDeLaSala(fila.codigo, raiz);
        try {
            await guardarUnMensaje({
                id: `sala-${fila.id}`,
                cuentaId: canal.cuentaId,
                canalId: canal.id,
                autorId: yo.personaId,
                autorNombre: yo.nombre ?? null,
                escritoDesde: null,
                texto: `📹 Reunión abierta${limpio ? `: ${limpio}` : ""}\n${enlace}`,
                mencionados: [],
                chat: null,
                cita: null,
                llamada: null,
            });
        } catch (error) {
            console.warn("[salas] la reunión no quedó escrita en el canal", {
                sala: fila.id,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        return { success: true, sala: comoSeVeLaSala(fila, raiz, yo.personaId, yo) };
    } catch (error) {
        console.warn("[salas] no se pudo abrir la reunión", error);
        return { success: false, message: "No se pudo abrir la reunión." };
    }
}

/** Las reuniones vivas de un canal, para volver a una que sigue abierta. */
export async function lasSalasDelCanalAction(
    canalId: string,
): Promise<Respuesta<{ salas: SalaParaLaPantalla[] }>> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };
        const canal = await elCanal(canalId, yo);
        if (!canal) return { success: true, salas: [] };

        const raiz = await laRaizDeLaApp();
        const filas = await lasSalasVivasDelCanal(canal.id);
        return {
            success: true,
            salas: filas.map((f) => comoSeVeLaSala(f, raiz, yo.personaId, yo)),
        };
    } catch (error) {
        console.warn("[salas] no se pudieron leer las reuniones del canal", error);
        return { success: false, message: "No se pudieron leer las reuniones." };
    }
}

/**
 * Revocar el enlace.
 *
 * **El anfitrión, y quien administra la cuenta.** Antes era solo el anfitrión,
 * y esa mitad que se añade hace falta: sin ella, una sala abierta por alguien
 * que ya no está en el equipo **no la cierra nadie nunca** y su enlace sigue
 * dejando llamar a la puerta hasta que caduque solo. No se afloja más —el resto
 * del equipo no toca la sala de otro—, que es lo que la regla original
 * protegía: revocar echa a quien esté dentro.
 *
 * Y las dos guardas van **separadas**: el permiso aquí, el «no dos veces» en el
 * `WHERE` de la consulta. Juntas, un `false` no decía cuál de las dos falló.
 */
export async function revocarLaSalaAction(
    salaId: string,
): Promise<Respuesta<{ listo: true }>> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };

        const sala = await laSalaPorId(salaId);
        if (!sala) return { success: false, message: "Esta reunión ya no existe." };
        if (!puedeAdministrarLaSala(sala, yo)) {
            return {
                success: false,
                message: "Solo quien abrió la reunión o quien administra la cuenta puede revocar su enlace.",
            };
        }

        const hecho = await revocarLaSala(salaId);
        // Ya estaba revocada: no es un fallo, es la segunda pulsación.
        if (!hecho) return { success: true, listo: true };
        return { success: true, listo: true };
    } catch (error) {
        console.warn("[salas] no se pudo revocar", error);
        return { success: false, message: "No se pudo revocar el enlace." };
    }
}

// ── Reuniones de la CUENTA, sin canal detrás ────────────────────────────────

/**
 * Abrir una reunión de la cuenta.
 *
 * Es una acción aparte y **no un parámetro opcional de `crearLaSalaAction`**, a
 * propósito: aquella escribe además el enlace en el hilo del canal, y con un
 * `canalId` que puede venir nulo esa parte quedaría detrás de un `if` que solo
 * se ejerce por un camino. Dos acciones cortas dicen cuál es cuál; lo que de
 * verdad no puede duplicarse —quién pertenece, cómo se ve una sala, cuándo
 * caduca— ya está compartido.
 *
 * **Quién puede: cualquiera de la cuenta, `agente` incluido.** El porqué está
 * en `lib/reuniones-de-la-cuenta.ts`, con sus tres motivos.
 */
export async function crearLaReunionDeLaCuentaAction(
    duracion: string,
    titulo?: string | null,
): Promise<Respuesta<{ sala: SalaParaLaPantalla }>> {
    try {
        const yo = await quien();
        if (!puedeAbrirUnaReunion(yo) || !yo) {
            return { success: false, message: "No autorizado." };
        }
        if (!esUnaDuracion(duracion)) {
            return { success: false, message: "Esa duración no existe." };
        }

        const limpio = (titulo ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
        const fila = await crearLaSala({
            cuentaId: yo.cuentaId,
            // Sin canal: es una reunión de la cuenta. Lo que la hace visible en
            // Reuniones y lo que la deja FUERA de los canales.
            canalId: null,
            anfitrionId: yo.personaId,
            anfitrionNombre: yo.nombre ?? null,
            titulo: limpio,
            expiraEn: cuandoCaduca(duracion),
        });

        const raiz = await laRaizDeLaApp();
        return { success: true, sala: comoSeVeLaSala(fila, raiz, yo.personaId, yo) };
    } catch (error) {
        console.warn("[salas] no se pudo abrir la reunión de la cuenta", error);
        return { success: false, message: "No se pudo abrir la reunión." };
    }
}

/** Las reuniones vivas de la cuenta. Solo las que no son de ningún canal. */
export async function lasReunionesDeLaCuentaAction(): Promise<
    Respuesta<{ salas: SalaParaLaPantalla[]; puedoAbrir: boolean }>
> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };
        const raiz = await laRaizDeLaApp();
        const filas = await lasSalasVivasDeLaCuenta(yo.cuentaId);
        return {
            success: true,
            salas: filas.map((f) => comoSeVeLaSala(f, raiz, yo.personaId, yo)),
            puedoAbrir: puedeAbrirUnaReunion(yo),
        };
    } catch (error) {
        console.warn("[salas] no se pudieron leer las reuniones de la cuenta", error);
        return { success: false, message: "No se pudieron leer las reuniones." };
    }
}

/**
 * Mover la caducidad de un enlace que ya existe.
 *
 * Es lo que evita el caso que se reportó: la reunión se mueve al jueves y hoy
 * había que **abrir otra sala y repartir otro enlace**, con el viejo todavía
 * dando vueltas por los correos de la gente.
 *
 * Se mide desde ahora (`cuandoCaducaAlCambiar`), no desde que se creó.
 */
export async function cambiarLaCaducidadAction(
    salaId: string,
    duracion: string,
): Promise<Respuesta<{ expiraEn: string }>> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };
        if (!esUnaDuracion(duracion)) {
            return { success: false, message: "Esa duración no existe." };
        }

        const sala = await laSalaPorId(salaId);
        if (!sala) return { success: false, message: "Esta reunión ya no existe." };
        if (!puedeAdministrarLaSala(sala, yo)) {
            return {
                success: false,
                message: "Solo quien abrió la reunión o quien administra la cuenta puede cambiar su caducidad.",
            };
        }

        const expiraEn = cuandoCaducaAlCambiar(duracion);
        const hecho = await cambiarLaCaducidad(salaId, expiraEn);
        if (!hecho) {
            // Revocada: alargarle la fecha sería deshacer por la puerta de
            // atrás una decisión que alguien tomó, con la gente ya echada.
            return {
                success: false,
                message: "Este enlace está revocado. Abre una reunión nueva.",
            };
        }
        return { success: true, expiraEn: expiraEn.toISOString() };
    } catch (error) {
        console.warn("[salas] no se pudo cambiar la caducidad", error);
        return { success: false, message: "No se pudo cambiar la caducidad." };
    }
}

// ── El histórico ────────────────────────────────────────────────────────────

export type ReunionPasada = {
    id: string;
    titulo: string | null;
    anfitrionNombre: string | null;
    /** Cuándo entró el primero. `null` si no entró nadie. */
    empezo: string | null;
    /** Cuánto duró, ya legible. `—` cuando no hay reunión que medir. */
    duracion: string;
    /** En segundos, para quien quiera ordenar o sumar. `null` si no se usó. */
    duracionSegundos: number | null;
    /** Quiénes entraron, en el orden en que entraron. */
    asistentes: Array<{ nombre: string; esInvitado: boolean }>;
    /** Cómo acabó el enlace, para explicar una reunión de cero asistentes. */
    final: "revocada" | "caducada";
};

/**
 * Las reuniones pasadas de la cuenta.
 *
 * **No hay tabla nueva.** `sala_participantes` lleva desde el primer día
 * guardando quién entró y cuándo, y `salas_de_video` guarda cada sala con su
 * título; lo que faltaba era quien lo leyera. Esas son justo las filas que la
 * orden describe como «acumulándose sin que nadie las lea»: a partir de ahora
 * son el histórico.
 *
 * Y por eso **no se pone ninguna poda**, que es la pregunta que la orden deja
 * abierta. Ver la nota del final de esta función.
 */
export async function elHistorialDeReunionesAction(
    dias: number = DIAS_DE_HISTORICO,
): Promise<Respuesta<{ reuniones: ReunionPasada[]; dias: number }>> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };

        const cuantos = Number.isFinite(dias) ? Math.min(Math.max(1, Math.floor(dias)), 365) : DIAS_DE_HISTORICO;
        const filas = await elHistorialDeLaCuenta(yo.cuentaId, cuantos, TOPE_DEL_HISTORICO);

        const reuniones: ReunionPasada[] = filas.map(({ sala, participantes }) => {
            const empezo = participantes.reduce<Date | null>((menor, p) => {
                if (!p.entradoEn) return menor;
                return !menor || p.entradoEn < menor ? p.entradoEn : menor;
            }, null);
            const termino = cuandoTermino(participantes);
            const segundos = cuantoDuro(empezo, termino);
            return {
                id: sala.id,
                titulo: sala.titulo,
                anfitrionNombre: sala.anfitrionNombre,
                empezo: empezo ? empezo.toISOString() : null,
                duracion: comoSeLeeLaDuracion(segundos),
                duracionSegundos: segundos,
                asistentes: participantes.map((p) => ({
                    nombre: p.nombre,
                    esInvitado: p.esInvitado,
                })),
                final: sala.revocadaEn ? "revocada" : "caducada",
            };
        });

        return { success: true, reuniones, dias: cuantos };
    } catch (error) {
        console.warn("[salas] no se pudo leer el histórico de reuniones", error);
        return { success: false, message: "No se pudo leer el histórico." };
    }
}

// ── Entrar ──────────────────────────────────────────────────────────────────

export type ComoEntro =
    /** Con cuenta y perteneciendo al canal: dentro, sin esperar a nadie. */
    | { modo: "dentro"; participanteId: string; nombre: string; salaId: string }
    /** Hay que dar un nombre y esperar a que alguien abra. */
    | { modo: "puerta"; salaId: string }
    /** El enlace ya no vale. */
    | { modo: "cerrada"; motivo: string };

/**
 * Qué me toca al abrir un enlace de reunión.
 *
 * Se llama **antes de pedir la cámara**: lo primero que hay que saber es si esa
 * reunión existe y si hay que esperar en la puerta, y pedir el permiso del
 * navegador antes de eso es pedirlo para nada la mitad de las veces.
 *
 * Quien tiene cuenta **y pertenece a la sala** entra directo —al canal si la
 * sala nació en uno, a la cuenta si es una reunión suelta—; cualquier otro
 * —tenga cuenta o no— pasa por la puerta. Que alguien con sesión que no
 * pertenece caiga en la puerta no es un despiste: es lo mismo que le pasaría a
 * un desconocido, y dejarlo en un «no autorizado» sería un callejón sin salida
 * cuando la reunión es justamente para él.
 */
export async function comoEntroAction(codigo: string): Promise<Respuesta<{ como: ComoEntro }>> {
    try {
        const sala = await laSalaPorCodigo(codigo);
        if (!sala) {
            // No se distingue «no existe» de «caducada» hacia fuera por el
            // código en sí, pero sí se dice que no vale: sin eso, quien llega
            // con un enlace roto se queda mirando una pantalla en blanco.
            return {
                success: true,
                como: { modo: "cerrada", motivo: "Este enlace de reunión no es válido." },
            };
        }

        const estado = comoEstaLaSala(sala);
        if (estado !== "abierta") {
            return {
                success: true,
                como: { modo: "cerrada", motivo: loQueSeLeDiceAlQueLlegaTarde(estado) },
            };
        }

        const yo = await quien();
        if (yo) {
            if (await perteneceALaSala(sala, yo)) {
                const fila = await entrarConCuenta({
                    salaId: sala.id,
                    personaId: yo.personaId,
                    nombre: yo.nombre || "Alguien del equipo",
                });
                if (!fila) {
                    return {
                        success: false,
                        message: `La reunión está llena (${TOPE_DE_LA_SALA} personas).`,
                    };
                }
                return {
                    success: true,
                    como: {
                        modo: "dentro",
                        participanteId: fila.id,
                        nombre: fila.nombre,
                        salaId: sala.id,
                    },
                };
            }
        }

        return { success: true, como: { modo: "puerta", salaId: sala.id } };
    } catch (error) {
        console.warn("[salas] no se pudo abrir el enlace", error);
        return { success: false, message: "No se pudo abrir la reunión." };
    }
}

/**
 * Llamar a la puerta con un nombre.
 *
 * Devuelve el **token**, que es la credencial de esa pestaña a partir de aquí.
 * Se genera en el servidor: ver la cabecera del fichero.
 */
export async function llamarALaPuertaAction(
    codigo: string,
    nombre: string,
): Promise<Respuesta<{ token: string; participanteId: string; nombre: string }>> {
    try {
        const limpio = comoSeGuardaElNombre(nombre);
        if (!limpio) {
            return { success: false, message: "Pon tu nombre para que sepan quién entra." };
        }

        const sala = await laSalaPorCodigo(codigo);
        if (!sala) return { success: false, message: "Este enlace de reunión no es válido." };
        const estado = comoEstaLaSala(sala);
        if (estado !== "abierta") {
            return { success: false, message: loQueSeLeDiceAlQueLlegaTarde(estado) };
        }

        const fila = await llamarALaPuerta({ salaId: sala.id, nombre: limpio });
        if (!fila?.invitadoToken) {
            return {
                success: false,
                message: "Hay demasiada gente esperando. Inténtalo en un momento.",
            };
        }
        return {
            success: true,
            token: fila.invitadoToken,
            participanteId: fila.id,
            nombre: fila.nombre,
        };
    } catch (error) {
        console.warn("[salas] no se pudo llamar a la puerta", error);
        return { success: false, message: "No se pudo entrar a la reunión." };
    }
}

/**
 * Quién es quien llama, sea del equipo o de fuera.
 *
 * **El único sitio donde se resuelve una identidad dentro de una sala.** Todo
 * lo demás —el latido, las señales, dejar pasar— tira de aquí, así que no hay
 * dos formas de decidir quién eres que puedan separarse el día que se afine
 * una.
 */
async function quienEsEnLaSala(input: {
    codigo?: string | null;
    token?: string | null;
}): Promise<
    | {
          sala: FilaDeSala;
          participante: FilaDeParticipante;
          /** Si además tiene cuenta y PERTENECE a la sala (a su canal o a su cuenta). */
          delEquipo: boolean;
      }
    | { error: string }
> {
    const token = (input.token ?? "").trim();
    if (token) {
        const fila = await elInvitadoDelToken(token);
        if (!fila) return { error: "Tu entrada a esta reunión ya no vale." };
        const sala = await laSalaPorId(fila.salaId);
        if (!sala) return { error: "Esta reunión ya no existe." };
        const estado = comoEstaLaSala(sala);
        if (estado !== "abierta") return { error: loQueSeLeDiceAlQueLlegaTarde(estado) };
        return { sala, participante: fila, delEquipo: false };
    }

    const codigo = (input.codigo ?? "").trim();
    if (!codigo) return { error: "No autorizado." };
    const sala = await laSalaPorCodigo(codigo);
    if (!sala) return { error: "Este enlace de reunión no es válido." };
    const estado = comoEstaLaSala(sala);
    if (estado !== "abierta") return { error: loQueSeLeDiceAlQueLlegaTarde(estado) };

    const yo = await quien();
    if (!yo) return { error: "No autorizado." };
    // Se vuelve a comprobar la pertenencia en CADA vuelta, no solo al entrar:
    // a alguien se le puede sacar de un canal —o de la cuenta— mientras la
    // reunión sigue abierta, y su pestaña seguiría pidiendo por el código.
    if (!(await perteneceALaSala(sala, yo))) return { error: "No autorizado." };
    const fila = await elParticipanteDeLaSesion(sala.id, yo.personaId);
    if (!fila) return { error: "Todavía no has entrado a esta reunión." };
    return { sala, participante: fila, delEquipo: true };
}

async function elParticipanteDeLaSesion(salaId: string, personaId: string) {
    const { elParticipanteConCuenta } = await import("@/lib/salas-de-video-db");
    return elParticipanteConCuenta(salaId, personaId);
}

// ── El reloj de dentro ──────────────────────────────────────────────────────

export type QuienEstaEnLaSala = {
    id: string;
    nombre: string;
    esInvitado: boolean;
    esElAnfitrion: boolean;
    /**
     * Qué está mandando.
     *
     * Viene por el reloj y **no por la conexión**, porque por la conexión no se
     * puede saber: callarse es `enabled = false` en la pista, y eso la otra
     * punta no lo nota — le sigue llegando la pista, con silencio dentro. El
     * precio es que el icono de «callado» tarda una vuelta en aparecer, que
     * para un indicador es de sobra.
     */
    micEncendido: boolean;
    camaraEncendida: boolean;
    compartiendo: boolean;
};

export type LoQuePasaEnLaSala = {
    /** Mi propia fila: quién soy aquí dentro y en qué punto estoy. */
    yo: {
        participanteId: string;
        nombre: string;
        estado: string;
        /** Si puedo dejar pasar a quien espera. Ver `puedeAbrirLaPuerta`. */
        abroLaPuerta: boolean;
    };
    sala: { id: string; codigo: string; titulo: string | null; expiraEn: string };
    /** Los que están dentro, yo incluido. */
    dentro: QuienEstaEnLaSala[];
    /** Los que esperan. Solo lo ve quien puede abrir la puerta. */
    esperando: QuienEstaEnLaSala[];
    /** Las ofertas y respuestas que me habían dejado. Vienen ya consumidas. */
    senales: Array<{ deId: string; tipo: TipoDeSenal; sdp: string }>;
    /**
     * Los servidores ICE.
     *
     * Viajan **aquí dentro** y no en una acción propia por dos motivos: es una
     * vuelta menos en el camino más caliente de esta pantalla, y sobre todo
     * porque las credenciales de TURN solo pueden salir hacia alguien que ya
     * está **admitido en una sala viva** — que es exactamente lo que esta
     * vuelta acaba de comprobar. En una acción suelta habría que volver a
     * comprobarlo, y ese es el sitio donde se olvida.
     */
    ice: RTCIceServer[];
};

/**
 * Quién puede dejar pasar a quien espera.
 *
 * El anfitrión, **y cualquiera del equipo que ya esté dentro**. La segunda
 * mitad no afloja nada —para estar dentro con cuenta hay que pertenecer a la
 * sala, a su canal o a su cuenta, o sea ser de los mismos— y evita un callejón sin salida que se daría
 * todos los días: si el anfitrión cierra su pestaña, sus invitados se quedarían
 * en la sala de espera para siempre, mirando un mensaje que no cambia.
 *
 * Un invitado no abre la puerta nunca, esté dentro o no: lo que le dejó entrar
 * fue una decisión de alguien del equipo, y no se hereda.
 */
function puedeAbrirLaPuerta(input: {
    participante: FilaDeParticipante;
    sala: FilaDeSala;
    delEquipo: boolean;
}): boolean {
    if (input.participante.esInvitado || !input.delEquipo) return false;
    if (input.participante.estado !== "dentro") return false;
    return true;
}

let vueltas = 0;

/**
 * Una vuelta del reloj de la sala: latir, mirar quién hay y vaciar el buzón.
 *
 * **Todo en una sola llamada**, que es la regla de siempre: partirlo en tres
 * —presencia, participantes, señales— sería triplicar las peticiones de la
 * pantalla más cara que tiene esto, y en una reunión de cuatro eso son doce
 * peticiones cada dos segundos en vez de cuatro.
 */
export async function latidoDeLaSalaAction(input: {
    codigo?: string | null;
    token?: string | null;
    /** Lo que estoy mandando ahora mismo, para que los demás lo pinten. */
    medios?: { mic?: boolean; camara?: boolean; compartiendo?: boolean } | null;
}): Promise<Respuesta<{ datos: LoQuePasaEnLaSala }>> {
    try {
        const quienEs = await quienEsEnLaSala(input);
        if ("error" in quienEs) return { success: false, message: quienEs.error };
        const { sala, participante, delEquipo } = quienEs;

        if (participante.estado === "rechazado") {
            return { success: false, message: "No te han dejado entrar a esta reunión." };
        }
        if (participante.estado === "fuera") {
            return { success: false, message: "Ya no estás en esta reunión." };
        }

        await latirEnLaSala(participante.id, input.medios ?? null);
        await sacarALosQueNoDanSenales(sala.id);

        // El barrido del buzón, una de cada veinte vueltas y en su propio
        // `try`: un barrido que se cuelgue no puede retener la vuelta que trae
        // la reunión.
        if (++vueltas % 20 === 0) {
            try {
                await barrerSenalesViejas();
            } catch (error) {
                console.warn("[salas] no se pudieron barrer las señales viejas", error);
            }
        }

        const todos = await losDeLaSala(sala.id);
        const abroLaPuerta = puedeAbrirLaPuerta({ participante, sala, delEquipo });

        const comoSeVe = (f: FilaDeParticipante): QuienEstaEnLaSala => ({
            id: f.id,
            nombre: f.nombre,
            esInvitado: f.esInvitado,
            esElAnfitrion: f.personaId === sala.anfitrionId,
            micEncendido: f.micEncendido,
            camaraEncendida: f.camaraEncendida,
            compartiendo: f.compartiendo,
        });

        // El buzón se vacía SOLO si ya estoy dentro. Quien espera en la puerta
        // no tiene con quién hablar todavía, y vaciárselo se llevaría por
        // delante una oferta que llegara justo al abrirle.
        const senales =
            participante.estado === "dentro" ? await vaciarElBuzon(participante.id) : [];

        return {
            success: true,
            datos: {
                yo: {
                    participanteId: participante.id,
                    nombre: participante.nombre,
                    estado: participante.estado,
                    abroLaPuerta,
                },
                sala: {
                    id: sala.id,
                    codigo: sala.codigo,
                    titulo: sala.titulo,
                    expiraEn: sala.expiraEn.toISOString(),
                },
                dentro: todos.filter((f) => f.estado === "dentro").map(comoSeVe),
                // La lista de espera solo la ve quien puede hacer algo con
                // ella: enseñársela a todos convierte una decisión en un
                // espectáculo, y encima da los nombres de gente de fuera a
                // quien no tiene por qué verlos.
                esperando: abroLaPuerta
                    ? todos.filter((f) => f.estado === "esperando").map(comoSeVe)
                    : [],
                senales: senales.map((s) => ({ deId: s.deId, tipo: s.tipo, sdp: s.sdp })),
                ice:
                    participante.estado === "dentro"
                        ? losServidoresIce({
                              TURN_URL: process.env.TURN_URL,
                              TURN_USER: process.env.TURN_USER,
                              TURN_PASSWORD: process.env.TURN_PASSWORD,
                          })
                        : [],
            },
        };
    } catch (error) {
        // Mudo aquí se ve como «la reunión no carga», que es de lo más difícil
        // de diagnosticar.
        console.warn("[salas] falló una vuelta del reloj de la sala", error);
        return { success: false, message: "Se perdió la conexión con la reunión." };
    }
}

/**
 * Dejar una oferta o una respuesta en el buzón de otro.
 *
 * Tres comprobaciones, y ninguna sobra:
 *
 * 1. **Quién soy lo resuelve el servidor**, nunca los parámetros. El `deId` que
 *    se guarda sale de la sesión o del token.
 * 2. **A quién va tiene que estar DENTRO de esta misma sala.** Sin esto, con un
 *    id a mano se le podría dejar una oferta a alguien de otra reunión.
 * 3. **El SDP tiene la forma que se espera.** No se valida el contenido —eso lo
 *    hace el navegador al aplicarlo— sino que sea el objeto que mandamos y no
 *    un texto cualquiera: es algo que se le entrega al navegador de otro.
 */
export async function enviarSenalAction(input: {
    codigo?: string | null;
    token?: string | null;
    paraId: string;
    tipo: string;
    sdp: string;
}): Promise<Respuesta<{ listo: true }>> {
    try {
        const quienEs = await quienEsEnLaSala(input);
        if ("error" in quienEs) return { success: false, message: quienEs.error };
        const { sala, participante } = quienEs;

        if (participante.estado !== "dentro") {
            return { success: false, message: "Todavía no estás en la reunión." };
        }
        if (!esTipoDeSenal(input.tipo)) {
            return { success: false, message: "Esa señal no existe." };
        }
        const sdp = comoSeGuardaElSdp(input.sdp, input.tipo);
        if (!sdp) {
            console.warn("[salas] llegó una señal con una forma que no es", {
                sala: sala.id,
                tipo: input.tipo,
            });
            return { success: false, message: "No se pudo preparar la conexión." };
        }

        const todos = await losDeLaSala(sala.id);
        const destino = todos.find((f) => f.id === input.paraId && f.estado === "dentro");
        if (!destino) {
            return { success: false, message: "Esa persona ya no está en la reunión." };
        }

        await dejarLaSenal({
            salaId: sala.id,
            deId: participante.id,
            paraId: destino.id,
            tipo: input.tipo,
            sdp,
        });
        return { success: true, listo: true };
    } catch (error) {
        console.warn("[salas] no se pudo dejar la señal", error);
        return { success: false, message: "No se pudo conectar con esa persona." };
    }
}

/** Dejar pasar a quien esperaba. */
export async function dejarPasarAction(input: {
    codigo?: string | null;
    participanteId: string;
}): Promise<Respuesta<{ listo: true }>> {
    try {
        const quienEs = await quienEsEnLaSala({ codigo: input.codigo });
        if ("error" in quienEs) return { success: false, message: quienEs.error };
        if (!puedeAbrirLaPuerta(quienEs)) {
            return { success: false, message: "Aquí no puedes dejar pasar a nadie." };
        }

        const hecho = await dejarPasar({
            salaId: quienEs.sala.id,
            participanteId: input.participanteId,
        });
        if (hecho === "llena") {
            return {
                success: false,
                message: `La reunión está llena (${TOPE_DE_LA_SALA} personas).`,
            };
        }
        return { success: true, listo: true };
    } catch (error) {
        console.warn("[salas] no se pudo dejar pasar", error);
        return { success: false, message: "No se pudo dejar pasar." };
    }
}

/** No dejar pasar, o sacar de la reunión a alguien que ya estaba. */
export async function sacarDeLaSalaAction(input: {
    codigo?: string | null;
    participanteId: string;
    motivo?: string;
}): Promise<Respuesta<{ listo: true }>> {
    try {
        const quienEs = await quienEsEnLaSala({ codigo: input.codigo });
        if ("error" in quienEs) return { success: false, message: quienEs.error };
        if (!puedeAbrirLaPuerta(quienEs)) {
            return { success: false, message: "Aquí no puedes sacar a nadie." };
        }
        if (input.participanteId === quienEs.participante.id) {
            // Salirse tiene su propio camino; por aquí sería sacarse a uno
            // mismo con los botones de moderar, que es confuso y además deja
            // la puerta sin nadie que la abra.
            return { success: false, message: "Para salir, usa el botón de colgar." };
        }

        await sacarDeLaSala({
            salaId: quienEs.sala.id,
            participanteId: input.participanteId,
            motivo: input.motivo === "rechazado" ? "rechazado" : "fuera",
        });
        return { success: true, listo: true };
    } catch (error) {
        console.warn("[salas] no se pudo sacar de la reunión", error);
        return { success: false, message: "No se pudo sacar a esa persona." };
    }
}

/**
 * Salir de la reunión.
 *
 * **Nunca falla hacia fuera.** Se llama al cerrar la ventana, así que un error
 * aquí no tiene a quién decírselo; y si no llegara a correr, el latido se
 * encarga: a los pocos segundos sin dar señales, la sala saca sola a quien se
 * fue. Esto solo hace que el recuadro desaparezca **al momento** en vez de en
 * medio minuto.
 */
export async function salirDeLaSalaAction(input: {
    codigo?: string | null;
    token?: string | null;
}): Promise<Respuesta<{ listo: true }>> {
    try {
        const quienEs = await quienEsEnLaSala(input);
        if ("error" in quienEs) return { success: true, listo: true };
        await sacarDeLaSala({
            salaId: quienEs.sala.id,
            participanteId: quienEs.participante.id,
            motivo: "fuera",
        });
    } catch (error) {
        console.warn("[salas] no se pudo salir limpiamente", error);
    }
    return { success: true, listo: true };
}
