import { SERVER_TIME_ZONE } from "./utils";

/**
 * Actividad del equipo: dónde pasa su jornada cada persona y qué hizo en ella.
 *
 * Todo lo de este fichero es **puro** —entran datos y salen datos, sin base y
 * sin navegador— para poder probar en el banco lo único que de verdad decide si
 * la pantalla dice la verdad: cuándo se cuenta un segundo y cuándo no.
 *
 * ## La decisión de fondo: una FILA ES UN CUBO, no un latido
 *
 * La forma evidente de medir tiempo es un latido cada N segundos, una fila por
 * latido. Con 250 personas y jornadas de 8 horas eso son **240.000 filas al
 * día** —87 millones al año— para contar una cosa que cabe en un número.
 *
 * Aquí el navegador **acumula** y manda su total cada minuto; el servidor
 * guarda un cubo por `(persona, día, sección, pestaña)`. Una persona que se
 * pasa el día en Chats deja **una fila**, no novecientas. El mismo dato, 160
 * veces menos filas.
 *
 * Y de ahí sale, gratis, lo que contesta a «¿y si cierra el navegador de
 * golpe?»: **no hay ninguna fila abierta que cerrar.** Modelado como «entró a
 * las 9, salió a las 18» haría falta un evento de salida, y el día que no
 * llegue —un cierre a lo bruto, un corte de luz— esa fila se queda abierta y la
 * persona aparece con catorce horas. Un cubo no tiene estado abierto: lo que se
 * perdió es la cola, como mucho un envío.
 */

/* ────────────────────────────── Las secciones ───────────────────────────── */

/**
 * Dónde puede estar alguien. La lista es **cerrada**: lo que no encaje cae en
 * `otras`, y no se inventa una sección con el primer trozo de la URL — eso
 * llenaría la pantalla de columnas que nadie sabe de dónde salieron, que es el
 * mismo fallo que ya costó caro con el tipo de trabajo de una tarea.
 */
export const SECCIONES = [
    "chats",
    "tickets",
    "proyectos",
    "cobros",
    "clientes",
    "panel",
    "otras",
] as const;

export type Seccion = (typeof SECCIONES)[number];

export const NOMBRE_DE_SECCION: Record<Seccion, string> = {
    chats: "Chats",
    tickets: "Tickets",
    proyectos: "Proyectos",
    cobros: "Cobros",
    clientes: "Clientes",
    panel: "Panel",
    otras: "Otras",
};

/**
 * De una ruta a su sección.
 *
 * El orden importa: `/panel/clientes` es **Clientes**, no Panel. Se mira lo más
 * específico primero, porque al revés el prefijo `/panel` se lo comería todo y
 * la columna de Clientes saldría siempre en cero sin que nada fallara.
 */
const RUTAS: Array<{ empiezaPor: string; seccion: Seccion }> = [
    { empiezaPor: "/panel/clientes", seccion: "clientes" },
    { empiezaPor: "/panel/client-billing", seccion: "clientes" },
    { empiezaPor: "/chats", seccion: "chats" },
    { empiezaPor: "/tickets", seccion: "tickets" },
    { empiezaPor: "/mis-tickets", seccion: "tickets" },
    { empiezaPor: "/proyectos", seccion: "proyectos" },
    { empiezaPor: "/tareas", seccion: "proyectos" },
    { empiezaPor: "/cobros", seccion: "cobros" },
    { empiezaPor: "/clientes", seccion: "clientes" },
    { empiezaPor: "/equipo", seccion: "clientes" },
    { empiezaPor: "/panel", seccion: "panel" },
    { empiezaPor: "/admin", seccion: "panel" },
    { empiezaPor: "/client-panel", seccion: "panel" },
    { empiezaPor: "/reseller-panel", seccion: "panel" },
];

export function seccionDeLaRuta(ruta: string): Seccion {
    const limpia = (ruta || "").split("?")[0].split("#")[0];
    for (const r of RUTAS) {
        if (limpia === r.empiezaPor || limpia.startsWith(`${r.empiezaPor}/`)) {
            return r.seccion;
        }
    }
    return "otras";
}

