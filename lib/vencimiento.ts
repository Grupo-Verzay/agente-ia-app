/**
 * El vencimiento de una tarjeta: qué color le toca, qué dice y si hay que
 * avisar. **Puro**, y uno solo para los dos tableros y para el runner.
 *
 * De aquí tiran cuatro sitios que tienen que decir exactamente lo mismo: la
 * tarjeta de Proyectos, la de Tickets, los dos filtros del tablero y el trabajo
 * diario que manda los avisos. Con la cuenta escrita en cada uno, el día que se
 * afine «mañana» se afina en uno y los demás se quedan atrás — y eso no se ve
 * como un error: se ve como una tarjeta en rojo que no avisó, o un aviso de algo
 * que en pantalla sale en gris.
 *
 * # Se compara por DÍA, no por instante
 *
 * Es lo que estaba mal y es la mitad que importa. Lo que había en Proyectos era:
 *
 * ```ts
 * const overdue = new Date(iso) < new Date();
 * ```
 *
 * O sea que una tarea **que vence hoy a las 18:00 salía en rojo a las 18:01**, y
 * a las 09:00 ya estaba en rojo si la hora guardada eran las 08:00. Un
 * vencimiento es un **día**: mientras quede día, no se ha pasado. Y al revés, lo
 * que venció ayer a las 23:59 está vencido a las 00:01 de hoy aunque falten
 * segundos de reloj.
 *
 * Por eso todo se reduce a **cuántos días naturales faltan**, y las tres
 * respuestas salen de ese número.
 *
 * # Y la zona horaria es la del NAVEGADOR a propósito
 *
 * `diasQueFaltan` compara días naturales con el reloj de quien mira, que es lo
 * que hace que «hoy» quiera decir hoy para esa persona. El runner corre en el
 * servidor y usa su zona, igual que `diaDelCierre` en el reparto del trabajo: es
 * la misma decisión ya tomada allí, y con UTC a secas todo lo que venza después
 * de las 7 de la tarde en Colombia se contaría al día siguiente.
 */

/** Los estados de un vencimiento, de menos a más urgente. */
export type EstadoDelVencimiento =
    /** No tiene fecha, o la tarjeta ya está terminada. */
    | "apagado"
    /** Falta más de un día. Neutro. */
    | "lejos"
    /** Vence hoy o mañana. Aviso. */
    | "pronto"
    /** Ya se pasó. Rojo. */
    | "vencida";

/**
 * Cuántos días naturales faltan: 0 es hoy, 1 mañana, −1 ayer.
 *
 * Las dos fechas se aplastan a medianoche **antes** de restar, así que la hora
 * no pinta nada. Restar en crudo y dividir por 86.400.000 no vale: entre las
 * 23:00 de hoy y las 01:00 de mañana hay dos horas, que redondeado a días da
 * cero, y eso es exactamente el fallo que se viene a quitar.
 */
export function diasQueFaltan(vence: Date, ahora: Date): number {
    const aMedianoche = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const MS_DE_UN_DIA = 24 * 60 * 60 * 1000;
    return Math.round((aMedianoche(vence) - aMedianoche(ahora)) / MS_DE_UN_DIA);
}

/**
 * Qué color le toca al distintivo.
 *
 * **`terminada` lo apaga, y eso es el encargo entero de esa palabra**: una
 * tarjeta cerrada no vence. Sin esa condición, la columna «Hecho» de un tablero
 * con un mes de historia sale entera en rojo y el rojo deja de significar nada —
 * que es la misma familia que *un aviso que sale siempre se aprende a despachar
 * sin leer*.
 *
 * Sin fecha tampoco hay distintivo: en Tickets el vencimiento es opcional de
 * verdad, y un hueco gris que diga «sin fecha» es ruido en una tarjeta que ya va
 * apretada.
 */
export function estadoDelVencimiento(input: {
    /** La fecha, en ISO. Nula cuando la tarjeta no tiene vencimiento. */
    vence: string | null | undefined;
    /** El reloj, por parámetro para que todas las tarjetas digan lo mismo. */
    ahora: number;
    /** Hecha, resuelta, descartada: lo que sea que cierre esa tarjeta. */
    terminada: boolean;
}): EstadoDelVencimiento {
    if (input.terminada) return "apagado";
    const dia = comoFecha(input.vence);
    if (!dia) return "apagado";

    const faltan = diasQueFaltan(dia, new Date(input.ahora));
    if (faltan < 0) return "vencida";
    if (faltan <= 1) return "pronto";
    return "lejos";
}

/**
 * Lo que se lee dentro del distintivo.
 *
 * «Hoy» y «Mañana» con la palabra y no con la fecha: son los dos días en los que
 * hay que hacer algo, y leer «19 sep» obliga a pensar qué día es hoy. Lo demás
 * va con la fecha corta, que es lo que ya se enseñaba.
 */
export function etiquetaDelVencimiento(
    vence: string | null | undefined,
    ahora: number,
): string {
    const dia = comoFecha(vence);
    if (!dia) return "";

    const faltan = diasQueFaltan(dia, new Date(ahora));
    if (faltan === 0) return "Hoy";
    if (faltan === 1) return "Mañana";
    if (faltan === -1) return "Ayer";
    const corta = dia.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
    return faltan < 0 ? `Venció ${corta}` : corta;
}

