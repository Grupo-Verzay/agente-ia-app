/**
 * Reuniones como módulo de una CUENTA, no como apéndice de un canal.
 *
 * Hasta ahora una sala nacía siempre dentro de un canal del chat de equipo:
 * `salas_de_video.canalId` era obligatorio y crear una exigía **pertenecer** a
 * ese canal. Eso ata Reuniones a que la cuenta tenga chat de equipo montado, y
 * deja fuera el caso más normal —«ábreme una sala para el cliente de las
 * tres»—, que no es de ningún canal.
 *
 * Ahora `canalId` es opcional y hay dos clases de sala, con **dos pertenencias
 * distintas**, que es lo que hace que esto no afloje nada de lo que ya había:
 *
 * | | de quién es | quién entra directo |
 * | --- | --- | --- |
 * | **con canal** | del canal | quien pertenece al canal — *igual que antes* |
 * | **sin canal** | de la cuenta | quien es de la cuenta |
 *
 * Y de ahí sale la regla que evita la fuga fácil de cometer:
 *
 * > **La lista por cuenta enseña SOLO las salas sin canal.** Si enseñara
 * > también las que nacieron en un canal, alguien de la cuenta que no está en
 * > ese canal las vería —y entraría— sin haber pertenecido nunca a él. Sería
 * > ensanchar la puerta del chat de equipo desde una pantalla que no habla de
 * > canales.
 *
 * Puro a propósito, como `lib/sala-de-video.ts`: de aquí tiran las acciones
 * —que son servidor—, la pantalla —que es cliente— y el banco.
 */

/* ─────────────────────────── Quién puede qué ─────────────────────────── */

/**
 * Lo que hace falta saber de quien pregunta.
 *
 * `cuentaId` es la **fila EFECTIVA** (`ownerId ?? id`), nunca la persona. Es la
 * regla de siempre —*un dato que se FIRMA va con la persona; un alcance se
 * pregunta a la fila efectiva*— y aquí no es un detalle: a una cuenta se llega
 * por **dos caminos** y solo uno deja rastro en la fila de quien entra.
 *
 * | cómo se llega a la cuenta | qué trae la fila efectiva |
 * | --- | --- |
 * | `owner_id` —alguien del equipo— | `ownerId` puesto: la cuenta es esa |
 * | `linked_accounts` —una cuenta vinculada— | **sin `ownerId`**: la cuenta es ella misma |
 *
 * Resolver aquí la persona en vez de la fila efectiva es exactamente lo que
 * rompió la cartera de clientes en el #783: por el segundo camino la fila de
 * quien entra no cuelga de nadie y no tiene `advisorRole`, así que preguntar
 * por la persona devolvía su propio id con rol `user` y el alcance salía vacío.
 */
export type QuienPregunta = {
    /** La PERSONA. Solo para firmar y para saber si es el anfitrión. */
    personaId: string;
    /** La cuenta EFECTIVA. Es lo que decide el alcance. */
    cuentaId: string;
    /** `canManageWorkspace`: dueño, `administrador` del equipo, o super admin. */
    manda: boolean;
};

/** Lo mínimo de una sala para decidir sobre ella. */
export type SalaParaDecidir = {
    cuentaId: string;
    canalId: string | null;
    anfitrionId: string;
};

/**
 * Quién puede ABRIR una reunión de la cuenta.
 *
 * **Participar basta: también un `agente`.** Es la decisión de esta etapa y
 * conviene que esté escrita con su motivo, porque lo cómodo habría sido pedir
 * `canManageWorkspace` y eso está mal por tres cosas:
 *
 * 1. **Sería quitarles algo que ya tienen.** Hoy cualquiera que pertenezca a un
 *    canal —agentes incluidos— abre reuniones ahí. Un módulo que «existe por sí
 *    solo» no puede ser un recorte de lo que ya se podía hacer.
 * 2. **Abrir una sala no gasta ni destruye nada.** Lo peor que produce es un
 *    enlace que deja **llamar a la puerta**; entrar lo decide alguien que ya
 *    está dentro. No es la clase de acción que este repositorio reserva a quien
 *    manda —repartir módulos, borrar cuentas, tocar la facturación—.
 * 3. **Es el mismo reparto de siempre**: *un `agente` participa, no manda*.
 *    Abrir su propia reunión es participar. Lo que no puede es tocar la de
 *    otro, y eso lo cierra `puedeAdministrarLaSala`.
 *
 * Lo único que se exige es tener cuenta resuelta. Que la sala caiga bajo SU
 * cuenta —y solo bajo la suya— es lo que hace que una cuenta cliente vea y cree
 * nada más que las propias.
 */
