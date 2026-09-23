/**
 * La Agenda de una familia de cuentas: el tablero de la cuenta madre enseña sus
 * citas y las de las cuentas que cuelgan de ella, en una sola lista.
 *
 * # No es un mecanismo nuevo, y eso es a propósito
 *
 * Qué cuentas alcanza el tablero lo decide la MISMA puerta del CRM
 * (`resolverLasCuentasDelCrm` / `lasCuentasQueConsultaElCrm`): lo propio y lo
 * que cuelga HACIA ABAJO, nunca la madre ni las hermanas; la URL limpia
 * significa «todas»; un `agente` ve su cuenta y nada más. El filtro es el
 * mismo `SelectorDeCuentas` con las mismas props que CRM › Llamadas, y la marca
 * de cada cita es la misma `InsigniaDeLinea`. Dos formas de decir «qué cuentas
 * alcanza esta pantalla» son una que se afina y otra que se queda atrás.
 *
 * Lo que vive aquí es lo poco que es de la Agenda, y es puro.
 */

import { esDeOtraCuentaDelCrm } from "@/lib/crm-de-la-familia";

/**
 * Con qué se pinta la insignia «● Ventas» de una fila: la llave del color y el
 * nombre del que sale la palabra corta.
 *
 * Es **la regla de CRM › Llamadas, escrita una vez** y usada por las dos
 * pantallas: el color sale de la LÍNEA (el nombre crudo, que es la llave con
 * que lo pinta Chats) y, sin línea, del nombre de la cuenta; la palabra sale
 * del nombre de la cuenta y, sin él, de la línea. Con la regla copiada en cada
 * pantalla, la misma cuenta saldría de un color en Llamadas y de otro en
 * Agenda el día que se afine una de las dos.
 */
export function laInsigniaDeLaFila(
    linea: string | null | undefined,
    nombreDeLaCuenta: string | null | undefined,
): { clave: string; nombre: string } {
    const l = String(linea ?? "").trim();
    const n = String(nombreDeLaCuenta ?? "").trim();
    return { clave: l || n, nombre: n || l || "—" };
}

/**
 * ¿Es esta cita de otra cuenta que la desde la que se mira?
 *
 * Desde la madre, una cita de una hija **se ve y se le cambia el estado** —es
 * la misma cita, y el cambio se ve en las dos cuentas— pero **no se borra** ni
 * se crea: eso se queda en la cuenta dueña. Es la misma regla que las filas del
 * CRM (`esDeOtraCuentaDelCrm`), y sin dueño no es ajena.
 */
export function esCitaDeOtraCuenta(
    duenoDeLaCita: string | null | undefined,
    propia: string,
): boolean {
    return esDeOtraCuentaDelCrm(duenoDeLaCita, propia);
}

/**
 * Por qué línea sale el aviso de cambio de estado de una cita.
 *
 * **Sale de la cuenta DUEÑA de la cita, nunca de quien pulsa.** Antes el
 * calendario lo mandaba desde el navegador con la clave y la primera línea de
 * quien miraba: desde la madre, el aviso de una cita de su hija le habría
 * llegado al cliente desde el número de la madre.
 *
 * Por orden: la línea de la CONVERSACIÓN de la cita, si es de la dueña —es por
 * donde el cliente habló—; si no, la primera línea por QR de la dueña. Nunca
 * una línea de otra cuenta, y nunca un canal que no es WhatsApp por QR cuando
 * se cae al respaldo. Sin ninguna, `null`: no se manda, y se dice.
 */
export function laLineaDeLaNotificacionDeCita(args: {
    lineaDeLaConversacion: string | null | undefined;
    lineasDeLaDuena: readonly { instanceName: string | null; esQr: boolean }[];
}): string | null {
    const deLaConversacion = String(args.lineaDeLaConversacion ?? "").trim();
    const suyas = args.lineasDeLaDuena.filter((l) => String(l.instanceName ?? "").trim());
    if (deLaConversacion && suyas.some((l) => l.instanceName === deLaConversacion)) {
        return deLaConversacion;
    }
    const qr = suyas.find((l) => l.esQr);
    return qr ? String(qr.instanceName) : null;
}
