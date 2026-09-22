/**
 * La entrada que se empaqueta para el banco de Llamadas.
 *
 * Existe por la misma razón que la de Documentación: el `currentUser()` de
 * mentira se inyecta con un alias de esbuild, así que queda **dentro** del
 * paquete. Importándolo aparte desde el banco se estaría moviendo otra copia
 * —otro módulo, otra variable— y `ponerAQuienMira` no tendría ningún efecto
 * sobre el código que corre. Reexportándolo desde aquí, el banco mueve la
 * misma.
 *
 * Lo que sale por aquí son **las acciones de verdad**: lo que este banco viene
 * a comprobar es que el diálogo del asistente de voz —y sus hermanas de CRM →
 * Llamadas— encuentran la línea de la cuenta con el proveedor que sea, no que
 * una consulta sepa leer una fila.
 */
export { ponerAQuienMira } from "./auth-de-llamadas";

export { getVoicebotConfig, setVoicebotConfig } from "@/actions/voicebot-actions";

export { setCallContactNameAction } from "@/actions/calls-crm-actions";

export {
    esLineaDeWhatsappQr,
    laLineaDeWhatsappDeLaCuenta,
    porQueNoHayLineaQr,
} from "@/lib/linea-de-whatsapp";

export { db } from "@/lib/db";
