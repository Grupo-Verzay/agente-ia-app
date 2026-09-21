/**
 * El filtro por RANGO DE FECHAS de la lista de Chats.
 *
 * Puro a propósito, como el resto de lo que decide algo en Chats
 * (`chat-preference-key`, `chat-session-match`): de aquí tira **lo que se
 * muestra** (`filtered`) y **lo que se cuenta** (`conteos`) en `chat-sidebar`,
 * y el banco. Que las dos usen la MISMA función es lo que hace cierto el
 * encargo «el conteo coincide con las filas mostradas»: no hay dos criterios
 * que puedan discrepar.
 *
 * # Por qué es cliente, como los demás filtros
 *
 * Todos los filtros de la bandeja —canal, «Sin leer», «En espera», etiquetas,
 * asesor— recortan la lista YA CARGADA en el navegador, no en el servidor. Este
 * va igual: recorta lo que hay cargado, y por eso el número que sale en «Todos»
 * es exactamente el de las filas que se ven. Lo que no esté cargado (una
 * conversación vieja más allá del tope de la bandeja) llega al bajar, como con
 * cualquier otro filtro.
 *
 * # Dos fechas, y por defecto la del INICIO
 *
 * - **`inicio`**: cuándo se inició la conversación. Es el valor por defecto —lo
 *   que se pregunta casi siempre es «los chats que entraron en tal semana»—.
 *   Viene de `SidebarContact.inicio` (el `createdAt` de la conversación/sesión,
 *   ver `chat-persistence`).
 * - **`actividad`**: la del último mensaje (`SidebarContact.ts`), que es la que
 *   ya se usa para ordenar. Se elige a mano cuando lo que interesa es «los que
 *   se movieron en tal rango».
 */

export type CampoDeFecha = "inicio" | "actividad";

/** El valor por defecto: la fecha en que se inició la conversación. */
export const CAMPO_DE_FECHA_POR_DEFECTO: CampoDeFecha = "inicio";

export function esCampoDeFecha(v: unknown): v is CampoDeFecha {
    return v === "inicio" || v === "actividad";
}

/** Hay rango si al menos uno de los dos extremos está puesto. */
export function hayRangoDeFechas(desde: string, hasta: string): boolean {
    return Boolean(desde) || Boolean(hasta);
}

/**
 * Los dos extremos del rango, en milisegundos.
 *
 * `desde` cuenta desde las **00:00:00.000** de su día y `hasta` hasta el
 * **23:59:59.999** del suyo, para que un rango de un solo día
 * (`desde === hasta`) incluya el día ENTERO —si `hasta` fuera a las 00:00, un
 * chat de esa tarde quedaría fuera y el filtro parecería no encontrar nada—. Un
 * extremo vacío no acota ese lado (`±Infinity`).
 *
 * Es la misma forma que ya usa el borrado por fecha (`contactosEnElRango`):
 * `new Date(\`${dia}T…\`)` se interpreta en la zona de quien mira, que es lo
 * correcto —elige días de su calendario— y se compara contra marcas absolutas.
 */
export function limitesDelRango(
    desde: string,
    hasta: string,
): { desdeMs: number; hastaMs: number } {
    const desdeMs = desde ? new Date(`${desde}T00:00:00.000`).getTime() : -Infinity;
    const hastaMs = hasta ? new Date(`${hasta}T23:59:59.999`).getTime() : Infinity;
    return { desdeMs, hastaMs };
}

/** La marca que decide, según el campo elegido. */
export function laFechaQueCuenta(c: { inicio: number; ts: number }, campo: CampoDeFecha): number {
    return campo === "inicio" ? c.inicio : c.ts;
}

/**
 * Los ATAJOS que rellenan Desde y Hasta de una vez: Hoy, Ayer, Últimos 7 días y
 * Últimos 30 días.
 *
 * El rótulo visible es corto —«7 días», «30 días»— para que los cuatro quepan en
 * una sola fila del panel (w-72) sin cortarse ni partirse en dos renglones; el
 * `titulo` lleva la forma larga para el tooltip. El id es el que compara
 * `atajoDelRango` y no depende del texto.
 */
