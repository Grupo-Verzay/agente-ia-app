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
    comoSeGuardaElMensaje,
    hayQueObedecerElSilencio,
    laDireccionDeLaSala,
    laDuracionQueSePuede,
    loQueSeLeDiceAlQueLlegaTarde,
    tieneLaManoLevantada,
    TOPE_DE_MENSAJES_POR_VUELTA,
    type TipoDeSenal,
} from "@/lib/sala-de-video";
import {
    DIAS_DE_HISTORICO,
    TOPE_DEL_HISTORICO,
    comoSeLeeLaDuracion,
    cuandoTermino,
    cuantoDuro,
    esDeMiCuenta,
    esDeMiFamilia,
    puedeAbrirUnaReunion,
    puedeAdministrarLaSala,
    type LaFamilia,
} from "@/lib/reuniones-de-la-cuenta";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import {
    barrerLosChatsViejos,
    barrerSenalesViejas,
    crearLaSala,
    dejarLaSenal,
    dejarPasar,
    elInvitadoDelToken,
    entrarConCuenta,
    cambiarLaCaducidad,
    elHistorialDeLaFamilia,
    lasSalasVivasDeLaFamilia,
    losDatosDeLasCuentas,
    lasSalasVivasDelCanal,
    laSalaPorCodigo,
    laSalaPorId,
    escribirEnLaSala,
    latirEnLaSala,
    levantarLaMano,
    llamarALaPuerta,
    losDeLaSala,
    losMensajesDeLaSala,
    pedirElSilencio,
    revocarLaSala,
    sacarALosQueNoDanSenales,
    sacarDeLaSala,
    vaciarElBuzon,
    type FilaDeParticipante,
    type FilaDeSala,
    reanudarEnLaSala,
    empezarLaGrabacion,
    latirGrabando,
    cerrarLaGrabacion,
    laGrabacion,
    loQueOcupanLasGrabaciones,
    lasGrabacionesDeLasSalas,
    guardarLaTranscripcionDeLaReunion,
    type FilaDeGrabacion,
} from "@/lib/salas-de-video-db";
import {
    comoVaElCupo,
    esModoDeGrabacion,
    queHacerConLaGrabacion,
    porQueNoSeTranscribe,
    seSigueGrabando,
    comoSeLeenLosBytes,
    diasQueLeQuedan,
    TOPE_DE_UNA_GRABACION_MS,
    type ModoDeGrabacion,
} from "@/lib/grabacion-de-reunion";
import {
    laCuentaPuedeGrabar,
    cerrarYJuntarLaGrabacion,
    bajarLaGrabacion,
    elResumenDeLaReunion,
} from "@/lib/grabacion-de-reunion.server";
import { costoDeLaNota } from "@/lib/transcripcion-de-voz";
import { laCuentaQuePagaLaTranscripcion } from "@/lib/nota-de-voz-del-equipo";
import {
    losCreditosQueQuedan,
    descontarLaTranscripcion,
    laClaveDeOpenAi,
    pedirleElTextoAOpenAi,
} from "@/lib/creditos-de-transcripcion";

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
 *
 * **La rama sin canal es la que cambia**: ya no es «mi cuenta», es «mi
 * FAMILIA». Una reunión de la cuenta la ve y entra cualquiera alcanzable por la
 * fila efectiva de quien mira —la madre, sus vinculadas, en los dos sentidos—,
 * usando la malla del #812. Quien está fuera de la familia no pasa. La familia
 * puede venir ya resuelta (`familia`) para no volver a pedirla en cada vuelta
 * del reloj; si no viene, se resuelve aquí. El camino de la propia cuenta no
 * paga nada: `esDeMiCuenta` corta antes de tocar la familia.
 */
async function perteneceALaSala(
    sala: FilaDeSala,
    yo: NonNullable<Awaited<ReturnType<typeof quien>>>,
    familia?: LaFamilia | null,
): Promise<boolean> {
    if (sala.canalId) {
        return Boolean(await elCanal(sala.canalId, yo));
    }
    if (esDeMiCuenta(sala, yo.cuentaId)) return true;
    const flia = familia ?? (await laFamiliaDeLaCuenta(yo.cuentaId));
    return esDeMiFamilia(sala, flia.cuentas);
}

/**
 * Si puedo administrar (revocar, moderar, grabar) una sala, resolviendo la
 * familia solo cuando hace falta.
 *
 * El camino barato —anfitrión o mi propia cuenta— no toca la familia. Solo
 * cuando la sala es de OTRA cuenta y administro la mía se resuelve la familia,
 * para comprobar la regla de la raíz: *solo la madre manda sobre las salas de
 * sus hijas*. Ver `puedeAdministrarLaSala`.
 */
