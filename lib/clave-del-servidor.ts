/**
 * La clave de un servidor de WhatsApp no viaja al navegador. Nunca.
 *
 * Hay dos clases de clave y las dos dan el mando entero de lo que abren:
 *
 * | | qué es | qué abre |
 * | --- | --- | --- |
 * | `ApiKey.key` | la clave GLOBAL de un servidor de Evolution | **todas** las líneas de todas las cuentas que viven en ese servidor |
 * | `Instancia.instanceId` (Evolution) | el token de una línea | esa línea: leer, mandar, desconectar |
 *
 * La primera la comparten decenas de cuentas —`ApiKey` tiene `users User[]`—,
 * así que el día que llega al navegador de UNA, esa persona manda sobre el
 * WhatsApp de todas las demás del servidor. Y llegaba por cinco sitios: la
 * página pública de agendar cita (a cualquiera, sin sesión), Recordatorios,
 * Campañas, Mensajes y la conversación abierta de Chats.
 *
 * > **La regla: lo que viaja al navegador lleva «hay servidor», nunca la
 * > clave; y la acción que necesita la clave la resuelve en el servidor a
 * > partir de la LÍNEA o de la CUENTA, después de comprobar que quien pide
 * > alcanza esa cuenta.** Lo que el navegador mande en `apikey`, `serverUrl` o
 * > `apiKeyData` se ignora: aceptarlo sería dejar que quien llama elija contra
 * > qué servidor y con qué clave habla el nuestro.
 *
 * Este módulo es puro —nada de base— para que la decisión se pueda probar sin
 * levantar nada. Quien lee la clave de verdad es `clave-del-servidor.server.ts`.
 */

/**
 * Un servidor tal y como puede viajar al navegador: se sabe que existe y cuál
 * es, pero no con qué se abre. Conserva la forma de `ApiKey` a propósito, para
 * que las pantallas que miran `apiKey ? … : «falta configurar»` sigan igual.
 */
export function sinLaClaveDelServidor<T extends { key?: string | null }>(servidor: T): T;
export function sinLaClaveDelServidor<T extends { key?: string | null }>(servidor: T | null | undefined): T | null;
export function sinLaClaveDelServidor<T extends { key?: string | null }>(servidor: T | null | undefined): T | null {
    if (!servidor) return null;
    return { ...servidor, key: "" };
}

/**
 * Una fila de `Reminders` o de `Seguimiento` sin su clave. Las dos guardan la
 * clave con la que el motor manda el mensaje (`apikey`), y las dos se pintan en
 * pantallas: la lista de recordatorios, la de campañas, el editor de un
 * seguimiento… y la página PÚBLICA de agendar, que recibía los recordatorios de
 * la agenda con su clave dentro.
 */
export function sinLaClaveDeLaFila<T extends { apikey?: string | null }>(fila: T): T;
export function sinLaClaveDeLaFila<T extends { apikey?: string | null }>(fila: T | null | undefined): T | null;
export function sinLaClaveDeLaFila<T extends { apikey?: string | null }>(fila: T | null | undefined): T | null {
    if (!fila) return null;
    if (!("apikey" in fila)) return fila;
    return { ...fila, apikey: null };
}

/**
 * El marcador de Chats: «esta línea habla con Evolution; la clave la pone el
 * servidor». Las pantallas de Chats usan `apiKeyData` como bandera —si está,
 * la línea es de Evolution y se piden cosas como la media de un mensaje—, así
 * que se conserva un objeto; lo que se quita es lo que tenía dentro.
 *
 * Vacío a propósito: `hasReadyContext` del servidor exige url Y clave, así que
 * con esto el contexto nunca se da por listo y se resuelve siempre allí.
 */
export const CLAVE_EN_EL_SERVIDOR: { url: string; key: string } = Object.freeze({ url: "", key: "" });

/**
 * La dirección con la que el motor habla con un servidor de Evolution. Las
 * filas la guardan con el esquema delante (`https://…`) y `ApiKey.url` sin él;
 * escrita en un sitio para que las dos formas no se separen.
 */
export function comoUrlDelServidor(url?: string | null): string {
    const limpia = String(url ?? "").trim().replace(/\/+$/, "");
    if (!limpia) return "";
    return /^https?:\/\//i.test(limpia) ? limpia : `https://${limpia}`;
}

/** ¿Lleva esto dentro alguna de las claves? Lo usa el banco para barrer respuestas. */
export function llevaAlgunaClave(valor: unknown, claves: string[]): boolean {
    const texto = JSON.stringify(valor ?? null);
    return claves.filter(Boolean).some((clave) => texto.includes(clave));
}