export function puedeAbrirUnaReunion(yo: QuienPregunta | null | undefined): boolean {
    return Boolean(yo?.cuentaId);
}

/**
 * Si una sala **sin canal** es de mi cuenta.
 *
 * Igualdad pelada contra la cuenta efectiva. Es el camino barato de
 * `esDeMiFamilia` —el caso de todos los días, una cuenta sin vinculadas—, y por
 * eso sigue existiendo aparte: quien solo tiene una cuenta no paga resolver
 * ninguna familia para ver sus reuniones.
 */
export function esDeMiCuenta(
    sala: Pick<SalaParaDecidir, "cuentaId">,
    miCuenta: string,
): boolean {
    const mia = (miCuenta ?? "").trim();
    return Boolean(mia) && sala.cuentaId === mia;
}

/**
 * Si una sala **sin canal** es de alguna cuenta de mi FAMILIA.
 *
 * Es lo que hace que `/reuniones` liste —y deje entrar a— las salas de todas
 * las cuentas alcanzables por la fila efectiva de quien mira: la madre ve las
 * de sus vinculadas, una hija las de la familia entera, y quien está fuera de
 * ella no ve ninguna. La malla ya viene resuelta por `laFamiliaDeLaCuenta`
 * (#812), así que aquí solo se compara contra el conjunto.
 *
 * **No contradice al chat de equipo.** Allí el hilo es uno y compartido; aquí
 * cada sala sigue colgando de una cuenta concreta y firmándose con la persona.
 * Lo único que la familia decide es el ALCANCE —quién la ve y quién puede
 * entrar—, que es la regla de siempre: *un dato se firma con la persona, un
 * alcance se pregunta a la fila efectiva*, y la familia es el alcance de esa
 * fila.
 */
export function esDeMiFamilia(
    sala: Pick<SalaParaDecidir, "cuentaId">,
    cuentasDeLaFamilia: readonly string[],
): boolean {
    const suya = (sala.cuentaId ?? "").trim();
    if (!suya) return false;
    return cuentasDeLaFamilia.some((c) => (c ?? "").trim() === suya);
}

/**
 * Cómo se resuelve la autoridad sobre una sala de OTRA cuenta de la familia.
 *
 * `cuentas` es la familia entera y `raiz` es quién manda en ella
 * (`laFamiliaDeLaCuenta`). Va opcional a propósito: la inmensa mayoría de las
 * salas son de la propia cuenta de quien mira, y ese caso se resuelve sin
 * resolver ninguna familia. Solo cuando la sala es de otra cuenta hace falta
 * saber si esa otra cuenta está en mi familia y si mando en ella.
 */
export type LaFamilia = { raiz: string; cuentas: readonly string[] };

/**
 * Quién puede REVOCAR el enlace, mover su caducidad, moderar o grabar.
 *
 * El anfitrión **y quien administra la cuenta DUEÑA de la sala**. Con la
 * familia por medio, «la cuenta dueña» puede no ser la propia de quien mira, y
 * ahí está la parte que no se puede aflojar:
 *
 * | la sala es de… | manda sobre ella |
 * | --- | --- |
 * | **mi propia cuenta** | yo, si administro mi cuenta (`yo.manda`) |
 * | **otra cuenta de la familia** | solo la **madre** (la raíz), que es quien administra la familia |
 *
 * Esa segunda fila es el reparto de siempre —el mismo que en Finanzas de la
 * familia: *manda quien es la cuenta MADRE de su familia*—. Un administrador de
 * una cuenta HIJA participa en las reuniones de una hermana, pero no las
 * modera: su rol es en su cuenta, no en la de al lado. Y por eso se pide
 * `familia.raiz === yo.cuentaId` y no solo `esDeMiFamilia`: sin ello, cualquier
 * administrador de la familia podría cortarle la reunión a cualquier otra
 * cuenta, que es justo lo que la puerta protege.
 *
 * Sin `familia`, solo se contesta por la propia cuenta —el camino barato—, que
 * es lo correcto cuando no se ha resuelto la familia: se ve de menos, nunca de
 * más.
 */