async function puedeAdministrarEstaSala(
    sala: FilaDeSala,
    yo: NonNullable<Awaited<ReturnType<typeof quien>>>,
): Promise<boolean> {
    if (puedeAdministrarLaSala(sala, yo)) return true;
    if (!yo.manda) return false;
    const familia = await laFamiliaDeLaCuenta(yo.cuentaId);
    return puedeAdministrarLaSala(sala, yo, familia);
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

/**
 * Lo que se le contesta a una duración que no se puede guardar.
 *
 * Los dos «no» se arreglan de forma distinta y por eso se dicen distinto: una
 * duración que no existe es una pantalla vieja o una petición escrita a mano;
 * «No caduca» sin mandar en la cuenta es un permiso, y quien lo pide tiene que
 * saber que la opción existe y que no es suya. Un «esa duración no existe» para
 * el segundo caso manda a buscar un fallo donde hay una regla.
 */
/**
 * Una fecha que llega del navegador, o nada.
 *
 * Lo único que hace es no dejar que una cadena rara se cuele en un `WHERE`
 * como `Invalid Date`: Postgres la rechazaría y la vuelta entera del reloj
 * fallaría —o sea, la reunión se quedaría congelada— por un cursor de chat mal
 * escrito. Sin fecha válida se devuelven los últimos, que es el caso de
 * «acabo de abrir el chat» y nunca se equivoca hacia enseñar de más.
 */
function unaFecha(v: unknown): Date | null {
    if (typeof v !== "string" || !v.trim()) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
}

function porQueNoEsaDuracion(motivo: "desconocida" | "no_puede"): string {
    return motivo === "desconocida"
        ? "Esa duración no existe."
        : "Solo quien administra la cuenta puede dejar un enlace sin caducidad.";
}

// ── Crear, listar y revocar ─────────────────────────────────────────────────

export type SalaParaLaPantalla = {
    id: string;
    codigo: string;
    enlace: string;
    /** `null` en una reunión de la cuenta, sin canal detrás. */
    canalId: string | null;
    /** La cuenta DUEÑA de la sala. Con la familia por medio puede no ser la mía. */
    cuentaId: string;
    /**
     * Cómo se llama la cuenta dueña, para pintar a quién pertenece la sala.
     *
     * Baja siempre, y la pantalla decide cuándo enseñar la insignia (ver
     * `variasCuentas`): en una familia de una sola cuenta sería ruido repetir su
     * nombre en cada fila.
     */
    cuentaNombre: string | null;
    anfitrionId: string;
    anfitrionNombre: string | null;
    titulo: string | null;
    creadoEn: string;
    /** `null` es **no caduca**. La pantalla lo lee con `comoSeLeeLaCaducidad`. */
    expiraEn: string | null;
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
    /** La familia ya resuelta, para el `puedoAdministrar` de una sala ajena. */
    familia?: LaFamilia | null,
    /** Cómo se llama cada cuenta de la familia. */
    nombres?: Map<string, string>,
): SalaParaLaPantalla {
    return {
        id: fila.id,
        codigo: fila.codigo,
        enlace: laDireccionDeLaSala(fila.codigo, raiz),
        canalId: fila.canalId,
        cuentaId: fila.cuentaId,
        cuentaNombre: nombres?.get(fila.cuentaId) ?? null,
        anfitrionId: fila.anfitrionId,
        anfitrionNombre: fila.anfitrionNombre,
        titulo: fila.titulo,
        creadoEn: fila.creadoEn.toISOString(),
        expiraEn: fila.expiraEn ? fila.expiraEn.toISOString() : null,
        soyElAnfitrion: Boolean(yo) && fila.anfitrionId === yo,
        // La sala de otra cuenta la administra solo la madre: por eso baja la
        // familia. Para las salas propias, `puedeAdministrarLaSala` ya contesta
        // sin ella (anfitrión o mi cuenta).
        puedoAdministrar: puedeAdministrarLaSala(fila, quienPregunta, familia),
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

        // La duración se comprueba TAMBIÉN por este camino, y antes no se
        // comprobaba en absoluto: `cuandoCaduca` cae en la de por defecto ante
        // cualquier cosa, así que un valor raro se guardaba en silencio. Con
        // «No caduca» en la lista eso deja de ser inofensivo — sería la forma
        // de dejar un enlace permanente por la puerta del canal, sin mandar en
        // la cuenta y sin que salga en ninguna lista desde la que revocarlo.
        const cuanto = laDuracionQueSePuede(duracion, yo.manda);
        if (!cuanto.ok) return { success: false, message: porQueNoEsaDuracion(cuanto.motivo) };

        const limpio = (titulo ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
        const fila = await crearLaSala({
            cuentaId: canal.cuentaId,
            canalId: canal.id,
            anfitrionId: yo.personaId,
            anfitrionNombre: yo.nombre ?? null,
            titulo: limpio,
            expiraEn: cuandoCaduca(cuanto.valor),
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
        if (!(await puedeAdministrarEstaSala(sala, yo))) {
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
        // **Aquí se decide «No caduca».** `yo.manda` es `canManageWorkspace`,
        // la misma puerta de siempre: dueño, `administrador` del equipo y
        // superadministrador de verdad; un `agente` participa y no manda. Que
        // la pantalla no le pinte la opción no cierra la petición directa.
        const cuanto = laDuracionQueSePuede(duracion, yo.manda);
        if (!cuanto.ok) return { success: false, message: porQueNoEsaDuracion(cuanto.motivo) };

        const limpio = (titulo ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
        const fila = await crearLaSala({
            cuentaId: yo.cuentaId,
            // Sin canal: es una reunión de la cuenta. Lo que la hace visible en
            // Reuniones y lo que la deja FUERA de los canales.
            canalId: null,
            anfitrionId: yo.personaId,
            anfitrionNombre: yo.nombre ?? null,
            titulo: limpio,
            expiraEn: cuandoCaduca(cuanto.valor),
        });

        const raiz = await laRaizDeLaApp();
        return { success: true, sala: comoSeVeLaSala(fila, raiz, yo.personaId, yo) };
    } catch (error) {
        console.warn("[salas] no se pudo abrir la reunión de la cuenta", error);
        return { success: false, message: "No se pudo abrir la reunión." };
    }
}

/**
 * Las reuniones vivas de la FAMILIA. Solo las que no son de ningún canal.
 *
 * Lista las salas de **todas las cuentas alcanzables** por la fila efectiva de
 * quien mira (`laFamiliaDeLaCuenta`, la malla del #812): la madre ve las de sus
 * vinculadas, una hija las de la familia entera, y quien está fuera no ve
 * ninguna. Es lo que evita tener que cambiar de cuenta para entrar a la sala de
 * una hija. Cada sala baja **a qué cuenta pertenece** (`cuentaNombre`), y
 * `variasCuentas` le dice a la pantalla cuándo pintar la insignia —en una
 * familia de una sola cuenta sería repetir su nombre en cada fila—.
 *
 * Baja además **qué puede hacer quien mira**, y las dos cosas por separado:
 * `puedoAbrir` es de cualquiera de la cuenta —un `agente` abre su reunión— y
 * `puedoNoCaducar` es de quien la administra. Se resuelven aquí, en el
 * servidor, y la pantalla solo las pinta: recalcularlas allí sería tener dos
 * condiciones que el día que se afine una dejan un desplegable que ofrece algo
 * que la acción luego rechaza.
 */
export async function lasReunionesDeLaCuentaAction(): Promise<
    Respuesta<{
        salas: SalaParaLaPantalla[];
        puedoAbrir: boolean;
        puedoNoCaducar: boolean;
        variasCuentas: boolean;
    }>
> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };
        const raiz = await laRaizDeLaApp();
        const familia = await laFamiliaDeLaCuenta(yo.cuentaId);
        const filas = await lasSalasVivasDeLaFamilia(familia.cuentas);
        const nombres = await mapaDeNombres(familia.cuentas);
        return {
            success: true,
            salas: filas.map((f) => comoSeVeLaSala(f, raiz, yo.personaId, yo, familia, nombres)),
            puedoAbrir: puedeAbrirUnaReunion(yo),
            puedoNoCaducar: yo.manda,
            variasCuentas: familia.cuentas.length > 1,
        };
    } catch (error) {
        console.warn("[salas] no se pudieron leer las reuniones de la cuenta", error);
        return { success: false, message: "No se pudieron leer las reuniones." };
    }
}

/**
 * El nombre de cada cuenta de la familia, para pintar a quién pertenece la sala.
 *
 * `nombreDeLaCuenta` y no `company` a secas: esa columna nace con «Empresa
 * Demo» y saldrían todas iguales — el mismo fallo que ya costó una vuelta en el
 * selector de permisos de Documentación.
 */
async function mapaDeNombres(cuentas: readonly string[]): Promise<Map<string, string>> {
    const datos = await losDatosDeLasCuentas([...cuentas]);
    return new Map(datos.map((c) => [c.id, nombreDeLaCuenta(c)]));
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
): Promise<Respuesta<{ expiraEn: string | null }>> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };
        const cuanto = laDuracionQueSePuede(duracion, yo.manda);
        if (!cuanto.ok) return { success: false, message: porQueNoEsaDuracion(cuanto.motivo) };

        const sala = await laSalaPorId(salaId);
        if (!sala) return { success: false, message: "Esta reunión ya no existe." };
        if (!(await puedeAdministrarEstaSala(sala, yo))) {
            return {
                success: false,
                message: "Solo quien abrió la reunión o quien administra la cuenta puede cambiar su caducidad.",
            };
        }

        const expiraEn = cuandoCaducaAlCambiar(cuanto.valor);
        const hecho = await cambiarLaCaducidad(salaId, expiraEn);
        if (!hecho) {
            // Revocada: alargarle la fecha sería deshacer por la puerta de
            // atrás una decisión que alguien tomó, con la gente ya echada.
            return {
                success: false,
                message: "Este enlace está revocado. Abre una reunión nueva.",
            };
        }
        return { success: true, expiraEn: expiraEn ? expiraEn.toISOString() : null };
    } catch (error) {
        console.warn("[salas] no se pudo cambiar la caducidad", error);
        return { success: false, message: "No se pudo cambiar la caducidad." };
    }
}

