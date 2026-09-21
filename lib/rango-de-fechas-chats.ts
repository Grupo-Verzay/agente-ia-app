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
