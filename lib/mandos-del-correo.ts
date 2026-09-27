/**
 * El COLOR de cada mando de la cabecera de un correo abierto.
 *
 * Iban todos en gris plano —la caja de `border-input bg-background`—, y en la
 * cabecera de una conversación de Chats cada mando lleva su familia de color:
 * el recordatorio ámbar, la cita violeta, los registros verde azulado, la
 * tarea pizarra. Puestas las dos cabeceras lado a lado, la de Correo se leía
 * apagada, como si sus botones estuvieran deshabilitados.
 *
 * > **Cada mando lleva el color de su EQUIVALENTE en Chats**, con la MISMA
 * > receta de caja —`border-X-300 bg-X-100 text-X-800 hover:bg-X-200`—:
 * >
 * > | mando | equivalente en Chats | familia |
 * > | --- | --- | --- |
 * > | Responder | el azul de enviar | azul |
 * > | Reenviar | «Enviar al equipo» (índigo) | índigo |
 * > | Marcar como no leído | la pastilla «Sin leer» | naranja |
 * > | Destacar | la estrella de la fila | ámbar |
 * > | Eliminar | «Eliminar chat» | rojo |
 * > | «⋯» | la caja de «Nueva tarea» | pizarra |
 *
 * Las clases van escritas ENTERAS: Tailwind solo genera lo que ve literal, y
 * un color compuesto en tiempo de ejecución no existiría en el CSS (la familia
 * de `removeConsole`: el build en verde y el botón sin color). Y por eso esto
 * vive en `lib/`, que `tailwind.config.ts` mira.
 */
export const MANDOS_DEL_CORREO = ["responder", "reenviar", "noLeido", "destacar", "eliminar", "mas"] as const;
export type MandoDelCorreo = (typeof MANDOS_DEL_CORREO)[number];

export const TONO_DEL_MANDO: Record<MandoDelCorreo, string> = {
    responder:
        "border-blue-300 bg-blue-100 text-blue-800 hover:bg-blue-200 hover:text-blue-900 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900",
    reenviar:
        "border-indigo-300 bg-indigo-100 text-indigo-800 hover:bg-indigo-200 hover:text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900",
    noLeido:
        "border-orange-300 bg-orange-100 text-orange-800 hover:bg-orange-200 hover:text-orange-900 dark:border-orange-700 dark:bg-orange-950/60 dark:text-orange-300 dark:hover:bg-orange-900",
    destacar:
        "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 hover:text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-900",
    eliminar:
        "border-red-300 bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-800 dark:border-red-700 dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-900",
    mas: "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
};

/**
 * La caja común de un mando, SIN color: el lado de 28 px lo pone
 * `CONTROL_DE_ICONO` y el color `TONO_DEL_MANDO`. `border` y no
 * `border-input`: el color del borde es del tono.
 */
export const CAJA_DEL_MANDO = "w-7 shrink-0 rounded-md border p-0";