/**
 * Regenerar el enlace: el mismo sitio, otro código.
 *
 * Es la otra mitad de que «No caduca» pueda existir. Un enlace permanente —el
 * de atención, el que se pega en una firma— acaba en sitios que nadie controla,
 * y el día que se filtra **no vale revocarlo**: revocar deja a la cuenta sin su
 * enlace de atención hasta que alguien abra otro y lo reparta. Regenerar cierra
 * el viejo y abre el nuevo **en el mismo gesto**, con su nombre y su caducidad.
 *
 * Tres cosas:
 *
 * 1. **Se copia la caducidad tal cual estaba**, no se vuelve a elegir. Una
 *    permanente sigue permanente; una que caducaba el jueves sigue caducando el
 *    jueves. Por eso esto **no vuelve a pedir `manda`**: no se está eligiendo
 *    nada que no estuviera ya elegido, y lo que hace es *reducir* la exposición
 *    —el enlace viejo deja de valer—.
 * 2. **Solo sobre una sala viva.** Regenerar una caducada nacería muerta: se
 *    contesta que abra una nueva, que es lo que de verdad quiere.
 * 3. **Primero se revoca y después se crea.** Al revés, un fallo a mitad
 *    dejaría los dos enlaces abiertos a la vez, que es exactamente lo que esto
 *    viene a evitar. Si falla el segundo paso queda la cuenta sin enlace, que
 *    se arregla con un clic y no filtra nada.
 */
export async function regenerarLaSalaAction(
    salaId: string,
): Promise<Respuesta<{ sala: SalaParaLaPantalla }>> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };

        const sala = await laSalaPorId(salaId);
        if (!sala) return { success: false, message: "Esta reunión ya no existe." };
        if (!(await puedeAdministrarEstaSala(sala, yo))) {
            return {
                success: false,
                message: "Solo quien abrió la reunión o quien administra la cuenta puede regenerar su enlace.",
            };
        }
        if (comoEstaLaSala(sala) !== "abierta") {
            return {
                success: false,
                message: "Este enlace ya no está activo. Abre una reunión nueva.",
            };
        }

        await revocarLaSala(salaId);
        const fila = await crearLaSala({
            cuentaId: sala.cuentaId,
            canalId: sala.canalId,
            anfitrionId: yo.personaId,
            anfitrionNombre: yo.nombre ?? null,
            titulo: sala.titulo,
            expiraEn: sala.expiraEn,
        });

        const raiz = await laRaizDeLaApp();
        return { success: true, sala: comoSeVeLaSala(fila, raiz, yo.personaId, yo) };
    } catch (error) {
        console.warn("[salas] no se pudo regenerar el enlace", error);
        return { success: false, message: "No se pudo regenerar el enlace." };
    }
}

// ── El histórico ────────────────────────────────────────────────────────────

export type ReunionPasada = {
    id: string;
    titulo: string | null;
    /** A qué cuenta pertenece. La pantalla la enseña cuando la familia es varias. */
    cuentaNombre: string | null;
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
): Promise<Respuesta<{ reuniones: ReunionPasada[]; dias: number; variasCuentas: boolean }>> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };

        const cuantos = Number.isFinite(dias) ? Math.min(Math.max(1, Math.floor(dias)), 365) : DIAS_DE_HISTORICO;
        const familia = await laFamiliaDeLaCuenta(yo.cuentaId);
        const filas = await elHistorialDeLaFamilia(familia.cuentas, cuantos, TOPE_DEL_HISTORICO);
        const nombres = await mapaDeNombres(familia.cuentas);

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
                cuentaNombre: nombres.get(sala.cuentaId) ?? null,
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

        return { success: true, reuniones, dias: cuantos, variasCuentas: familia.cuentas.length > 1 };
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
          /**
           * Quién es fuera de esta sala, cuando tiene cuenta.
           *
           * Hace falta para lo único que no se puede contestar con la fila de
           * participante: **si administra la cuenta dueña de la sala**, que es
           * la mitad de quién puede moderar. Va `null` para un invitado, que es
           * justamente lo que le deja fuera de moderar sin ninguna condición
           * más.
           */
          yo: Awaited<ReturnType<typeof quien>> | null;
          /**
           * La familia de quien mira, resuelta **una sola vez** por vuelta.
           *
           * Se resuelve aquí —donde ya se comprueba la pertenencia— y se reparte
           * a quien decida si puede moderar una sala de OTRA cuenta de la
           * familia (`puedeAdministrarLaSala`), en vez de volver a pedirla en
           * cada botón cada 2 s. Va `null` para el invitado y para el camino
           * barato de la propia cuenta, que no la necesita.
           */
          familia: LaFamilia | null;
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
        return { sala, participante: fila, delEquipo: false, yo: null, familia: null };
    }

    const codigo = (input.codigo ?? "").trim();
    if (!codigo) return { error: "No autorizado." };
    const sala = await laSalaPorCodigo(codigo);
    if (!sala) return { error: "Este enlace de reunión no es válido." };
    const estado = comoEstaLaSala(sala);
    if (estado !== "abierta") return { error: loQueSeLeDiceAlQueLlegaTarde(estado) };

    const yo = await quien();
    if (!yo) return { error: "No autorizado." };
    // La familia se resuelve una vez y se reutiliza: la necesitan `pertenece` y
    // `puedeAdministrar`. Solo cuando la sala no es de mi propia cuenta ni de un
    // canal —el caso de OTRA cuenta de la familia—; el camino común no paga nada.
    const familia =
        !sala.canalId && !esDeMiCuenta(sala, yo.cuentaId)
            ? await laFamiliaDeLaCuenta(yo.cuentaId)
            : null;
    // Se vuelve a comprobar la pertenencia en CADA vuelta, no solo al entrar:
    // a alguien se le puede sacar de un canal —o de la familia— mientras la
    // reunión sigue abierta, y su pestaña seguiría pidiendo por el código.
    if (!(await perteneceALaSala(sala, yo, familia))) return { error: "No autorizado." };
    const fila = await elParticipanteDeLaSesion(sala.id, yo.personaId);
    if (!fila) return { error: "Todavía no has entrado a esta reunión." };
    return { sala, participante: fila, delEquipo: true, yo, familia };
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
    /**
     * Si tiene la mano levantada.
     *
     * Se manda ya resuelto —un booleano, no la hora— porque quien la mira es la
     * pantalla y la caducidad es cosa del servidor: mandando la marca cruda,
     * cada recuadro tendría que decidir por su cuenta cuándo baja, y dos
     * personas con el reloj ligeramente distinto verían manos distintas.
     */
    manoLevantada: boolean;
    /**
     * Cuándo entró **esta vez**, en ISO.
     *
     * Es lo que hace que una reconexión sea simétrica sin inventar ninguna
     * señal nueva. En una malla solo ofrece uno de los dos (`debeOfrecer`), así
     * que cuando a alguien se le cae la red y vuelve, el que NO ofrece podría
     * quedarse con una conexión que a él todavía le parece viva, esperando una
     * oferta que el otro no cree tener que mandar. Con esta marca la regla se
     * escribe sola: **una conexión montada antes de que esa persona entrara es
     * de una sesión suya anterior**, y se tira.
     *
     * Sin ella se converge igual, pero por el camino lento: WebRTC tarda entre
     * quince y treinta segundos en dar una conexión por muerta cuando la otra
     * punta simplemente dejó de contestar. Medio minuto de recuadro en negro
     * después de que la reunión ya haya vuelto no se lee como «está volviendo».
     */
    desde: string | null;
};

