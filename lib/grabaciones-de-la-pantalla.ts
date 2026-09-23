/**
 * Las grabaciones de Reuniones, en su PROPIA pestaña.
 *
 * # Por qué salieron de la lista de reuniones
 *
 * Se pintaban dentro de la fila de su reunión, y esa fila es un `flex` en
 * línea (título, Entrar, copiar, «⋯»): el bloque de grabaciones caía como un
 * hijo más de esa fila y el `<video className="w-full">` se quedaba con todo el
 * ancho que sobraba. Con una sola grabación la fila medía lo que mide un video
 * a pantalla completa y empujaba las demás reuniones fuera de la vista.
 *
 * Y no era solo de medida: **son dos preguntas distintas**. Reuniones contesta
 * «¿a cuál entro?»; grabaciones, «¿qué veo de lo que ya pasó?». Mezcladas, cada
 * una estorba a la otra. Ahora van en pestañas separadas —Abiertas, Pasadas y
 * Grabaciones—, cada una con su contador.
 *
 * Lo que decide vive aquí, puro, para poder probarlo sin navegador ni base.
 */

/** Las tres pestañas de Reuniones, en su orden. */
export const VISTAS_DE_REUNIONES = ["abiertas", "pasadas", "grabaciones"] as const;
export type VistaDeReuniones = (typeof VISTAS_DE_REUNIONES)[number];

/** Lo mínimo de una reunión que la fila de una grabación necesita enseñar. */
export type ReunionDeLaGrabacion = {
    id: string;
    titulo: string | null;
    cuentaNombre: string | null;
};

/** Una grabación de la lista, con la reunión a la que pertenece al lado. */
export type ConSuReunion<G> = G & {
    salaId: string;
    reunionTitulo: string;
    cuentaNombre: string | null;
};

/**
 * Aplana `porSala` en una sola lista, con el título de su reunión dentro, y la
 * ordena de la más reciente a la más antigua.
 *
 * - **Una reunión que no está en la pantalla no se inventa**: su grabación sale
 *   igual —se grabó y es de esta cuenta—, con el título genérico. Tirarla sería
 *   un «mis grabaciones desaparecieron» sin explicación.
 * - **El orden es por `creadaEn`, no por el de las reuniones**: lo que se
 *   viene a buscar es lo último que se grabó, y una reunión abierta hace un mes
 *   con una grabación de hoy no puede quedar abajo del todo.
 * - A igualdad de hora manda el id, para que la lista no baile entre cargas.
 */
export function lasGrabacionesEnLista<G extends { id: string; creadaEn: string }>(
    porSala: Record<string, G[]>,
    reuniones: readonly ReunionDeLaGrabacion[],
): ConSuReunion<G>[] {
    const porId = new Map(reuniones.map((r) => [r.id, r]));
    const lista: ConSuReunion<G>[] = [];
    for (const [salaId, grabaciones] of Object.entries(porSala)) {
        const reunion = porId.get(salaId);
        for (const g of grabaciones) {
            lista.push({
                ...g,
                salaId,
                reunionTitulo: reunion?.titulo?.trim() || "Reunión",
                cuentaNombre: reunion?.cuentaNombre ?? null,
            });
        }
    }
    const cuando = (iso: string) => {
        const t = new Date(iso).getTime();
        return Number.isNaN(t) ? 0 : t;
    };
    return lista.sort((a, b) => cuando(b.creadaEn) - cuando(a.creadaEn) || a.id.localeCompare(b.id));
}

/**
 * Las filas de grabación que alcanza quien mira: las de su cuenta y las de las
 * cuentas que cuelgan de ella HACIA ABAJO (la misma puerta del CRM,
 * `lasCuentasQueConsultaElCrm`). Nunca las de la madre ni las de una hermana.
 *
 * Los ids de sala llegan del navegador, así que esta comprobación va **fila a
 * fila** y contra la cuenta de la GRABACIÓN: con una lista a mano no se leen
 * las de otra cuenta.
 */
export function lasQueAlcanza<F extends { cuentaId: string }>(
    filas: readonly F[],
    alcanzables: readonly string[],
): F[] {
    const puede = new Set(alcanzables);
    return filas.filter((f) => puede.has(f.cuentaId));
}
