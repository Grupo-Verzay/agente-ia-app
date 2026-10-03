/**
 * Las reglas de la pantalla Mis tareas (`/tareas`), puras: en qué grupo de la
 * lista cae una tarea, qué cuentan las cifras de la barra, los resultados
 * rápidos y los atajos de la siguiente tarea al completarla.
 *
 * Viven aquí y no dentro del componente por un motivo concreto: las cifras de
 * la barra y los grupos de la lista contestaban la MISMA pregunta —«¿está
 * vencida?»— con dos reglas distintas. La cifra miraba la HORA (vencida si ya
 * pasó) y la lista miraba el DÍA (vencida solo si es de ayer o antes), así que
 * una tarea de esta mañana contaba en «Vencidas» arriba y salía en «Hoy»
 * abajo: dos números que no cuadraban sin decir por qué. Una regla, una vez.
 *
 * Lo leen la pantalla, la guía pública (`lib/guia-tareas.ts`) y su banco.
 */

/** Los grupos de la vista Lista, en su orden. */
export const GRUPOS_DE_LA_LISTA = ["Vencidas", "Hoy", "Mañana", "Esta semana", "Más adelante", "Completadas"] as const;
export type GrupoDeLaLista = (typeof GRUPOS_DE_LA_LISTA)[number];

/** Las cifras de la barra, en su orden. */
export const CIFRAS_DE_LA_BARRA = ["Pendientes", "Vencidas", "Para hoy"] as const;

/** Las dos vistas, en su orden. */
export const VISTAS_DE_LA_PANTALLA = ["Lista", "Kanban"] as const;

/** Los resultados que se ponen de un clic al completar, en su orden. */
export const RESULTADOS_RAPIDOS = ["Contactado", "No respondió", "Reagendar", "Interesado", "Cerrado"] as const;

/** Los atajos de fecha de la siguiente tarea, en su orden. */
export const ATAJOS_DE_LA_SIGUIENTE = [
    { rotulo: "Mañana", dias: 1 },
    { rotulo: "Próxima semana", dias: 7 },
    { rotulo: "Próximo mes", dias: 30 },
] as const;

/** La hora a la que se propone una tarea nueva o la siguiente: las 9:00. */
export const HORA_POR_DEFECTO = 9;

type TareaMinima = { status: string; dueDate: string | Date };

const esAbierta = (status: string) => status === "pending" || status === "in_progress";

function inicioDelDia(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function masDias(d: Date, dias: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + dias);
    return r;
}

/**
 * En qué grupo de la lista cae una tarea. Una abierta cuya hora ya pasó está
 * VENCIDA, sea de ayer o de esta mañana: es lo que dice la cifra de arriba y
 * lo que pinta en rojo la propia tarjeta.
 */
export function elGrupoDeLaTarea(t: TareaMinima, ahora: Date = new Date()): GrupoDeLaLista | null {
    if (t.status === "done") return "Completadas";
    if (!esAbierta(t.status)) return null;
    const vence = new Date(t.dueDate);
    if (Number.isNaN(vence.getTime())) return "Más adelante";
    if (vence < ahora) return "Vencidas";
    const hoy = inicioDelDia(ahora);
    if (vence < masDias(hoy, 1)) return "Hoy";
    if (vence < masDias(hoy, 2)) return "Mañana";
    if (vence < masDias(hoy, 7)) return "Esta semana";
    return "Más adelante";
}

/** Las cifras de la barra. Salen de la MISMA regla que los grupos de la lista. */
export function lasCifras(tareas: readonly TareaMinima[], ahora: Date = new Date()) {
    let pendientes = 0;
    let vencidas = 0;
    let paraHoy = 0;
    let completadas = 0;
    for (const t of tareas) {
        const g = elGrupoDeLaTarea(t, ahora);
        if (g === "Completadas") completadas += 1;
        else if (g) {
            pendientes += 1;
            if (g === "Vencidas") vencidas += 1;
            if (g === "Hoy") paraHoy += 1;
        }
    }
    return { pendientes, vencidas, paraHoy, completadas };
}

/** Si una tarea abierta está vencida: la tarjeta la pinta en rojo. */
export function estaVencida(t: TareaMinima, ahora: Date = new Date()): boolean {
    return elGrupoDeLaTarea(t, ahora) === "Vencidas";
}

const dos = (n: number) => String(n).padStart(2, "0");

/**
 * Una fecha como la quiere un `<input type="datetime-local">`, en la hora de
 * QUIEN MIRA. `toISOString().slice(0, 16)` pasa antes a UTC, y en Colombia una
 * tarea propuesta a las 9:00 salía a las 14:00.
 */
export function comoFechaDelCampo(d: Date): string {
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** La fecha que se propone: dentro de `dias`, a las 9:00 de quien mira. */
export function laFechaPropuesta(dias: number, ahora: Date = new Date()): string {
    const d = masDias(ahora, dias);
    d.setHours(HORA_POR_DEFECTO, 0, 0, 0);
    return comoFechaDelCampo(d);
}

/** Lo que dice la lista cuando no hay nada que enseñar. Con una búsqueda, lo que se buscó. */
export function elMensajeDeLaListaVacia(busqueda: string): { titulo: string; detalle: string } {
    const q = busqueda.trim();
    if (q) return { titulo: "Ninguna tarea coincide", detalle: `No hay tareas con «${q}». Prueba con otra palabra.` };
    return { titulo: "Sin tareas pendientes", detalle: "Crea una con «Nuevo» o desde cualquier chat." };
}