/** Un mensaje del chat de la reunión. No sale de aquí: ver `sala_mensajes`. */
export type MensajeDeLaSala = {
    id: string;
    deId: string;
    autorNombre: string;
    texto: string;
    creadoEn: string;
};

export type LoQuePasaEnLaSala = {
    /** Mi propia fila: quién soy aquí dentro y en qué punto estoy. */
    yo: {
        participanteId: string;
        nombre: string;
        estado: string;
        /** Si puedo dejar pasar a quien espera. Ver `puedeAbrirLaPuerta`. */
        abroLaPuerta: boolean;
        /**
         * Si puedo silenciar y sacar a alguien. **No es lo mismo que abrir la
         * puerta**: ver la nota de `lib/sala-de-video.ts`.
         */
        moderas: boolean;
        /** Si tengo la mano levantada, para que el botón se vea pulsado. */
        manoLevantada: boolean;
        /**
         * Cuándo me pidieron que me silenciara, si me lo han pedido.
         *
         * Va la MARCA y no un booleano porque la pantalla tiene que poder
         * distinguir **esta** orden de la de hace un momento: obedecida una
         * vez, quien vuelve a encender el micro no puede volver a callarse solo
         * en la vuelta siguiente. Lo decide `hayQueObedecerElSilencio`, con la
         * marca exacta delante.
         */
        silenciadoEn: string | null;
    };
    sala: { id: string; codigo: string; titulo: string | null; expiraEn: string | null };
    /** Los que están dentro, yo incluido. */
    dentro: QuienEstaEnLaSala[];
    /** Los que esperan. Solo lo ve quien puede abrir la puerta. */
    esperando: QuienEstaEnLaSala[];
    /** Las ofertas y respuestas que me habían dejado. Vienen ya consumidas. */
    senales: Array<{ deId: string; tipo: TipoDeSenal; sdp: string }>;
    /**
     * Los mensajes del chat que faltan, **no el hilo entero**.
     *
     * Viajan aquí y no en un reloj propio por lo de siempre: esta vuelta ya
     * está pagada, y un segundo sondeo para el chat sería duplicar las
     * peticiones de la pantalla más cara que tiene esto. Y el corte lo manda el
     * navegador (`desdeMensaje`), así que en marcha normal esto viene vacío.
     */
    mensajes: MensajeDeLaSala[];
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
    /**
     * Si se está grabando ahora mismo, y desde cuándo.
     *
     * **Lo ven todos, no solo quien graba**: grabar la voz y la cara de los
     * demás sin que se note no es una función, es otra cosa. Viaja aquí y no
     * en una consulta propia porque la fila de la sala ya viene cargada en
     * esta vuelta; preguntarlo aparte sería una consulta por persona y por
     * vuelta en el camino más caliente de esta pantalla.
     */
    grabando: { desde: string; por: string } | null;
    /**
     * Si a mí me sale el botón de grabar.
     *
     * Lo decide el servidor y no la pantalla: son dos cosas —administrar la
     * sala y que la CUENTA tenga el módulo— y la segunda el navegador no la
     * sabe. Enseñar el botón y que la acción conteste que no es el «menú
     * abierto, puerta cerrada» que este repositorio ya pagó varias veces.
     */
    puedoGrabar: boolean;
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
    /**
     * La hora del último mensaje del chat que ya tengo.
     *
     * Es el corte, y lo manda el navegador porque es quien sabe qué tiene
     * pintado. Vacío significa «acabo de abrir el chat»: se devuelven los
     * últimos, no todos — ver `losMensajesDeLaSala`.
     *
     * Y **no decide nada más que qué se devuelve**: no es una credencial ni
     * acota a qué sala se mira, así que una hora inventada como mucho se trae
     * mensajes de esta misma reunión que ya se tenían.
     */
    desdeMensaje?: string | null;
    /**
     * La grabación que ESTA pestaña está llevando, si lleva alguna.
     *
     * Es lo que refresca `grabandoVistoEn` y, con él, el aviso de todos. Va
     * dentro del latido y no en una acción propia por lo de siempre: esta
     * vuelta ya está pagada, y un segundo reloj solo para decir «sigo
     * grabando» sería duplicar las peticiones de quien graba.
     *
     * Y **no decide nada**: solo refresca la marca de la grabación que la fila
     * de la sala ya nombra. Un id inventado no toca ninguna fila.
     */
    grabando?: string | null;
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

        // El latido de quien graba. Solo si la sala dice que esa es la
        // grabación en curso, que es lo que impide refrescar una ajena.
        const grabandoAqui = (input.grabando ?? "").trim();
        if (grabandoAqui && grabandoAqui === sala.grabacionId) {
            await latirGrabando(sala.id, grabandoAqui);
        }

        // El barrido del buzón, una de cada veinte vueltas y en su propio
        // `try`: un barrido que se cuelgue no puede retener la vuelta que trae
        // la reunión.
        if (++vueltas % 20 === 0) {
            try {
                await barrerSenalesViejas();
                // Y los chats de reuniones que ya terminaron. Va en el MISMO
                // `try` a propósito: los dos son barridos que no pueden
                // retener la vuelta que trae la reunión, y con dos bloques
                // separados el segundo se olvidaría el día que alguien toque
                // el primero.
                await barrerLosChatsViejos();
            } catch (error) {
                console.warn("[salas] no se pudo barrer lo viejo de las salas", error);
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
            manoLevantada: tieneLaManoLevantada(f.manoLevantadaEn),
            desde: f.entradoEn ? f.entradoEn.toISOString() : null,
        });

        // El buzón se vacía SOLO si ya estoy dentro. Quien espera en la puerta
        // no tiene con quién hablar todavía, y vaciárselo se llevaría por
        // delante una oferta que llegara justo al abrirle.
        const senales =
            participante.estado === "dentro" ? await vaciarElBuzon(participante.id) : [];

        // El chat, por lo mismo: quien espera en la puerta todavía no está en
        // la reunión, y darle la conversación de dentro sería dejarle leer una
        // sala a la que no le han abierto.
        const mensajes =
            participante.estado === "dentro"
                ? await losMensajesDeLaSala({
                      salaId: sala.id,
                      desde: unaFecha(input.desdeMensaje),
                      tope: TOPE_DE_MENSAJES_POR_VUELTA,
                  })
                : [];

        // Moderar: el anfitrión, o quien administra la cuenta dueña de la sala.
        // Se pregunta con la MISMA función que decide revocar el enlace
        // (`puedeAdministrarLaSala`), no con una condición escrita aquí — ver
        // la nota de `lib/sala-de-video.ts`. Y `delEquipo` delante cierra la
        // otra mitad: un invitado no tiene ni sesión con la que preguntar.
        const moderas = delEquipo && puedeAdministrarLaSala(sala, quienEs.yo, quienEs.familia);

        return {
            success: true,
            datos: {
                yo: {
                    participanteId: participante.id,
                    nombre: participante.nombre,
                    estado: participante.estado,
                    abroLaPuerta,
                    moderas,
                    manoLevantada: tieneLaManoLevantada(participante.manoLevantadaEn),
                    silenciadoEn: participante.silenciadoEn
                        ? participante.silenciadoEn.toISOString()
                        : null,
                },
                sala: {
                    id: sala.id,
                    codigo: sala.codigo,
                    titulo: sala.titulo,
                    expiraEn: sala.expiraEn ? sala.expiraEn.toISOString() : null,
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
                mensajes: mensajes.map((m) => ({
                    id: m.id,
                    deId: m.deId,
                    autorNombre: m.autorNombre,
                    texto: m.texto,
                    creadoEn: m.creadoEn.toISOString(),
                })),
                // La marca CADUCA: quien grababa puede haber cerrado la
                // pestaña, y un aviso de grabación que no se apaga miente
                // sobre algo que nadie se toma a broma. Se lee con el latido
                // recién escrito arriba, no con el que traía la fila, o el
                // aviso parpadearía en la pestaña de quien graba.
                grabando:
                    sala.grabandoDesde &&
                    (grabandoAqui === sala.grabacionId || seSigueGrabando(sala.grabandoVistoEn))
                        ? {
                              desde: sala.grabandoDesde.toISOString(),
                              por: sala.grabandoPor ?? "Alguien",
                          }
                        : null,
                puedoGrabar: await puedoGrabarEnEstaSala({
                    sala,
                    delEquipo,
                    yo: quienEs.yo,
                    familia: quienEs.familia,
                }),
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

        // **Dos puertas, según a quién se saque.** Rechazar a quien espera es
        // la cortesía de siempre y la abre cualquiera del equipo que esté
        // dentro; sacar a alguien que YA ESTÁ en la reunión es moderar, y eso
        // se queda en el anfitrión y en quien administra la cuenta.
        //
        // Con una sola puerta, o un invitado se quedaría sin que le abrieran
        // cuando el anfitrión cierra la pestaña —si se pidiera moderar para
        // todo—, o cualquiera del equipo podría echar a cualquiera —si se
        // pidiera solo la puerta—. Por eso se mira **a quién** se saca antes de
        // decidir con qué llave.
        const aQuien = (await losDeLaSala(quienEs.sala.id)).find(
            (f) => f.id === input.participanteId,
        );
        const estabaDentro = aQuien?.estado === "dentro";
        const puede = estabaDentro
            ? quienEs.delEquipo && puedeAdministrarLaSala(quienEs.sala, quienEs.yo, quienEs.familia)
            : puedeAbrirLaPuerta(quienEs);
        if (!puede) {
            return {
                success: false,
                message: estabaDentro
                    ? "Solo quien organiza la reunión puede sacar a alguien."
                    : "Aquí no puedes sacar a nadie.",
            };
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
            // A quien sacan NO vuelve solo. Sin esto, su pestaña detectaría que
            // ya no está dentro y se reanudaría en la vuelta siguiente.
            porQue: "sacado",
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
            // Salir significa salir: tampoco se reanuda.
            porQue: "salio",
        });
    } catch (error) {
        console.warn("[salas] no se pudo salir limpiamente", error);
    }
    return { success: true, listo: true };
}

// ── La mano, el silencio y el chat ──────────────────────────────────────────

/**
 * Levantar o bajar la propia mano.
 *
 * **Solo la propia**: el participante sale de la sesión o del token, nunca de
 * los parámetros. Levantarle la mano a otro sería ponerle a pedir la palabra
 * sin que la haya pedido, y con un id suelto en la firma eso sería una línea.
 */
export async function levantarLaManoAction(input: {
    codigo?: string | null;
    token?: string | null;
    levantada: boolean;
}): Promise<Respuesta<{ listo: true }>> {
    try {
        const quienEs = await quienEsEnLaSala(input);
        if ("error" in quienEs) return { success: false, message: quienEs.error };
        if (quienEs.participante.estado !== "dentro") {
            return { success: false, message: "Todavía no estás en la reunión." };
        }
        await levantarLaMano(quienEs.participante.id, Boolean(input.levantada));
        return { success: true, listo: true };
    } catch (error) {
        // Un botón que se queda puesto y no dice por qué se pulsa cinco veces.
        console.warn("[salas] no se pudo levantar la mano", error);
        return { success: false, message: "No se pudo. Inténtalo otra vez." };
    }
}

/**
 * Pedirle a alguien que se silencie.
 *
 * **No le apaga el micro: le deja una orden que su navegador obedece.** El
 * servidor no tiene ninguna pista que tocar, así que lo único que puede hacer
 * es marcar la fila; la pestaña de esa persona la recoge en su siguiente vuelta
 * y se calla sola. Es como lo hacen todas, y está escrito aquí porque desde
 * fuera parece un interruptor y no lo es — entre pulsar y que se calle pasa
 * una vuelta del reloj.
 *
 * La puerta es **moderar**, no abrir: ver `sacarDeLaSalaAction`.
 */
export async function silenciarAAction(input: {
    codigo?: string | null;
    participanteId: string;
}): Promise<Respuesta<{ listo: true }>> {
    try {
        const quienEs = await quienEsEnLaSala({ codigo: input.codigo });
        if ("error" in quienEs) return { success: false, message: quienEs.error };
        if (!(quienEs.delEquipo && puedeAdministrarLaSala(quienEs.sala, quienEs.yo, quienEs.familia))) {
            return {
                success: false,
                message: "Solo quien organiza la reunión puede silenciar a alguien.",
            };
        }
        if (input.participanteId === quienEs.participante.id) {
            // Callarse uno mismo tiene su botón, y ese sí apaga la pista de
            // verdad en vez de dejarse una orden a sí mismo.
            return { success: false, message: "Para callarte, usa tu botón de micrófono." };
        }
        const hecho = await pedirElSilencio({
            salaId: quienEs.sala.id,
            participanteId: input.participanteId,
        });
        if (!hecho) {
            return { success: false, message: "Esa persona ya no está en la reunión." };
        }
        return { success: true, listo: true };
    } catch (error) {
        console.warn("[salas] no se pudo silenciar", error);
        return { success: false, message: "No se pudo silenciar a esa persona." };
    }
}

/**
 * Escribir en el chat de la reunión.
 *
 * Tres cosas, y las tres son las de siempre en este repositorio:
 *
 * 1. **Hay que estar DENTRO.** Quien espera en la puerta no escribe: sería
 *    hablarle a una sala a la que no le han abierto.
 * 2. **El autor lo pone el servidor**, desde la fila de quien escribe. Con el
 *    nombre llegando del navegador, cualquiera firmaría con el de otro — y aquí
 *    media reunión son invitados de fuera.
 * 3. **El texto se sanea antes de guardarse** (`comoSeGuardaElMensaje`), no
 *    solo al pintarlo: esto viaja en cada vuelta del reloj de todos los demás.
 */
export async function escribirEnLaReunionAction(input: {
    codigo?: string | null;
    token?: string | null;
    texto: string;
}): Promise<Respuesta<{ mensaje: MensajeDeLaSala }>> {
    try {
        const quienEs = await quienEsEnLaSala(input);
        if ("error" in quienEs) return { success: false, message: quienEs.error };
        if (quienEs.participante.estado !== "dentro") {
            return { success: false, message: "Todavía no estás en la reunión." };
        }
        const texto = comoSeGuardaElMensaje(input.texto);
        if (!texto) return { success: false, message: "Escribe algo." };

        const fila = await escribirEnLaSala({
            salaId: quienEs.sala.id,
            deId: quienEs.participante.id,
            autorNombre: quienEs.participante.nombre,
            texto,
        });
        return {
            success: true,
            mensaje: {
                id: fila.id,
                deId: fila.deId,
                autorNombre: fila.autorNombre,
                texto: fila.texto,
                creadoEn: fila.creadoEn.toISOString(),
            },
        };
    } catch (error) {
        console.warn("[salas] no se pudo escribir en la reunión", error);
        return { success: false, message: "No se pudo enviar el mensaje." };
    }
}

// ── Volver después de un corte ──────────────────────────────────────────────

/**
 * Devolver a alguien a su sitio cuando se le cayó la red.
 *
 * **No es entrar otra vez.** No crea fila, no pasa por la puerta y no le pide
 * nada a nadie: reanuda la fila que ya existía, que alguien de dentro admitió
 * en su momento. Es lo que hace que un corte de medio minuto se note como un
 * parpadeo en vez de como una reunión que hay que volver a montar — y lo único
 * que un invitado tiene, porque «Volver a entrar» le devolvería a la puerta y
 * tendría que dar su nombre otra vez y que alguien volviera a abrirle.
 *
 * Quién es lo resuelve el servidor como siempre —la sesión o el token—, así que
 * esto no acepta un participante suelto en los parámetros: con uno, cualquiera
 * reanudaría la fila de otro.
 *
 * Y lo que decide si procede es `motivoDeSalida`, no el estado: los tres
 * caminos que sacan a alguien escriben `fuera`, y solo uno de ellos —el barrido
 * por silencio— es un corte de red. A quien echaron no se le devuelve.
 */
export async function volverAEntrarAction(input: {
    codigo?: string | null;
    token?: string | null;
}): Promise<Respuesta<{ vuelto: true }>> {
    try {
        const token = (input.token ?? "").trim();
        let salaId: string;
        let participanteId: string;

        if (token) {
            const fila = await elInvitadoDelToken(token);
            if (!fila) return { success: false, message: "Tu entrada a esta reunión ya no vale." };
            const sala = await laSalaPorId(fila.salaId);
            if (!sala) return { success: false, message: "Esta reunión ya no existe." };
            const estado = comoEstaLaSala(sala);
            if (estado !== "abierta") {
                return { success: false, message: loQueSeLeDiceAlQueLlegaTarde(estado) };
            }
            salaId = sala.id;
            participanteId = fila.id;
        } else {
            const codigo = (input.codigo ?? "").trim();
            if (!codigo) return { success: false, message: "No autorizado." };
            const sala = await laSalaPorCodigo(codigo);
            if (!sala) return { success: false, message: "Este enlace de reunión no es válido." };
            const estado = comoEstaLaSala(sala);
            if (estado !== "abierta") {
                return { success: false, message: loQueSeLeDiceAlQueLlegaTarde(estado) };
            }
            const yo = await quien();
            if (!yo) return { success: false, message: "No autorizado." };
            // La pertenencia se vuelve a comprobar, como en cada vuelta del
            // reloj: a alguien se le puede sacar del canal mientras estaba
            // desconectado, y volver no puede saltarse esa puerta.
            if (!(await perteneceALaSala(sala, yo))) {
                return { success: false, message: "No autorizado." };
            }
            const fila = await elParticipanteDeLaSesion(sala.id, yo.personaId);
            if (!fila) return { success: false, message: "Todavía no has entrado a esta reunión." };
            salaId = sala.id;
            participanteId = fila.id;
        }

        const vuelto = await reanudarEnLaSala({ salaId, participanteId });
        if (vuelto === "no_procede") {
            return { success: false, message: "Ya no estás en esta reunión." };
        }
        if (!vuelto) {
            // Se dice con esas palabras: mientras estabas fuera entró alguien
            // más, y un quinto corta la reunión para todos.
            return { success: false, message: "La reunión se llenó mientras no estabas." };
        }
        return { success: true, vuelto: true };
    } catch (error) {
        console.warn("[salas] no se pudo volver a la reunión", error);
        return { success: false, message: "No se pudo volver a la reunión." };
    }
}

// ── Grabar ──────────────────────────────────────────────────────────────────

/**
 * Quién puede poner a grabar, y es la puerta de moderar.
 *
 * Grabar deja un fichero con la voz —y la cara— de todos los que están dentro,
 * así que no es participar: es mandar. Es el mismo reparto con el que se
 * silencia y se saca a alguien (`puedeAdministrarLaSala`: el anfitrión y quien
 * administra la cuenta), y por eso se pregunta con la MISMA función y no con
 * una condición nueva escrita aquí — que es como se separan dos puertas que
 * deberían decir lo mismo.
 *
 * Encima va el módulo, que es de la CUENTA: la grabación se vende aparte.
 */
async function puedoGrabarEnEstaSala(quienEs: {
    sala: FilaDeSala;
    delEquipo: boolean;
    yo: Awaited<ReturnType<typeof quien>> | null;
    familia: LaFamilia | null;
}): Promise<boolean> {
    if (!quienEs.delEquipo) return false;
    if (!puedeAdministrarLaSala(quienEs.sala, quienEs.yo, quienEs.familia)) return false;
    // El módulo de grabación se mira sobre la cuenta DUEÑA de la sala **o la
    // MADRE de la familia**: la madre contrata y paga la grabación para toda la
    // familia, y sus reuniones suelen ser de las cuentas hijas. La raíz ya
    // viene resuelta en esta vuelta cuando la sala es de otra cuenta de la
    // familia, así que se pasa como pista y no se pide la familia otra vez.
    return laCuentaPuedeGrabar(quienEs.sala.cuentaId, quienEs.familia?.raiz ?? null);
}

export async function empezarAGrabarAction(input: {
    codigo?: string | null;
    modo: string;
}): Promise<Respuesta<{ grabacionId: string; cuentaId: string }>> {
    try {
        const quienEs = await quienEsEnLaSala({ codigo: input.codigo });
        if ("error" in quienEs) return { success: false, message: quienEs.error };
        if (quienEs.participante.estado !== "dentro") {
            return { success: false, message: "Tienes que estar dentro para grabar." };
        }
        if (!(await puedoGrabarEnEstaSala(quienEs))) {
            return {
                success: false,
                message: "Esta cuenta no tiene la grabación de reuniones, o no la administras.",
            };
        }

        const modo: ModoDeGrabacion = esModoDeGrabacion(input.modo) ? input.modo : "audio";

        // El cupo se mira ANTES de empezar, no a mitad: parar una grabación por
        // falta de sitio con media reunión dentro es perder lo que ya se grabó
        // y encima no decirlo a tiempo.
        const cupo = comoVaElCupo(await loQueOcupanLasGrabaciones(quienEs.sala.cuentaId));
        if (cupo.lleno) {
            return {
                success: false,
                message:
                    "No queda espacio de grabación en esta cuenta. Borra alguna grabación antigua.",
            };
        }

        const fila = await empezarLaGrabacion({
            salaId: quienEs.sala.id,
            cuentaId: quienEs.sala.cuentaId,
            salaTitulo: quienEs.sala.titulo,
            pedidaPorId: quienEs.participante.id,
            pedidaPorNombre: quienEs.participante.nombre,
            modo,
        });
        if (!fila) {
            // El `WHERE grabandoDesde IS NULL` del `UPDATE` es lo que lo
            // impide, así que llegar aquí significa que alguien se adelantó.
            return { success: false, message: "Esta reunión ya se está grabando." };
        }

        console.info("[reuniones] empieza una grabacion", {
            grabacion: fila.id,
            sala: quienEs.sala.id,
            modo,
            cupo: cupo.parte,
        });
        return { success: true, grabacionId: fila.id, cuentaId: quienEs.sala.cuentaId };
    } catch (error) {
        console.warn("[reuniones] no se pudo empezar a grabar", error);
        return { success: false, message: "No se pudo empezar a grabar." };
    }
}

/**
 * Cerrar la grabación: juntar las partes y dejarla en la ficha.
 *
 * `segundos` llega del navegador porque es quien tiene el cronómetro, y se
 * acota: es lo que después decide el precio de la transcripción, así que un
 * entero inventado sería una factura inventada. El techo es un absurdo —el tope
 * de una grabación— y no el de lo transcribible, que es la trampa que ya costó
 * una vuelta en las notas de voz: recortar al tope de lo transcribible haría
 * que una reunión de tres horas se cobrara como una de diez minutos.
 */
export async function terminarDeGrabarAction(input: {
    codigo?: string | null;
    grabacionId: string;
    segundos: number;
}): Promise<Respuesta<{ listo: true }>> {
    try {
        const quienEs = await quienEsEnLaSala({ codigo: input.codigo });
        if ("error" in quienEs) return { success: false, message: quienEs.error };

        const fila = await laGrabacion(input.grabacionId);
        if (!fila || fila.salaId !== quienEs.sala.id) {
            return { success: false, message: "Esa grabación no es de esta reunión." };
        }
        // **La cierra quien la empezó, o quien administra.** Sin lo primero, una
        // reunión con dos administradores dejaría que el otro cortara la
        // grabación desde su pestaña, y las partes que esa pestaña tuviera sin
        // subir se perderían sin que nadie lo notara.
        const suya = fila.pedidaPorId === quienEs.participante.id;
        if (!suya && !(await puedoGrabarEnEstaSala(quienEs))) {
            return { success: false, message: "No puedes cerrar esta grabación." };
        }
        if (fila.estado !== "grabando") return { success: true, listo: true };

        const segundos = Math.max(
            0,
            Math.min(Math.floor(Number(input.segundos) || 0), TOPE_DE_UNA_GRABACION_MS / 1000),
        );

        const cerrada = await cerrarYJuntarLaGrabacion({ grabacionId: fila.id, segundos });
        if (!cerrada.ok) {
            console.warn("[reuniones] la grabacion no dejo ningun fichero", {
                grabacion: fila.id,
                partesAudio: fila.partesAudio,
                partesVideo: fila.partesVideo,
            });
            return { success: false, message: "La grabación no se pudo guardar." };
        }

        console.info("[reuniones] grabacion cerrada", {
            grabacion: fila.id,
            segundos,
            audio: Boolean(cerrada.audioUrl),
            video: Boolean(cerrada.videoUrl),
        });
        return { success: true, listo: true };
    } catch (error) {
        console.warn("[reuniones] no se pudo cerrar la grabacion", error);
        return { success: false, message: "No se pudo cerrar la grabación." };
    }
}

// ── Transcribir, bajo demanda y nunca sola ──────────────────────────────────

/**
 * El texto y el resumen de una reunión grabada.
 *
 * **Siempre a petición, nunca automática**, que es la diferencia con las notas
 * de voz que entran en Chats: allí el asesor tiene que saber qué le dijeron sin
 * ponerse los auriculares, y aquí son compañeros hablando una hora. Transcribir
 * cada reunión que se grabe, a seis créditos el minuto, es una factura que
 * nadie pidió.
 *
 * Y la tarifa **no se vuelve a escribir**: `costoDeLaNota`, los mismos seis
 * créditos por minuto prorrateados que cobran las dos pantallas de al lado. Con
 * una copia, el día que cambie el precio esta cobraría otra cosa — y eso no se
 * ve, se nota meses después en la factura.
 */
export async function transcribirLaReunionAction(input: {
    grabacionId: string;
}): Promise<Respuesta<{ transcripcion: string; resumen: string | null; yaEstaba: boolean }>> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };

        const fila = await laGrabacion(input.grabacionId);
        if (!fila) return { success: false, message: "Esa grabación ya no existe." };

        // La puerta: la grabación es de una CUENTA, y se comprueba contra la de
        // quien pregunta. Sin esto, con un id a mano se leería —y se pagaría—
        // la reunión de otra cuenta.
        if (fila.cuentaId !== yo.cuentaId) {
            return { success: false, message: "No autorizado." };
        }
        if (!(await laCuentaPuedeGrabar(fila.cuentaId))) {
            return { success: false, message: "Esta cuenta no tiene la grabación de reuniones." };
        }

        // Lo que ya está hecho se contesta ANTES de resolver créditos y claves:
        // es el camino común en cuanto alguien la pide una vez, y así se paga
        // una sola vez por muchas que se pulse.
        if (fila.transcripcion) {
            return {
                success: true,
                transcripcion: fila.transcripcion,
                resumen: fila.resumen,
                yaEstaba: true,
            };
        }

        // Quién paga: la cuenta, y dentro de una familia la MADRE. Nunca la
        // persona — `ia_credits` tiene una fila por cuenta, así que cobrarle a
        // alguien del equipo sería cobrarle a una fila que no existe y nadie
        // podría transcribir nada.
        const familia = await laFamiliaDeLaCuenta(yo.cuentaId);
        const paga = laCuentaQuePagaLaTranscripcion({
            cuentaId: yo.cuentaId,
            raizDeLaFamilia: familia.raiz,
        });

        const quedan = await losCreditosQueQuedan(paga);
        const que = queHacerConLaGrabacion({
            yaTranscrita: false,
            audioBytes: fila.audioBytes,
            costo: costoDeLaNota(fila.segundos),
            creditosDisponibles: quedan,
        });
        if (que.hacer !== "transcribir") {
            const porQue = porQueNoSeTranscribe(que);
            return { success: false, message: porQue ?? "No se puede transcribir." };
        }

        const clave = await laClaveDeOpenAi(paga);
        if (!clave) return { success: false, message: "Esta cuenta no tiene configurada su IA." };

        const audio = await bajarLaGrabacion(fila.audioUrl);
        if (!audio) return { success: false, message: "No se pudo leer el audio de la reunión." };

        const texto = await pedirleElTextoAOpenAi({
            audio: audio.bytes,
            clave,
            nombre: audio.nombre,
        });
        if (!texto) {
            // **No se cobra y no se deja marca.** Un fallo de OpenAI es de hoy:
            // marcarlo dejaría esta reunión sin transcribir para siempre y sin
            // decir por qué. El botón sigue.
            return { success: false, message: "No se pudo transcribir. Inténtalo otra vez." };
        }

        // El resumen va DESPUÉS del texto y **no puede tumbarlo**: si falla, se
        // guarda la transcripción igual. Media entrega es mejor que ninguna
        // cuando la mitad que sale ya está pagada.
        const resumen = await elResumenDeLaReunion({ texto, clave });

        await guardarLaTranscripcionDeLaReunion({
            grabacionId: fila.id,
            texto,
            resumen,
        });

        // Se cobra DESPUÉS de tener el texto, y no cuando la cuenta paga su
        // propia IA (`quedan === null`).
        if (quedan !== null) await descontarLaTranscripcion(paga, que.tokens);

        console.info("[reuniones] reunion transcrita", {
            grabacion: fila.id,
            paga,
            segundos: fila.segundos,
            creditos: quedan === null ? "ilimitados" : que.creditos,
            conResumen: Boolean(resumen),
        });

        return { success: true, transcripcion: texto, resumen, yaEstaba: false };
    } catch (error) {
        console.warn("[reuniones] no se pudo transcribir la reunion", error);
        return { success: false, message: "No se pudo transcribir. Inténtalo otra vez." };
    }
}

