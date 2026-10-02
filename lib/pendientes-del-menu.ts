/**
 * El numerito de pendientes junto a cada apartado del menú lateral.
 *
 * Puro y sin imports: lo prueba el banco sin levantar React, y lo usan el menú
 * (`components/nav-main.tsx`), la acción que cuenta en el servidor y la
 * pantalla de Recordatorios, que es donde vive la misma regla de «pendiente».
 *
 * # Qué lleva número, y qué NO
 *
 * Solo lo que tiene un concepto de «pendiente» que se atiende:
 *
 * | apartado | ruta | qué cuenta |
 * | --- | --- | --- |
 * | Chats | `/chats` | conversaciones sin leer (la pastilla «Sin leer») |
 * | Correos | `/correo` | correos sin leer en la bandeja de entrada |
 * | Agenda | `/schedule` | la pastilla «Pendiente» del tablero (todas sus cuentas) |
 * | Multiagenda | `/bookings` | la pastilla «Pendiente» de su tablero |
 * | Mis tareas | `/tareas` | tareas pendientes de hoy o vencidas |
 * | Recordatorios | `/reminders` | los del grupo «Pendientes» de lo que su LISTA enseña |
 *
 * **Llamadas no lleva**: es un registro de lo que ya pasó. Ni Leads, ni
 * Etiquetas, ni Campañas, ni nada más: ahí no hay nada «por atender», y un
 * número que no se atiende enseña a ignorar los que sí.
 *
 * El número va por la RUTA del apartado y no por su nombre: el nombre lo pone
 * quien arma los módulos y puede ser cualquiera («Bandeja › Chats», «Mis
 * chats»…). Así da igual en qué módulo lo agrupen: donde esté, lleva su número.
 */

/** Las seis claves de contador. Llamadas NO está, a propósito. */
export type ClaveDePendientes = "chats" | "correo" | "agenda" | "multiagenda" | "tareas" | "recordatorios";

/** La ruta de cada apartado que lleva número. Una ruta por clave. */
export const RUTA_DEL_CONTADOR: Record<ClaveDePendientes, string> = {
    chats: "/chats",
    correo: "/correo",
    agenda: "/schedule",
    multiagenda: "/bookings",
    tareas: "/tareas",
    recordatorios: "/reminders",
};

const CLAVE_DE_LA_RUTA: Record<string, ClaveDePendientes> = Object.fromEntries(
    Object.entries(RUTA_DEL_CONTADOR).map(([clave, ruta]) => [ruta, clave as ClaveDePendientes]),
);

/**
 * Qué contador corresponde a la ruta de un apartado, o `null` si no lleva.
 *
 * Solo la ruta EXACTA, sin consulta ni barra final: `/crm/llamadas` no es
 * `/chats`, y `/reuniones/grabaciones` no es `/reuniones`. Un prefijo le
 * pondría el número de Chats a cualquier pantalla que empezara igual.
 */
export function laClaveDeLaRuta(ruta: string | null | undefined): ClaveDePendientes | null {
    if (!ruta) return null;
    const limpia = ruta.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
    return CLAVE_DE_LA_RUTA[limpia] ?? null;
}

/** Lo que se sabe de cada contador. `null` = no se sabe: no se pinta nada. */
export type ConteosDelMenu = Partial<Record<ClaveDePendientes, number | null>>;

/**
 * El texto del numerito de una ruta, o `null` si no se pinta.
 *
 * Cero NO se pinta —«no hay nada pendiente» no merece un círculo rojo— y un
 * número que no se sabe tampoco: un `0` que se lee como un dato es peor que
 * nada. Por encima de 99 dice «99+», como la campanita y el favicon.
 */
export function elTextoDelContador(ruta: string | null | undefined, conteos: ConteosDelMenu): string | null {
    const clave = laClaveDeLaRuta(ruta);
    if (!clave) return null;
    const n = conteos[clave];
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
    return n > 99 ? "99+" : String(Math.floor(n));
}

/**
 * Qué contadores hay que PEDIR al servidor, según los apartados que el menú
 * enseña. Lo que la persona no tiene en su menú no se consulta: preguntarle a
 * Gmail por los correos de alguien que no tiene Correo es trabajo tirado en
 * cada vuelta del reloj.
 */
export function lasClavesDelMenu(rutas: (string | null | undefined)[]): Set<ClaveDePendientes> {
    const claves = new Set<ClaveDePendientes>();
    for (const r of rutas) {
        const c = laClaveDeLaRuta(r);
        if (c) claves.add(c);
    }
    return claves;
}

/**
 * La forma del numerito, UNA para todos los sitios donde sale —el apartado
 * suelto, el de dentro de un desplegable y el del menú flotante con la barra
 * plegada—. Es la que ya llevaban Chats y Mis tareas: rojo, 16 px de alto,
 * círculo cuando es una cifra.
 */
export const CLASE_DEL_CONTADOR =
    "flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm tabular-nums";

// ── Citas (Agenda y Multiagenda) ────────────────────────────────────────────

/**
 * El número de Agenda y de Multiagenda es EXACTAMENTE la pastilla «Pendiente»
 * de su pantalla: las citas en estado PENDIENTE que quedan por atender (su fin
 * no ha pasado; una de ayer sin cambiar de estado ya no cuenta), sacadas
 * de la misma consulta (`lib/citas-por-estado.server.ts`) y —en Agenda— de las
 * mismas cuentas que enseña el tablero (la propia y las que cuelgan de ella).
 *
 * Antes el menú contaba solo la cuenta propia y solo lo que no había pasado, y
 * la pantalla todas las cuentas y todas las fechas: el tablero decía «4
 * pendientes» y el menú no pintaba nada. Aquí se toma el número de la pantalla,
 * que es lo que la persona tiene delante al pulsar.
 */
