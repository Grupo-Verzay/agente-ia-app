import type { FindMessagesResult } from "@/actions/chat-actions";

/**
 * Lo que comparten el navegador y la ruta de precarga.
 *
 * Vive aparte a proposito: son constantes y tipos, y un fichero `'use server'`
 * SOLO exporta funciones asincronas (ver CLAUDE.md). Y tenerlas en un solo
 * sitio evita el fallo clasico de estos pares -dos numeros distintos a cada
 * lado-, que aqui se veria como chats que se piden y no vuelven.
 */

/**
 * Cuanto espera el paquete entero antes de contestar con lo que tenga.
 *
 * **Por debajo del corte de Evolution** (`ESPERA_MAXIMA_DE_EVOLUTION`, 9 s en
 * `actions/chat-manual-actions.ts`), escalonados como el resto de plazos de
 * Chats. Si se igualaran, un solo chat lento se comeria el paquete entero y la
 * precarga tardaria mas que las cincuenta peticiones sueltas que vino a
 * sustituir.
 *
 * Lo que no llegue vuelve como `pendiente`, y **su trabajo sigue corriendo
 * detras**: lo que Evolution traiga se persiste igual, asi que la tanda
 * siguiente lo lee ya de nuestra base.
 */
export const PLAZO_DEL_PAQUETE_MS = 8000;

/**
 * Cuantos chats se atienden a la vez DENTRO de una peticion.
 *
 * El pool de Prisma es de 10 por proceso (`lib/db.ts`) y el proceso es uno.
 * Cincuenta consultas a la vez se comerian los turnos de la lista y del chat
 * abierto, que es justo lo que no puede pasar: son mensajes.
 */
export const A_LA_VEZ_DENTRO_DEL_SERVIDOR = 5;

/**
 * Tope de chats por paquete.
 *
 * Las dos tandas que existen son de 14 y de 50. El tope deja sitio de sobra y
 * cierra la puerta a que este cuerpo pida las conversaciones que quiera de una
 * sola vez.
 */
export const TOPE_DE_CHATS_POR_PAQUETE = 60;

/** Un contacto tiene cuatro identidades, no cuarenta. */
export const TOPE_DE_ALIAS_POR_CHAT = 24;

/**
 * Como vuelve cada chat del paquete. Los tres estados son distintos a
 * proposito:
 *
 * - `listo`: trae sus mensajes.
 * - `pendiente`: se acabo el plazo del paquete. **No es un fallo**: su trabajo
 *   sigue de fondo y la tanda siguiente lo recoge.
 * - `rechazado`: no se pudo, y dice por que. Ese chat se abrira por el camino
 *   normal al pulsarlo, como se abria antes de que existiera la precarga.
 */
export type ChatPrecargado =
  | {
      instanceName: string;
      remoteJid: string;
      estado: "listo";
      resultado: FindMessagesResult;
    }
  | { instanceName: string; remoteJid: string; estado: "pendiente" }
  | { instanceName: string; remoteJid: string; estado: "rechazado"; motivo: string };

export type RespuestaDePrecarga = {
  success: boolean;
  chats: ChatPrecargado[];
  tardoMs?: number;
  message?: string;
};