/**
 * Lo que un `<input type="date">` espera: `YYYY-MM-DD`, **en la zona de quien
 * mira**.
 *
 * `toISOString().slice(0, 10)` es la forma corta y está mal: pasa a UTC antes de
 * cortar, así que una fecha guardada el día 20 a las 19:00 en Colombia sale
 * como el **21**. El campo enseñaría un día distinto del que pinta el
 * distintivo de al lado, y abrir el ticket y volver a guardarlo sin tocar nada
 * le correría la fecha un día — cada vez.
 */
export function elDiaDelInput(vence: string | null | undefined): string {
    const d = comoFecha(vence);
    if (!d) return "";
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Los filtros del tablero. `todas` es no filtrar. */
export const FILTROS_DE_VENCIMIENTO = ["todas", "vencidas", "esta_semana"] as const;
export type FiltroDeVencimiento = (typeof FILTROS_DE_VENCIMIENTO)[number];

export const ETIQUETAS_DE_FILTRO: Record<FiltroDeVencimiento, string> = {
    todas: "Todas",
    vencidas: "Solo vencidas",
    esta_semana: "Vencen esta semana",
};

/** Lo que llega de fuera no se da por bueno: lo que no está en la lista, no es. */
export function comoFiltroDeVencimiento(valor: unknown): FiltroDeVencimiento {
    const texto = String(valor ?? "").trim();
    return (FILTROS_DE_VENCIMIENTO as readonly string[]).includes(texto)
        ? (texto as FiltroDeVencimiento)
        : "todas";
}

/**
 * Si una tarjeta pasa el filtro del tablero.
 *
 * Dos decisiones que conviene no deshacer:
 *
 * 1. **Una tarjeta terminada no pasa ningún filtro de vencimiento.** Su
 *    distintivo está apagado, así que dejarla dentro de «solo vencidas» sería
 *    enseñar una lista de urgencias con trabajo ya hecho dentro — y quien filtra
 *    por vencidas está buscando qué atender ahora.
 * 2. **«Esta semana» son los próximos siete días, e incluye lo vencido.** Lo que
 *    se pasó de fecha no deja de ser de esta semana el lunes siguiente, y
 *    escondérselo a quien pregunta «qué me vence» es justo el dato que iba a
 *    buscar. «Solo vencidas» sigue estando para mirarlo aparte.
 */
export function pasaElFiltro(input: {
    filtro: FiltroDeVencimiento;
    vence: string | null | undefined;
    ahora: number;
    terminada: boolean;
}): boolean {
    if (input.filtro === "todas") return true;

    const estado = estadoDelVencimiento(input);
    if (estado === "apagado") return false;
    if (input.filtro === "vencidas") return estado === "vencida";

    const dia = comoFecha(input.vence);
    if (!dia) return false;
    return diasQueFaltan(dia, new Date(input.ahora)) <= DIAS_DE_LA_SEMANA;
}

/** Siete días: «esta semana» contada desde hoy, no hasta el domingo. */
export const DIAS_DE_LA_SEMANA = 7;

/**
 * Los dos momentos en que se avisa.
 *
 * Dos y no más, y esto es lo que el encargo pedía a la letra: uno el día antes y
 * otro el mismo día. Insistir cada día a partir del vencimiento es lo que ya
 * costó una vuelta en los recordatorios de Cobros —«tres días exactos y no un
 * rango»— y acaba en avisos que se despachan sin leer.
 */
export const HITOS_DE_AVISO = ["vispera", "el_dia"] as const;
export type HitoDeAviso = (typeof HITOS_DE_AVISO)[number];

/**
 * Qué hito toca hoy, si es que toca alguno.
 *
 * Devuelve `null` en todo lo demás, **incluido lo ya vencido**: pasado el día no
 * hay nada que anticipar, y el distintivo rojo de la tarjeta ya lo está
 * diciendo. Avisar de una tarea vencida cada día es convertir la campanita en
 * ruido.
 */
export function elHitoDeHoy(vence: Date, ahora: Date): HitoDeAviso | null {
    const faltan = diasQueFaltan(vence, ahora);
    if (faltan === 1) return "vispera";
    if (faltan === 0) return "el_dia";
    return null;
}

/** Cómo se anuncia cada hito en la campanita. */
export function tituloDelVencimiento(hito: HitoDeAviso, que: string): string {
    return hito === "vispera" ? `Mañana vence «${que}»` : `Hoy vence «${que}»`;
}

/**
 * Una fecha de las que llegan: ISO, `Date` o nada.
 *
 * Se descarta una fecha inválida en vez de dejarla pasar: `new Date("lo que
 * sea")` da `Invalid Date`, y de ahí sale un `NaN` que en una comparación de
 * días contesta `false` a todo y pinta la tarjeta en gris sin decir por qué.
 */
function comoFecha(valor: string | null | undefined): Date | null {
    if (!valor) return null;
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
}