/** Lo que llega del navegador pasa por la lista, siempre. */
export function comoSeccion(valor: unknown): Seccion | null {
    return (SECCIONES as readonly string[]).includes(valor as string)
        ? (valor as Seccion)
        : null;
}

/* ───────────────────────────── El tiempo que cuenta ─────────────────────── */

/** Cinco minutos sin tecla, clic ni movimiento. */
export const INACTIVIDAD_MS = 5 * 60 * 1000;

/**
 * Cada cuánto manda el navegador su total. **No es el pulso de la medida**: la
 * medida la lleva el navegador segundo a segundo y esto solo decide cada cuánto
 * viaja. Subirlo no mide peor, solo arriesga perder más cola en un cierre a lo
 * bruto; bajarlo no mide mejor, solo son más peticiones.
 */
export const CADA_CUANTO_SE_MANDA_MS = 60 * 1000;

/**
 * Lo máximo que se le cree a una pestaña por sección y día.
 *
 * **Se acota el ACUMULADO, no el incremento**, y el número es generoso a
 * propósito: lo que viaja es el total del día, así que un tope corto no recorta
 * un pico, **recorta la jornada entera**. La primera versión puso aquí quince
 * minutos —pensando en «un envío no puede traer más de un minuto de trabajo»— y
 * el banco lo cazó al primer intento: ocho horas repartidas en seis secciones
 * salían como **90 minutos**, seis topes de 900 s, sin un solo error. Un tope
 * mal colocado no se ve como un fallo; se ve como un equipo que no trabaja.
 *
 * Dieciséis horas es lo que no puede ser cierto de ninguna manera. Lo que
 * protege de un reloj que salta —el portátil que despierta de suspensión— es
 * `MAXIMO_POR_VUELTA_MS`, que va en el navegador, que es quien sabe cuánto
 * duraba su propia vuelta.
 */
export const TOPE_POR_SECCION_Y_DIA_S = 16 * 3600;

/**
 * Lo que el navegador se acredita como mucho en una vuelta de su reloj.
 *
 * Aquí sí es un incremento, y por eso aquí sí va corto: la vuelta dura un par
 * de segundos, así que un salto de horas solo puede venir de una suspensión o
 * de un cambio de hora, y en los dos casos ese rato **no se trabajó**. Sin
 * esto, abrir el portátil por la mañana le regalaría a alguien la noche entera.
 */
export const MAXIMO_POR_VUELTA_MS = 10 * 1000;

/**
 * ¿Cuenta este trozo de tiempo?
 *
 * Las tres condiciones van juntas a propósito, y **ninguna sobra**:
 *
 * - **Visible.** Una pestaña de fondo no es la jornada de nadie.
 * - **Con actividad reciente.** Cinco minutos mirando la pantalla sin tocar
 *   nada no son cinco minutos de trabajo.
 * - **Y es la pestaña que manda.** Ver abajo: sin esto, dos pestañas abiertas
 *   cuentan el mismo minuto dos veces y el día sale de dieciséis horas.
 */
export function cuentaEsteRato(estado: {
    visible: boolean;
    ultimoToqueMs: number;
    ahoraMs: number;
    mandaEstaPestana: boolean;
}): boolean {
    if (!estado.visible) return false;
    if (!estado.mandaEstaPestana) return false;
    return estado.ahoraMs - estado.ultimoToqueMs < INACTIVIDAD_MS;
}

/* ──────────────────────── Cuál de las pestañas cuenta ───────────────────── */

/**
 * Cuánto vale una reclamación de mando antes de darla por muerta. Si la pestaña
 * que mandaba desaparece —se cierra, se cuelga—, otra toma el relevo pasado
 * este rato. Corto a propósito: es el hueco en el que nadie cuenta.
 */
export const EL_MANDO_CADUCA_MS = 15 * 1000;

export type MandoDeLaPestana = {
    /** Qué pestaña manda. */
    pestanaId: string;
    /** Cuándo lo dijo por última vez. */
    desdeMs: number;
};

