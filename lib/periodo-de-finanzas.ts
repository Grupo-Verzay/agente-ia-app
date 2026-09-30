/**
 * El PERIODO que se mira en una lista de Finanzas: todo, un mes o un rango.
 *
 * Lo usan las tres pantallas que filtran por fecha —Ventas, Gastos y Cuentas—
 * con el MISMO botón (`FiltroDePeriodo`). Antes eran dos cosas distintas: Ventas
 * y Gastos llevaban un calendario que solo sabía de meses, y Cuentas una fila
 * propia de tres botones, dos campos y un «Aplicar» que no aplicaba nada. Tres
 * pantallas del mismo módulo, tres formas de decir «este mes».
 *
 * # Las fechas se comparan como TEXTO del día, nunca como instantes
 *
 * Un movimiento se guarda a medianoche UTC (`new Date("2026-07-01")`). Cuentas
 * comparaba contra `new Date("2026-07-01T00:00:00")`, que es medianoche LOCAL:
 * en Colombia eso son las 05:00 UTC, así que el movimiento del día 1 quedaba
 * fuera de su mes y el del día 1 del mes siguiente entraba. El saldo de «mes
 * actual» de cada cuenta estaba corrido un día, sin ningún error a la vista.
 *
 * Aquí todo se reduce a `AAAA-MM-DD` en UTC —la misma regla con la que las
 * tablas pintan la fecha— y se compara como texto: sin horas, sin zonas.
 *
 * Puro: lo usan las pantallas y el banco.
 */

export type ModoDePeriodo = "todo" | "mes" | "rango";

