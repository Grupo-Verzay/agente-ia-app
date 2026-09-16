/**
 * El tiempo que costó una tarea: en qué unidad se escribe y en cuál se guarda.
 *
 * ## Se guarda SIEMPRE en minutos
 *
 * La unidad es comodidad de quien escribe —«20 minutos», «3 horas», «2 días»—
 * pero guardar el par número+unidad haría imposible sumar: habría que convertir
 * en cada consulta y cualquier sitio que se olvidara sumaría peras con
 * manzanas. Entra en la unidad que se quiera y **se guarda un entero de
 * minutos**; la unidad no se guarda, se vuelve a elegir sola al enseñarlo.
 *
 * ## Un día son OCHO horas, no veinticuatro
 *
 * Es la decisión que más se puede malinterpretar, así que va escrita. Esto mide
 * **trabajo**, no tiempo de reloj: quien apunta «2 días» quiere decir dos
 * jornadas. Con 24 h por día, apuntar un solo día ya pasaría de las ocho horas
 * y el aviso saltaría siempre, que es tanto como no tenerlo.
 *
 * Y el número es el mismo que el del aviso a propósito: la jornada que define
 * «un día» y la que define «se pasó» tienen que ser la misma, o «1 día» se
 * marcaría por sí solo.
 */

import { SERVER_TIME_ZONE } from "./utils";
import type { TipoDeTrabajo } from "./tipo-de-trabajo";

export const UNIDADES_DE_TIEMPO = ["minutos", "horas", "dias"] as const;
export type UnidadDeTiempo = (typeof UNIDADES_DE_TIEMPO)[number];

/** Lo que se lee en el desplegable. Las mismas palabras que la agenda. */
export const NOMBRE_DE_LA_UNIDAD: Record<UnidadDeTiempo, string> = {
    minutos: "Minutos",
    horas: "Horas",
    dias: "Días",
};

/** Una jornada. Define «1 día» y también cuándo se marca el exceso. */
export const MINUTOS_DE_UNA_JORNADA = 8 * 60;

const EN_MINUTOS: Record<UnidadDeTiempo, number> = {
    minutos: 1,
    horas: 60,
    dias: MINUTOS_DE_UNA_JORNADA,
};

/**
 * Un tope, para que un dedazo no envenene las sumas.
 *
 * Sin él, teclear «800» con la unidad en días mete 320.000 minutos en la fila y
 * el total de esa persona deja de significar nada para siempre. Son 60 jornadas
 * seguidas: cualquier cosa por encima es un error de tecleo, no una tarea.
 */
export const TOPE_DE_MINUTOS = 60 * MINUTOS_DE_UNA_JORNADA;

/**
 * De lo que se escribió a lo que se guarda.
 *
 * Devuelve `null` cuando no hay un número usable, y quien llama **tiene que
 * mirarlo**: registrar el tiempo es obligatorio al cerrar, así que un `null`
 * es «no lo has puesto», no «cero».
 */
export function aMinutos(cantidad: number, unidad: UnidadDeTiempo): number | null {
    if (!Number.isFinite(cantidad) || cantidad <= 0) return null;
    const minutos = Math.round(cantidad * EN_MINUTOS[unidad]);
    if (minutos <= 0) return null;
    return Math.min(minutos, TOPE_DE_MINUTOS);
}

/**
 * De vuelta a algo que se lee.
 *
 * No reparte en días: por encima de una jornada sigue diciendo horas, porque
 * «14 h» se entiende y «1 día 6 h» obliga a saber cuánto dura el día de esta
 * pantalla. Los días son para escribir, no para leer.
 */
export function enPalabras(minutos: number): string {
    if (!Number.isFinite(minutos) || minutos <= 0) return "—";
    if (minutos < 60) return `${minutos} min`;
    const horas = minutos / 60;
    const redondeado = Math.round(horas * 10) / 10;
    return `${redondeado.toLocaleString("es", { maximumFractionDigits: 1 })} h`;
}