export function puedeAdministrarLaSala(
    sala: Pick<SalaParaDecidir, "anfitrionId" | "cuentaId">,
    yo: QuienPregunta | null | undefined,
    familia?: LaFamilia | null,
): boolean {
    if (!yo?.personaId) return false;
    if (sala.anfitrionId === yo.personaId) return true;
    if (!yo.manda) return false;
    // Mi propia cuenta: mi rol ahí es `yo.manda`.
    if (esDeMiCuenta(sala, yo.cuentaId)) return true;
    // Otra cuenta de la familia: solo la madre (la raíz) manda sobre ella.
    if (
        familia &&
        Boolean(familia.raiz) &&
        familia.raiz === yo.cuentaId &&
        esDeMiFamilia(sala, familia.cuentas)
    ) {
        return true;
    }
    return false;
}

/* ─────────────────────────── La caducidad ─────────────────────────── */

// Vive en `lib/sala-de-video.ts`, que es quien tiene `DURACIONES`:
// `cuandoCaducaAlCambiar` y `esUnaDuracion`. Escritas aquí habría que
// importarlas desde allí y este módulo dejaría de ser una isla — y una función
// que decide sobre una lista, escrita lejos de la lista, es la que se queda
// atrás el día que la lista cambie.

/* ─────────────────────────── El histórico ─────────────────────────── */

/**
 * Cuándo terminó una reunión, que NO es su `salidoEn`.
 *
 * Y esta es la parte que no se ve venir. `salidoEn` lo escriben dos caminos:
 * el botón de salir y el barrido de quien deja de latir. El segundo **lo corre
 * quien sigue dentro**, así que cuando la reunión acaba de la forma más normal
 * —todos cierran la pestaña a la vez— no queda nadie que lo escriba y las
 * últimas filas se quedan en `dentro` con su `salidoEn` en nulo **para
 * siempre**.
 *
 * Un histórico que midiera por `salidoEn` daría esas reuniones por abiertas y
 * sin duración. Lo que sí es de fiar es **el último latido** (`vistoEn`), que
 * se escribe en cada vuelta del reloj de la sala pase lo que pase.
 *
 * Así que el fin es `max(salidoEn, vistoEn)` de todos los participantes: el
 * `salidoEn` cuando lo hubo —es más exacto— y el último latido cuando no.
 */
export function cuandoTermino(
    participantes: Array<{ salidoEn: Date | string | null; vistoEn: Date | string | null }>,
): Date | null {
    let mayor: number | null = null;
    for (const p of participantes) {
        for (const marca of [p.salidoEn, p.vistoEn]) {
            const m = aMarca(marca);
            if (m !== null && (mayor === null || m > mayor)) mayor = m;
        }
    }
    return mayor === null ? null : new Date(mayor);
}

/**
 * Cuánto duró, en segundos, y `null` cuando no hay reunión que medir.
 *
 * Se cuenta desde que entró el PRIMERO, no desde que se creó la sala: entre
 * crear el enlace y que alguien entre pueden pasar días, y contarlo diría que
 * una reunión de diez minutos duró tres jornadas. Es lo mismo que ya hace la
 * llamada de voz, que cuenta desde que se contestó y no desde que se llamó.
 *
 * **Y una sala en la que no entró nadie no dura cero: no tiene duración.**
 * `null` y `0` son dos respuestas distintas —«no se usó» y «se usó un
 * instante»— y confundirlas es la familia de *un número que no se puede
 * calcular no se sustituye por otro*.
 */
export function cuantoDuro(
    entroElPrimero: Date | string | null,
    termino: Date | string | null,
): number | null {
    const desde = aMarca(entroElPrimero);
    const hasta = aMarca(termino);
    if (desde === null || hasta === null) return null;
    const segundos = Math.round((hasta - desde) / 1000);
    return segundos > 0 ? segundos : 0;
}

/** `1:04:09`, `7:20` o `0:08`. La misma forma que la duración de una llamada. */
export function comoSeLeeLaDuracion(segundos: number | null): string {
    if (segundos === null) return "—";
    const s = Math.max(0, Math.floor(segundos));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const dosCifras = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${dosCifras(m)}:${dosCifras(r)}` : `${m}:${dosCifras(r)}`;
}

function aMarca(v: Date | string | null | undefined): number | null {
    if (!v) return null;
    const m = v instanceof Date ? v.getTime() : Date.parse(String(v));
    return Number.isFinite(m) ? m : null;
}

/**
 * Cuántos días de histórico se enseñan.
 *
 * Es un tope de **lectura, no de borrado**: las filas se quedan. Ver la nota de
 * la poda en `lib/salas-de-video-db.ts`.
 */
export const DIAS_DE_HISTORICO = 90;

/** Cuántas reuniones trae una página del histórico. */
export const TOPE_DEL_HISTORICO = 100;