/**
 * ¿Manda esta pestaña?
 *
 * **Manda aquella donde la persona tocó algo la última vez.** Es una sola frase
 * y resuelve los dos problemas de golpe:
 *
 * 1. **No se cuenta dos veces.** Dos pestañas abiertas y visibles —una en Chats
 *    y otra en Proyectos, que es de lo más normal— acumularían las dos el mismo
 *    minuto. `document.visibilityState` no lo evita: en dos ventanas lado a
 *    lado las dos están «visible».
 * 2. **Y se atribuye a la sección correcta.** Un mando por orden de llegada
 *    dejaría contando a la pestaña de Chats mientras la persona trabaja en la
 *    de Proyectos. Siguiendo al último toque, el tiempo cae donde se está
 *    trabajando de verdad.
 *
 * Puro: quien lo llama le pasa lo que hay guardado y decide. Dónde se guarda
 * —`localStorage`, que es lo único compartido entre pestañas del mismo
 * navegador— es problema del que llama, y tiene que aguantar que no exista.
 */
export function mandaEstaPestana(
    yo: string,
    mando: MandoDeLaPestana | null,
    ahoraMs: number,
): boolean {
    if (!mando) return true; // Nadie lo ha reclamado: es mío.
    if (mando.pestanaId === yo) return true;
    // Otra lo tiene. Solo vale mientras esté fresco.
    return ahoraMs - mando.desdeMs > EL_MANDO_CADUCA_MS;
}

/* ────────────────────────────────── El día ──────────────────────────────── */

/**
 * El día de una jornada, en la zona del SERVIDOR y no en UTC.
 *
 * Es la misma función que sella el cierre de una tarea (`diaDelCierre`), y por
 * el mismo motivo: con UTC a secas, todo lo que se trabaje después de las siete
 * de la tarde en Colombia contaría en el día siguiente y una jornada de tarde
 * se partiría entre dos.
 *
 * Y lo decide el **servidor**, nunca el navegador: el reloj de una máquina
 * ajena no puede elegir en qué día cae el trabajo de alguien.
 */
export function diaDeLaJornada(fecha: Date): string {
    return fecha.toLocaleDateString("sv-SE", { timeZone: SERVER_TIME_ZONE });
}

/* ──────────────────────── Capa 2: lo que hizo la persona ────────────────── */

/**
 * Las acciones que se cuentan. Cerrada, como las secciones, y por lo mismo: un
 * tipo inventado saldría en el reparto como una columna que nadie pidió.
 */
export const TIPOS_DE_ACCION = [
    "chat_atendido",
    "mensaje_enviado",
    "ticket_creado",
    "ticket_cerrado",
    "tarea_movida",
    "cobro_enviado",
    "seguimiento_hecho",
    "cliente_tocado",
] as const;

export type TipoDeAccion = (typeof TIPOS_DE_ACCION)[number];

export const NOMBRE_DE_ACCION: Record<TipoDeAccion, string> = {
    chat_atendido: "Chats atendidos",
    mensaje_enviado: "Mensajes enviados",
    ticket_creado: "Tickets creados",
    ticket_cerrado: "Tickets cerrados",
    tarea_movida: "Tareas movidas",
    cobro_enviado: "Cobros enviados",
    seguimiento_hecho: "Seguimientos",
    cliente_tocado: "Clientes tocados",
};

export function comoTipoDeAccion(valor: unknown): TipoDeAccion | null {
    return (TIPOS_DE_ACCION as readonly string[]).includes(valor as string)
        ? (valor as TipoDeAccion)
        : null;
}

/* ───────────────── Capa 3: el desenlace, que todavía no se enseña ───────── */

/**
 * Cómo acabó una acción. Se **guarda desde el primer día** y no se pinta: sin
 * meses de datos detrás, un porcentaje de hoy contra nada no dice nada. El día
 * que haya con qué comparar, el dato ya está; empezar a guardarlo ese día sería
 * empezar de cero justo cuando hace falta.
 */
export const DESENLACES = [
    "cerrado",
    "contestado",
    "pagado",
    "sin_respuesta",
    "descartado",
] as const;

export type Desenlace = (typeof DESENLACES)[number];