/**
 * El día al que pertenece un cierre, en la zona del servidor.
 *
 * Con UTC a secas, todo lo que se cierre después de las 7 de la tarde en
 * Colombia contaría en el día siguiente, y la regla de las ocho horas repartiría
 * mal una jornada de tarde. Se usa `sv-SE` porque su formato ya es `YYYY-MM-DD`
 * y no hay que recomponerlo a mano.
 */
export function diaDelCierre(fecha: Date): string {
    return fecha.toLocaleDateString("sv-SE", { timeZone: SERVER_TIME_ZONE });
}

/** Un cierre con tiempo registrado. Lo que devuelve la consulta. */
export type CierreConTiempo = {
    taskId: number;
    personaId: string;
    personaNombre: string | null;
    clienteId: string | null;
    clienteNombre: string | null;
    /** Montaje o soporte. `null` = sin tipo, que es un caso normal. */
    tipoDeTrabajo: TipoDeTrabajo | null;
    minutos: number;
    cerradaEn: string;
};

export type DiaDeUnaPersona = {
    personaId: string;
    personaNombre: string | null;
    dia: string;
    minutos: number;
    tareas: number;
    /** Pasó de la jornada. No bloquea nada; solo lo ve el administrador. */
    pasado: boolean;
};

export type TotalPorClave = {
    id: string;
    nombre: string | null;
    tareas: number;
    minutos: number;
};

/**
 * Los días en que alguien pasó de la jornada.
 *
 * Se agrupa por **persona y día**, no por tarea: el encargo es sobre la suma
 * del día. Una tarea de diez horas marca su día ella sola; cinco de dos horas
 * también, y ese segundo caso es justo el que no se ve mirando tarea a tarea.
 */
export function diasPorPersona(cierres: CierreConTiempo[]): DiaDeUnaPersona[] {
    const mapa = new Map<string, DiaDeUnaPersona>();

    for (const c of cierres) {
        const dia = diaDelCierre(new Date(c.cerradaEn));
        const llave = `${c.personaId}::${dia}`;
        const ya = mapa.get(llave);
        if (ya) {
            ya.minutos += c.minutos;
            ya.tareas += 1;
            // El nombre se completa con el primero que lo traiga: una fila
            // antigua puede haberlo perdido y no por eso deja de ser la persona.
            ya.personaNombre ??= c.personaNombre;
        } else {
            mapa.set(llave, {
                personaId: c.personaId,
                personaNombre: c.personaNombre,
                dia,
                minutos: c.minutos,
                tareas: 1,
                pasado: false,
            });
        }
    }

    const dias = [...mapa.values()];
    for (const d of dias) d.pasado = d.minutos > MINUTOS_DE_UNA_JORNADA;

    // Lo más reciente primero, y dentro del día el que más lleva.
    return dias.sort((a, b) => (a.dia === b.dia ? b.minutos - a.minutos : b.dia.localeCompare(a.dia)));
}

/** Cuánto lleva cada cuenta. Las tareas internas —sin cliente— no cuentan aquí. */
export function totalPorCliente(cierres: CierreConTiempo[]): TotalPorClave[] {
    return agrupar(
        cierres.filter((c) => c.clienteId),
        (c) => c.clienteId as string,
        (c) => c.clienteNombre,
    );
}

/** Cuánto lleva cada persona, en total. */
export function totalPorPersona(cierres: CierreConTiempo[]): TotalPorClave[] {
    return agrupar(cierres, (c) => c.personaId, (c) => c.personaNombre);
}

function agrupar(
    cierres: CierreConTiempo[],
    llaveDe: (c: CierreConTiempo) => string,
    nombreDe: (c: CierreConTiempo) => string | null,
): TotalPorClave[] {
    const mapa = new Map<string, TotalPorClave>();
    for (const c of cierres) {
        const id = llaveDe(c);
        const ya = mapa.get(id);
        if (ya) {
            ya.tareas += 1;
            ya.minutos += c.minutos;
            ya.nombre ??= nombreDe(c);
        } else {
            mapa.set(id, { id, nombre: nombreDe(c), tareas: 1, minutos: c.minutos });
        }
    }
    return [...mapa.values()].sort((a, b) => b.minutos - a.minutos);
}
