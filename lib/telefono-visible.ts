import { fmtPhone } from "@/lib/whatsapp-jid";

/**
 * Quién puede ver el número de teléfono completo de un cliente.
 *
 * Los agentes no. Atienden desde la App —chatean, no marcan—, así que el número
 * no les hace falta para trabajar, y es justo lo que se lleva alguien que se va.
 *
 * `advisorRole` viene vacío para el dueño de la cuenta y vale "administrador"
 * para quien él haya puesto de confianza; solo "agente" queda tapado.
 */
export function puedeVerTelefonoCompleto(advisorRole?: string | null): boolean {
    if (!advisorRole) return true;
    return advisorRole === "administrador";
}

/**
 * El número tal y como debe verlo esta persona.
 *
 * Tapado se deja el principio —para poder distinguir un contacto de otro y
 * reconocer el país— y se cambian los cuatro últimos dígitos por XXXX, que es
 * la parte que sirve para volver a marcar.
 *
 *     +1 829 766 8081   ->   +1 829 766 XXXX
 *
 * SOBRE LO QUE ESTO PROTEGE Y LO QUE NO
 *
 * Esto es una cortina, no una caja fuerte. El número sigue viajando al navegador
 * porque ES el identificador de la conversación: la App lo usa para abrir el
 * chat y para enviar, y va hasta en la barra de direcciones. Alguien que sepa
 * abrir las herramientas del navegador lo saca.
 *
 * Lo que sí cierra es la salida en bloque, que es el caso real: copiar la lista
 * de la pantalla ya no sirve de nada, y la exportación se retiró aparte (ver
 * lib/exportaciones.ts). Llevarse la base entera deja de ser un rato y pasa a
 * ser un trabajo de días, de a un número por vez.
 */
export function telefonoParaMostrar(
    remoteJid: string | null | undefined,
    advisorRole?: string | null,
): string {
    const completo = fmtPhone(remoteJid);
    if (!completo) return completo;
    if (puedeVerTelefonoCompleto(advisorRole)) return completo;

    // Se cambian los cuatro ULTIMOS digitos, respetando los espacios del
    // formato: asi el numero conserva su forma y no parece roto.
    let restantes = 4;
    const tapado = completo
        .split("")
        .reverse()
        .map((caracter) => {
            if (restantes > 0 && /[0-9]/.test(caracter)) {
                restantes--;
                return "X";
            }
            return caracter;
        })
        .reverse()
        .join("");

    return tapado;
}
