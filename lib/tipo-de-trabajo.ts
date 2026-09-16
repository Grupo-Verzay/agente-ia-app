/**
 * Tipo de trabajo de una tarea: montaje o soporte.
 *
 * ## No es `Task.type`, y no puede serlo
 *
 * `tasks` ya tiene una columna `type` —Seguimiento, Llamada, Reunión, Email,
 * Tarea, más los tipos que cada cuenta se invente— y parece el sitio. No lo es,
 * por dos motivos:
 *
 * 1. **Son dos preguntas distintas.** `type` dice *qué clase de gestión es*;
 *    esto dice *para qué*. Una llamada puede ser de montaje o de soporte, y
 *    metiéndolo todo en una columna se pierde una de las dos.
 * 2. **`type` dispara automatizaciones.** `triggerTaskTypeAutomations` corre
 *    con cada tarea creada, y CRM › Reglas tiene un panel entero colgado de
 *    esos nombres. Una tarea de «montaje» empezaría a disparar —o a dejar de
 *    disparar— lo que esa cuenta tenga configurado, sin que nadie lo pidiera.
 *
 * Y encima `tasks` es del backend (#360). Así que vive en `task_work`, al lado
 * de la cuenta y de los minutos — que es justo lo que hay que cruzar para
 * contestar la pregunta: **cuánto cuesta entregar un cliente nuevo y cuánto
 * cuesta mantenerlo.**
 *
 * ## Es opcional, y el «sin tipo» se ENSEÑA
 *
 * Una tarea interna no es montaje ni soporte: no hay cliente que entregar ni
 * que mantener. Forzar a elegir uno metería ruido en la medida.
 *
 * Pero lo que no se rellena no se esconde: el reparto tiene su columna «Sin
 * tipo». Sin ella, dos cuentas con el mismo trabajo pueden salir con cifras
 * muy distintas solo porque en una se rellenó el campo y en la otra no, y eso
 * no se ve por ningún lado. Es la misma regla que las tareas internas del
 * reparto por cuenta: si no suma, se dice.
 */

export const TIPOS_DE_TRABAJO = ["montaje", "soporte"] as const;
export type TipoDeTrabajo = (typeof TIPOS_DE_TRABAJO)[number];

/** Lo que se lee en el desplegable y en el reparto. */
export const NOMBRE_DEL_TIPO: Record<TipoDeTrabajo, string> = {
    montaje: "Montaje",
    soporte: "Soporte",
};

/** Y lo que significa cada uno, para que no haya que preguntarlo. */
export const QUE_ES_CADA_TIPO: Record<TipoDeTrabajo, string> = {
    montaje: "Armar y entregar un cliente nuevo.",
    soporte: "Atender a uno que ya está funcionando.",
};

/**
 * Lo que llega de fuera solo vale si está en la lista.
 *
 * Se usa **en el servidor**, no solo al pintar el desplegable: una acción
 * recibe lo que le manden, y un valor inventado se quedaría guardado y saldría
 * en el reparto como una tercera columna que nadie sabe de dónde salió. Lo que
 * no encaja se guarda como `null`, que es «sin tipo» — el caso que ya existe y
 * que la pantalla sabe enseñar.
 */
export function comoTipoDeTrabajo(valor: unknown): TipoDeTrabajo | null {
    return TIPOS_DE_TRABAJO.includes(valor as TipoDeTrabajo)
        ? (valor as TipoDeTrabajo)
        : null;
}

/** Un cierre, ya con su tipo. Lo que se reparte. */
export type ConTipoYMinutos = {
    clienteId: string | null;
    clienteNombre: string | null;
    tipoDeTrabajo: TipoDeTrabajo | null;
    minutos: number;
};

export type CuentaConSusTipos = {
    id: string;
    nombre: string | null;
    montaje: { tareas: number; minutos: number };
    soporte: { tareas: number; minutos: number };
    sinTipo: { tareas: number; minutos: number };
    /** La suma de los tres. Es por lo que se ordena. */
    total: { tareas: number; minutos: number };
};

const vacio = () => ({ tareas: 0, minutos: 0 });

/**
 * Cuánto de montaje y cuánto de soporte lleva cada cuenta.
 *
 * Las tareas **sin cuenta no entran**: la pregunta es por cliente, y una tarea
 * interna no se le puede atribuir a ninguno. Eso ya lo decía el reparto por
 * cuenta y aquí vale igual.
 */
export function porCuentaYTipo(cierres: ConTipoYMinutos[]): CuentaConSusTipos[] {
    const mapa = new Map<string, CuentaConSusTipos>();

    for (const c of cierres) {
        if (!c.clienteId) continue;

        let fila = mapa.get(c.clienteId);
        if (!fila) {
            fila = {
                id: c.clienteId,
                nombre: c.clienteNombre,
                montaje: vacio(),
                soporte: vacio(),
                sinTipo: vacio(),
                total: vacio(),
            };
            mapa.set(c.clienteId, fila);
        }
        fila.nombre ??= c.clienteNombre;

        const casilla = c.tipoDeTrabajo ? fila[c.tipoDeTrabajo] : fila.sinTipo;
        casilla.tareas += 1;
        casilla.minutos += c.minutos;
        fila.total.tareas += 1;
        fila.total.minutos += c.minutos;
    }

    return [...mapa.values()].sort((a, b) => b.total.minutos - a.total.minutos);
}

/** Los totales de la plataforma: lo que se mira antes de bajar al detalle. */
export function totalesPorTipo(cierres: ConTipoYMinutos[]): {
    montaje: { tareas: number; minutos: number };
    soporte: { tareas: number; minutos: number };
    sinTipo: { tareas: number; minutos: number };
} {
    const totales = { montaje: vacio(), soporte: vacio(), sinTipo: vacio() };
    for (const c of cierres) {
        const casilla = c.tipoDeTrabajo ? totales[c.tipoDeTrabajo] : totales.sinTipo;
        casilla.tareas += 1;
        casilla.minutos += c.minutos;
    }
    return totales;
}