export type AtajoDeRango = "hoy" | "ayer" | "ultimos7" | "ultimos30";

export const ATAJOS_DE_RANGO = [
    { id: "hoy", etiqueta: "Hoy", titulo: "Hoy" },
    { id: "ayer", etiqueta: "Ayer", titulo: "Ayer" },
    { id: "ultimos7", etiqueta: "7 días", titulo: "Últimos 7 días" },
    { id: "ultimos30", etiqueta: "30 días", titulo: "Últimos 30 días" },
] as const satisfies readonly { id: AtajoDeRango; etiqueta: string; titulo: string }[];

/**
 * Una fecha a `YYYY-MM-DD` en la zona de QUIEN MIRA (la de la cuenta), nunca en
 * UTC: se leen los componentes locales, igual que `elDiaDelInput` de
 * `lib/vencimiento`. Cortar sobre `toISOString()` correría el día una jornada al
 * oeste de UTC por la tarde —el fallo que este repo ya tiene documentado— y
 * «Hoy» saldría con el de mañana. Es la MISMA zona en la que `limitesDelRango`
 * interpreta después estos strings, así que el atajo y el filtro no discrepan.
 */
export function comoDiaLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dia}`;
}

/**
 * El rango `{ desde, hasta }` de un atajo, calculado desde `ahora`.
 *
 * Los «últimos N» INCLUYEN hoy: «Últimos 7 días» es hoy y los 6 anteriores. La
 * resta de días se hace construyendo la fecha en local (`new Date(y, m, d - n)`),
 * que normaliza el cruce de mes y de año sin tocar UTC.
 */
export function rangoDelAtajo(atajo: AtajoDeRango, ahora: Date): { desde: string; hasta: string } {
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const menos = (n: number) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - n);
    switch (atajo) {
        case "hoy":
            return { desde: comoDiaLocal(hoy), hasta: comoDiaLocal(hoy) };
        case "ayer": {
            const ayer = menos(1);
            return { desde: comoDiaLocal(ayer), hasta: comoDiaLocal(ayer) };
        }
        case "ultimos7":
            return { desde: comoDiaLocal(menos(6)), hasta: comoDiaLocal(hoy) };
        case "ultimos30":
            return { desde: comoDiaLocal(menos(29)), hasta: comoDiaLocal(hoy) };
    }
}

/**
 * Cuál de los cuatro atajos corresponde al rango puesto, o `null` si ninguno.
 *
 * Los cuatro rangos son distintos entre sí, así que el orden no decide nada. Un
 * rango escrito a mano que no case con ninguno devuelve `null` —ningún atajo
 * marcado—, y lo mismo el rango vacío tras «Limpiar»: apagar el rango apaga el
 * atajo sin ninguna rama aparte.
 */
export function atajoDelRango(desde: string, hasta: string, ahora: Date): AtajoDeRango | null {
    for (const { id } of ATAJOS_DE_RANGO) {
        const r = rangoDelAtajo(id, ahora);
        if (r.desde === desde && r.hasta === hasta) return id;
    }
    return null;
}

/**
 * Si un chat cae dentro del rango.
 *
 * Sin fecha utilizable (0) queda FUERA cuando hay rango: lo que no se puede
 * ubicar en el tiempo no se puede contar ni mostrar dentro de un rango, y
 * dejarlo pasar rompería «el conteo coincide con las filas mostradas». En la
 * práctica no ocurre —`inicio` cae al último mensaje si falta el `createdAt`,
 * ver `chat-sidebar`— pero la regla tiene que ser explícita.
 */
export function dentroDelRango(
    c: { inicio: number; ts: number },
    opts: { desdeMs: number; hastaMs: number; campo: CampoDeFecha },
): boolean {
    const v = laFechaQueCuenta(c, opts.campo);
    if (!v) return false;
    return v >= opts.desdeMs && v <= opts.hastaMs;
}