// ── Lo que la ficha de una reunión enseña de sus grabaciones ────────────────

export type GrabacionEnLaFicha = {
    id: string;
    modo: string;
    estado: string;
    segundos: number;
    duracion: string;
    audioUrl: string | null;
    videoUrl: string | null;
    bytes: number;
    pesa: string;
    creadaEn: string;
    pedidaPor: string;
    /** Cuántos días le quedan antes de que se borre sola. */
    diasQueLeQuedan: number;
    transcripcion: string | null;
    resumen: string | null;
    /** Lo que costaría transcribirla, para decirlo ANTES de pulsar. */
    creditos: number;
    /** Por qué no se puede, cuando no se puede. `null` si se puede. */
    porQueNo: string | null;
};

function comoSeVeLaGrabacion(f: FilaDeGrabacion): GrabacionEnLaFicha {
    const bytes = f.audioBytes + f.videoBytes;
    const costo = costoDeLaNota(f.segundos);
    // El precio se enseña SIEMPRE, y el motivo por el que no se puede también:
    // un botón que gasta créditos sin decir cuántos es un cheque en blanco, y
    // uno que al pulsarlo da error es peor que no tenerlo.
    const que = queHacerConLaGrabacion({
        yaTranscrita: Boolean(f.transcripcion),
        audioBytes: f.audioBytes,
        costo,
        // Los créditos no se miran aquí: esta función pinta una lista y
        // preguntarlos por fila sería una consulta por grabación. Lo que sí se
        // resuelve es lo que no depende de ellos —sin audio, demasiado grande—,
        // y los créditos los comprueba la acción al pulsar.
        creditosDisponibles: null,
    });
    return {
        id: f.id,
        modo: f.modo,
        estado: f.estado,
        segundos: f.segundos,
        duracion: comoSeLeeLaDuracion(f.segundos || null),
        audioUrl: f.audioUrl,
        videoUrl: f.videoUrl,
        bytes,
        pesa: comoSeLeenLosBytes(bytes),
        creadaEn: f.creadaEn.toISOString(),
        pedidaPor: f.pedidaPorNombre,
        diasQueLeQuedan: diasQueLeQuedan(f.creadaEn),
        transcripcion: f.transcripcion,
        resumen: f.resumen,
        creditos: costo.creditos,
        porQueNo: porQueNoSeTranscribe(que),
    };
}