export const ESTADO_DE_CITA_PENDIENTE = "PENDIENTE";

/** Las pendientes de un conteo por estado. Sin la fila, cero. */
export function lasPendientesDelConteo(conteo: readonly { status: string; count: number }[]): number {
    return conteo.find((c) => c.status === ESTADO_DE_CITA_PENDIENTE)?.count ?? 0;
}

// ── Recordatorios ───────────────────────────────────────────────────────────

/** Los grupos de la pantalla de Recordatorios. */
export type GrupoDelRecordatorio = "pending" | "today" | "tomorrow" | "recurring" | "sent" | "expired";

/** Lo mínimo de un recordatorio para saber en qué grupo cae. */
export type RecordatorioParaAgrupar = {
    repeatType?: string | null;
    /**
     * `true` son las plantillas de la pestaña Recordatorios de la AGENDA
     * («2 horas antes de la cita»): su hora es `hours-2`, no una fecha, y la
     * lista de Recordatorios no las enseña.
     */
    isSchedule?: boolean | null;
    sentAt?: Date | string | null;
    time?: string | null;
};

/** La hora de un recordatorio: ISO, o `dd/mm/aaaa hh:mm`. `null` si no se entiende. */
export function laHoraDelRecordatorio(time: string | null | undefined): number | null {
    if (!time) return null;
    // Primero la forma de la pantalla, `dd/MM/yyyy HH:mm`. Va ANTES que
    // `new Date(...)` porque el navegador lee «06/10/2026» como 10 de JUNIO
    // (mes/día): todo recordatorio de un día 1 a 12 caía en otra fecha, y uno de
    // la semana que viene salía en «Vencidos».
    const match = time.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (match) {
        const [, day, month, year, hours, minutes] = match;
        return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes)).getTime();
    }
    const direct = new Date(time);
    return Number.isNaN(direct.getTime()) ? null : direct.getTime();
}

/**
 * En qué grupo cae un recordatorio. Es la regla de la pantalla de
 * Recordatorios, movida aquí para que el número del menú sea EXACTAMENTE el de
 * su pastilla «Pendientes»: dos números distintos para lo mismo, uno al lado
 * del otro, se leen como un contador roto.
 */
export function elGrupoDelRecordatorio(
    r: RecordatorioParaAgrupar,
    ahora: number,
    manana: number,
    pasadoManana: number,
): GrupoDelRecordatorio {
    if (r.repeatType && r.repeatType !== "NONE") return "recurring";

    // Ya enviado → evidencia de "Enviado" (no "Vencido"), sin importar su hora.
    if (r.sentAt) return "sent";

    const timestamp = laHoraDelRecordatorio(r.time ?? null);
    if (timestamp === null || timestamp >= pasadoManana) return "pending";
    if (timestamp < ahora) return "expired";
    if (timestamp < manana) return "today";
    return "tomorrow";
}

/**
 * Los cortes de día que usa `elGrupoDelRecordatorio`, en la zona de QUIEN MIRA.
 *
 * La pantalla los calcula en el navegador; el menú los cuenta en el servidor,
 * que corre en otra zona. Sin el desfase del navegador (`getTimezoneOffset()`,
 * en minutos), un recordatorio de pasado mañana a las 2 de la madrugada caería
 * en un grupo en la pantalla y en otro en el menú. Sin desfase, la zona local.
 */
export function losCortesDelDia(ahora: Date = new Date(), desfaseMin?: number | null): { ahora: number; manana: number; pasadoManana: number } {
    const t = ahora.getTime();
    if (typeof desfaseMin === "number" && Number.isFinite(desfaseMin) && Math.abs(desfaseMin) <= 14 * 60) {
        const dia = 86_400_000;
        const local = t - desfaseMin * 60_000;
        const medianoche = Math.floor(local / dia) * dia + desfaseMin * 60_000;
        return { ahora: t, manana: medianoche + dia, pasadoManana: medianoche + 2 * dia };
    }
    const hoy = new Date(ahora);
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    const pasado = new Date(manana);
    pasado.setDate(pasado.getDate() + 1);
    return { ahora: t, manana: manana.getTime(), pasadoManana: pasado.getTime() };
}

/**
 * Si un recordatorio sale en la lista de Recordatorios. Las plantillas de la
 * Agenda (`isSchedule`) no: viven en la pestaña Recordatorios de `/schedule`.
 *
 * La usan la lista, sus pastillas y el número del menú. Antes las pastillas y
 * el menú contaban también las plantillas, y como su hora (`minutes-30`) no es
 * una fecha, caían en «Pendientes» o en «Vencidos»: la pantalla decía «No se
 * encontraron recordatorios» con un 1 en el menú y un 1 y un 2 en sus
 * pastillas.
 */
export function seVeEnLaListaDeRecordatorios(r: RecordatorioParaAgrupar): boolean {
    return r.isSchedule !== true;
}

/** Cuántos recordatorios de la LISTA caen en «Pendientes», con la regla de su pantalla. */
export function cuantosRecordatoriosPendientes(lista: RecordatorioParaAgrupar[], ahora: Date = new Date(), desfaseMin?: number | null): number {
    const c = losCortesDelDia(ahora, desfaseMin);
    return lista.filter((r) => seVeEnLaListaDeRecordatorios(r) && elGrupoDelRecordatorio(r, c.ahora, c.manana, c.pasadoManana) === "pending").length;
}
