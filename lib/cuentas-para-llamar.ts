/**
 * **Por qué cuenta sale una llamada del marcador de CRM › Llamadas.**
 *
 * El marcador no está dentro de ninguna conversación, así que hasta ahora
 * llamaba siempre con la cuenta de quien mira. Ahora el diálogo ofrece un
 * «Vía:» con las cuentas que esa persona ALCANZA —la suya y las que cuelgan de
 * ella hacia abajo, las mismas del filtro del CRM (`resolverLasCuentasDelCrm`)—
 * y la elegida decide número, créditos y registro.
 *
 * # No se inventa un camino de llamada nuevo
 *
 * Todo el enrutado ya existe y va por LÍNEA: `laCuentaDeLaLlamada(instanceName)`
 * resuelve la cuenta dueña, la pasa por `assertCanAccessTargetUser` (que solo
 * baja) y usa SU `astraCallsSid`; `logOutgoingCallAction` escribe bajo esa
 * cuenta y la transcripción la paga el dueño de la fila. Así que elegir una
 * cuenta es pasarle su línea por QR a las dos llamadas de siempre. Dos caminos
 * —uno por línea y otro por cuenta— serían uno que se afina y otro que se
 * queda atrás.
 *
 * # La propia va SIN línea, a propósito
 *
 * Es lo que hacía el marcador antes (`origen: 'propia'`): así elegir la cuenta
 * propia —que es la preseleccionada— no cambia NADA de lo que ya pasaba, ni
 * siquiera para una cuenta con número y sin línea por QR.
 *
 * # Lo que no se puede elegir se ENSEÑA, con su motivo
 *
 * Una cuenta de abajo sin línea por QR no tiene por dónde enrutar la llamada, y
 * una sin número de llamadas no puede llamar. Esconderlas haría pensar que la
 * cuenta no existe; se ven apagadas y dicen por qué.
 */
export type CuentaQueLlama = {
    id: string;
    nombre: string;
    esLaPropia: boolean;
    /** La línea por QR de la cuenta, o `null` si no tiene. */
    lineaQr: string | null;
    /** Si la cuenta tiene número de llamadas (`astraCallsSid`). */
    tieneNumero: boolean;
};

export type OpcionDeLlamada = {
    id: string;
    nombre: string;
    esLaPropia: boolean;
    /** Lo que se pasa a las acciones de llamar. `null` = la cuenta de quien mira. */
    instanceName: string | null;
    motivo: string | null;
};

export const SIN_NUMERO = "Sin número de llamadas vinculado";
export const SIN_LINEA_QR = "Sin línea de WhatsApp por QR";

export function lasOpcionesDeLlamada(cuentas: readonly CuentaQueLlama[]): OpcionDeLlamada[] {
    return [...cuentas]
        .sort((a, b) => {
            if (a.esLaPropia !== b.esLaPropia) return a.esLaPropia ? -1 : 1;
            return a.nombre.localeCompare(b.nombre, "es");
        })
        .map((c) => {
            const instanceName = c.esLaPropia ? null : c.lineaQr;
            const motivo = !c.tieneNumero
                ? SIN_NUMERO
                : !c.esLaPropia && !c.lineaQr
                  ? SIN_LINEA_QR
                  : null;
            return { id: c.id, nombre: c.nombre, esLaPropia: c.esLaPropia, instanceName, motivo };
        });
}

/** La que viene elegida al abrir: la propia. Nunca una que no se puede usar si hay otra. */
export function laOpcionPorDefecto(opciones: readonly OpcionDeLlamada[]): string {
    return opciones.find((o) => o.esLaPropia)?.id ?? opciones.find((o) => !o.motivo)?.id ?? opciones[0]?.id ?? "";
}
