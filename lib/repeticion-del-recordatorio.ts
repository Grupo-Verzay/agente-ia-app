/**
 * Cómo se REPITE un recordatorio: las opciones y lo que de verdad hace el motor
 * con cada una. Puro: lo usan el formulario, la tarjeta de la lista y la guía.
 *
 * El motor (`reminders-runner` del backend, `siguienteVez`) mueve la fecha
 * después de cada envío: un día, siete, un mes, un año, o al siguiente día de
 * lunes a viernes. **«Todos los días» (`EVERYDAY`) hace exactamente lo mismo que
 * «Cada día» (`DAILY`)**, así que no se ofrece: dos opciones para lo mismo hacen
 * dudar de cuál elegir. Se sigue leyendo, porque hay recordatorios guardados
 * con ella, y si uno la tiene puesta se ofrece para no cambiársela a escondidas.
 *
 * Tampoco hay «Repetir cada N»: el motor nunca leyó `repeatEvery`, así que un
 * «cada 3 días» se mandaba todos los días. El campo se quitó del formulario.
 */

export const REPETICIONES = [
    { value: "NONE", label: "No se repite" },
    { value: "DAILY", label: "Cada día" },
    { value: "WEEKLY", label: "Cada semana" },
    { value: "MONTHLY", label: "Cada mes" },
    { value: "YEARLY", label: "Cada año" },
    { value: "WEEKDAYS", label: "Días laborables (L-V)" },
    { value: "EVERYDAY", label: "Cada día" },
] as const;

export type Repeticion = (typeof REPETICIONES)[number]["value"];

/** Las opciones del desplegable: sin el duplicado, salvo que sea la que ya tiene. */
export function lasRepeticionesQueSeOfrecen(actual?: string | null) {
    return REPETICIONES.filter((r) => r.value !== "EVERYDAY" || actual === "EVERYDAY");
}

/** El nombre que enseña la tarjeta: «Único» si no se repite. */
export function elNombreDeLaRepeticion(valor?: string | null): string {
    if (!valor || valor === "NONE") return "Único";
    return REPETICIONES.find((r) => r.value === valor)?.label ?? "Recurrente";
}

/**
 * Cómo se LEE la hora de un envío en el historial. El motor guarda un instante
 * ISO (`2026-10-02T14:30:00.000Z`) y la pantalla lo pintaba tal cual, con su
 * «T» y su «Z». Se enseña como el resto de la pantalla, `dd/MM/yyyy HH:mm`, en
 * la zona de quien mira. Lo que no sea un ISO —el reloj de pared viejo— ya se
 * lee bien y se devuelve como está; vacío es «Sin fecha».
 */
export function laHoraDelEnvio(time: string | null | undefined, zona?: string): string {
    const t = (time ?? "").trim();
    if (!t) return "Sin fecha";
    if (!/^\d{4}-\d{2}-\d{2}T/.test(t)) return t;
    const fecha = new Date(t);
    if (Number.isNaN(fecha.getTime())) return t;
    const partes = new Intl.DateTimeFormat("es-CO", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
        ...(zona ? { timeZone: zona } : {}),
    }).formatToParts(fecha);
    const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
    return `${p("day")}/${p("month")}/${p("year")} ${p("hour") === "24" ? "00" : p("hour")}:${p("minute")}`;
}

/**
 * El mensaje que de verdad le llega al contacto: `@client_name` cambiado por su
 * nombre. Es la MISMA regla del motor (`reminders-runner`: el nombre del
 * contacto, y «Cliente» si no lo hay o es «Desconocido»).
 *
 * Hace falta aquí porque un recordatorio de un solo contacto lo entrega el
 * SEGUIMIENTO que se escribe al crearlo, y ese camino manda el texto tal cual:
 * el ejemplo del propio formulario («Hola @client_name, …») le llegaba al
 * cliente con la arroba dentro. Se cambia al escribir el seguimiento.
 */
export function elMensajeDelRecordatorio(texto: string, nombre?: string | null): string {
    const limpio = (nombre ?? "").trim();
    const quien = limpio && limpio.toLowerCase() !== "desconocido" ? limpio : "Cliente";
    return texto.replace(/@client_name/g, quien);
}