export type Periodo = {
    modo: ModoDePeriodo;
    /** `AAAA-MM`. Solo cuenta con `modo: "mes"`. */
    mes: string;
    /** `AAAA-MM-DD`. Solo cuentan con `modo: "rango"`. */
    desde: string;
    hasta: string;
};

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** El mes de hoy, `AAAA-MM`, en la zona de quien mira. */
export function elMesDeHoy(hoy: Date = new Date()): string {
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Hoy, `AAAA-MM-DD`, en la zona de quien mira: es la fecha con la que nace una
 * venta o un gasto nuevo. En UTC, a partir de las 7 de la tarde en Colombia ya
 * sería mañana, y el formulario propondría una fecha que no es la de hoy.
 */
export function elDiaDeHoy(hoy: Date = new Date()): string {
    return `${elMesDeHoy(hoy)}-${String(hoy.getDate()).padStart(2, "0")}`;
}

/**
 * La fecha con la que nace un movimiento nuevo: hoy, salvo que se esté mirando
 * OTRO mes, y entonces su día 1 —quien filtra julio y pulsa «Nuevo» está
 * apuntando algo de julio—.
 */
export function laFechaDeUnoNuevo(periodo: Periodo, hoy: Date = new Date()): string {
    if (periodo.modo === "mes" && periodo.mes !== elMesDeHoy(hoy) && MES.test(periodo.mes)) return `${periodo.mes}-01`;
    return elDiaDeHoy(hoy);
}

/** El primer y el último día de un mes `AAAA-MM`, en `AAAA-MM-DD`. */
export function losExtremosDelMes(mes: string): { desde: string; hasta: string } | null {
    if (!MES.test(mes)) return null;
    const [a, m] = mes.split("-").map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

/** Un periodo que mira todo, o un mes concreto si se pasa uno válido. */
export function unPeriodo(modo: ModoDePeriodo = "todo", mes?: string | null, hoy?: Date): Periodo {
    const elMes = mes && MES.test(mes) ? mes : elMesDeHoy(hoy);
    const extremos = losExtremosDelMes(elMes)!;
    return { modo, mes: elMes, desde: extremos.desde, hasta: extremos.hasta };
}

/**
 * El día `AAAA-MM-DD` de una fecha guardada. En UTC a propósito: es como se
 * guarda, y es como la pintan las tablas. Una fecha que no se entiende da `null`.
 */
export function elDiaDe(fecha: string | Date | null | undefined): string | null {
    if (!fecha) return null;
    if (typeof fecha === "string" && DIA.test(fecha)) return fecha;
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

/**
 * El rango que de verdad se aplica. Un rango con los extremos al revés se
 * ENDEREZA en vez de dar vacío: quien pone «hasta» antes que «desde» quiere
 * esos días, y una lista vacía sin explicación se lee como que no hay nada.
 * Un extremo que no es una fecha deja ese lado abierto.
 */
export function losLimitesDelPeriodo(periodo: Periodo): { desde: string | null; hasta: string | null } {
    if (periodo.modo === "todo") return { desde: null, hasta: null };
    if (periodo.modo === "mes") {
        const extremos = losExtremosDelMes(periodo.mes);
        return extremos ?? { desde: null, hasta: null };
    }
    const desde = DIA.test(periodo.desde) ? periodo.desde : null;
    const hasta = DIA.test(periodo.hasta) ? periodo.hasta : null;
    if (desde && hasta && desde > hasta) return { desde: hasta, hasta: desde };
    return { desde, hasta };
}

/** Si una fecha cae en el periodo. Los dos extremos cuentan. */
export function dentroDelPeriodo(fecha: string | Date | null | undefined, periodo: Periodo): boolean {
    if (periodo.modo === "todo") return true;
    const dia = elDiaDe(fecha);
    if (!dia) return false;
    const { desde, hasta } = losLimitesDelPeriodo(periodo);
    if (desde && dia < desde) return false;
    if (hasta && dia > hasta) return false;
    return true;
}

export function filtrarPorPeriodo<T>(filas: readonly T[], periodo: Periodo, fecha: (f: T) => string | Date | null | undefined): T[] {
    if (periodo.modo === "todo") return [...filas];
    return filas.filter((f) => dentroDelPeriodo(fecha(f), periodo));
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function diaCorto(dia: string): string {
    const [, m, d] = dia.split("-").map(Number);
    return `${d} ${MESES[m - 1].slice(0, 3)}`;
}

/**
 * Lo que dice el botón. Con `todo`, `queSon` («Todas», «Todo»): el botón nunca
 * sale mudo, porque un filtro que no dice qué filtra obliga a abrirlo para
 * saber qué se está mirando.
 */
export function elRotuloDelPeriodo(periodo: Periodo, queSon = "Todo"): string {
    if (periodo.modo === "todo") return queSon;
    if (periodo.modo === "mes") {
        const extremos = losExtremosDelMes(periodo.mes);
        if (!extremos) return queSon;
        const [a, m] = periodo.mes.split("-").map(Number);
        return `${MESES[m - 1]} ${a}`;
    }
    const { desde, hasta } = losLimitesDelPeriodo(periodo);
    if (desde && hasta) return `${diaCorto(desde)} – ${diaCorto(hasta)}`;
    if (desde) return `Desde ${diaCorto(desde)}`;
    if (hasta) return `Hasta ${diaCorto(hasta)}`;
    return queSon;
}

/**
 * El mismo mes, `delta` años antes o después (`"2026-09"`, -1 → `"2025-09"`).
 * El resumen anual solo enseña los doce meses de UN año y pulsar uno cambia de
 * mes, no de año: sin esto, mirar el diciembre pasado solo se podía escribiendo
 * la dirección a mano. Un mes que no se entiende devuelve `null`: un enlace a
 * «NaN-09» se abriría en el mes de hoy sin decir por qué.
 */
export function elMesDeOtroAno(mes: string, delta: number): string | null {
    const m = /^(\d{4})-(\d{2})$/.exec(mes);
    if (!m || !Number.isInteger(delta)) return null;
    const ano = Number(m[1]) + delta;
    if (ano < 1 || ano > 9999) return null;
    return `${String(ano).padStart(4, "0")}-${m[2]}`;
}