export function comoDesenlace(valor: unknown): Desenlace | null {
    return (DESENLACES as readonly string[]).includes(valor as string)
        ? (valor as Desenlace)
        : null;
}

/* ─────────────────────────── Lo que viaja y lo que sale ─────────────────── */

/** Un trozo de jornada, tal y como lo manda el navegador. */
export type TrozoDeJornada = {
    seccion: Seccion;
    /** El TOTAL acumulado por esta pestaña en esta sección, no el incremento. */
    segundos: number;
};

export type EnvioDeJornada = {
    pestanaId: string;
    trozos: TrozoDeJornada[];
};

/** Hasta dónde se fía uno de un identificador que llega de fuera. */
const TOPE_DEL_ID = 64;

/**
 * Lo que llega del navegador no se guarda tal cual.
 *
 * Se descarta lo que no encaje en vez de rechazar el envío entero: un trozo con
 * una sección inventada no puede tirar los otros cinco, que son ciertos. Y los
 * segundos se acotan, porque **este número no puede ser una opinión del
 * navegador**: sin tope, alguien llamando a la ruta a mano escribe una jornada
 * de cuarenta horas y el total de esa persona deja de significar nada para
 * siempre.
 *
 * El tope es el del DÍA (`TOPE_POR_SECCION_Y_DIA_S`) y no el de un envío,
 * porque lo que llega es el acumulado. Ver el comentario de esa constante: con
 * un tope de envío aquí, la jornada sale recortada y nada lo dice.
 */
export function comoEnvioDeJornada(valor: unknown): EnvioDeJornada | null {
    if (!valor || typeof valor !== "object") return null;
    const v = valor as { pestanaId?: unknown; trozos?: unknown };

    const pestanaId = String(v.pestanaId ?? "").trim().slice(0, TOPE_DEL_ID);
    if (!pestanaId) return null;
    if (!Array.isArray(v.trozos)) return null;

    const vistas = new Set<Seccion>();
    const trozos: TrozoDeJornada[] = [];
    for (const crudo of v.trozos.slice(0, SECCIONES.length)) {
        if (!crudo || typeof crudo !== "object") continue;
        const c = crudo as { seccion?: unknown; segundos?: unknown };
        const seccion = comoSeccion(c.seccion);
        if (!seccion || vistas.has(seccion)) continue;

        // `Number(null)` es 0, no `NaN`: lo que no sea un número de verdad se
        // descarta a mano antes de convertir, que es la regla que ya costó un
        // caso del banco en los días de gracia de Cobros.
        if (typeof c.segundos !== "number" || !Number.isFinite(c.segundos)) continue;
        const segundos = Math.min(Math.floor(c.segundos), TOPE_POR_SECCION_Y_DIA_S);
        if (segundos <= 0) continue;

        vistas.add(seccion);
        trozos.push({ seccion, segundos });
    }

    return trozos.length > 0 ? { pestanaId, trozos } : null;
}

/* ─────────────────────────────── Lo que se pinta ────────────────────────── */

export type JornadaDeUnaPersona = {
    personaId: string;
    personaNombre: string | null;
    /** Segundos por sección, ya sumados. */
    porSeccion: Record<Seccion, number>;
    /** El total, que es la suma de lo anterior. */
    segundos: number;
    /** Qué hizo, por tipo. */
    acciones: Record<TipoDeAccion, number>;
};

/** Segundos a «3 h 20 min». Lo que se lee, no lo que se guarda. */
export function comoRato(segundos: number): string {
    const s = Math.max(0, Math.floor(segundos));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h === 0 && m === 0) return s > 0 ? "menos de 1 min" : "—";
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
}

/** Un cubo vacío de cada clase, para que la pantalla no tenga que preguntar. */
export function seccionesEnCero(): Record<Seccion, number> {
    return Object.fromEntries(SECCIONES.map((s) => [s, 0])) as Record<Seccion, number>;
}

export function accionesEnCero(): Record<TipoDeAccion, number> {
    return Object.fromEntries(TIPOS_DE_ACCION.map((t) => [t, 0])) as Record<
        TipoDeAccion,
        number
    >;
}