/**
 * Las grabaciones de unas cuantas reuniones, y cómo va el cupo de la cuenta.
 *
 * **Una consulta para todas las salas**, no una por fila: la pantalla de
 * Reuniones enseña hasta cien filas, y una consulta por cada una es
 * exactamente «muchas peticiones pequeñas son turno, no trabajo» por dentro.
 *
 * Y el cupo viaja en la misma vuelta porque se enseña en la misma pantalla: en
 * una acción aparte serían dos viajes para pintar una barra.
 */
export async function lasGrabacionesDeLasReunionesAction(
    salaIds: string[],
): Promise<
    Respuesta<{
        porSala: Record<string, GrabacionEnLaFicha[]>;
        cupo: { usados: number; tope: number; parte: number; cerca: boolean; texto: string };
        puedeGrabar: boolean;
    }>
> {
    try {
        const yo = await quien();
        if (!yo) return { success: false, message: "No autorizado." };

        const puedeGrabar = await laCuentaPuedeGrabar(yo.cuentaId);
        if (!puedeGrabar) {
            // Sin el módulo no hay nada que enseñar, y **se contesta bien**:
            // un «No autorizado» aquí pintaría un error rojo en una pantalla
            // que funciona perfectamente sin grabaciones.
            const vacio = comoVaElCupo(0);
            return {
                success: true,
                porSala: {},
                cupo: {
                    usados: 0,
                    tope: vacio.tope,
                    parte: 0,
                    cerca: false,
                    texto: comoSeLeenLosBytes(0),
                },
                puedeGrabar: false,
            };
        }

        const [mapa, usados] = await Promise.all([
            lasGrabacionesDeLasSalas(salaIds.slice(0, TOPE_DEL_HISTORICO)),
            loQueOcupanLasGrabaciones(yo.cuentaId),
        ]);

        const porSala: Record<string, GrabacionEnLaFicha[]> = {};
        for (const [salaId, filas] of mapa) {
            // La cuenta se vuelve a comprobar fila a fila: los ids de sala
            // llegan del navegador, y sin esto una lista a mano devolvería las
            // grabaciones de la reunión de otra cuenta.
            const mias = filas.filter((f) => f.cuentaId === yo.cuentaId);
            if (mias.length) porSala[salaId] = mias.map(comoSeVeLaGrabacion);
        }

        const cupo = comoVaElCupo(usados);
        return {
            success: true,
            porSala,
            cupo: {
                usados: cupo.usados,
                tope: cupo.tope,
                parte: cupo.parte,
                cerca: cupo.cerca,
                texto: `${comoSeLeenLosBytes(cupo.usados)} de ${comoSeLeenLosBytes(cupo.tope)}`,
            },
            puedeGrabar: true,
        };
    } catch (error) {
        console.warn("[reuniones] no se pudieron leer las grabaciones", error);
        return { success: false, message: "No se pudieron leer las grabaciones." };
    }
}
