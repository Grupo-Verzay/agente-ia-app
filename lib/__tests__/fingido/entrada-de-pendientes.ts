/**
 * La entrada que se empaqueta para el banco del número de la pestaña.
 *
 * Las tres fuentes que el icono suma, cada una por su camino de producción:
 * las conversaciones SIN LEER —que las cuenta la bandeja y por eso aquí entra
 * la regla pura, no una consulta— y los dos avisos del equipo, un directo y
 * una mención, que sí salen de Postgres. Ninguna pide sesión: todas reciben a
 * quién miran como parámetro, así que aquí no hace falta fingir `currentUser`.
 *
 * Lo que ya NO está, y es la mitad de lo que este banco demuestra:
 * `contarChatsSinLeer` y `losChatsQueEsperan`. El servidor dejó de adivinar lo
 * que está sin leer (#838). Su consulta se conserva **escrita dentro del
 * banco**, para poder afirmar en el modo roto que con la cuenta vacía devolvía
 * un número de tres cifras.
 */
export { loQuePuedeSonar, marcarLeido } from "@/lib/chat-de-equipo-db";
export { losChatsSinLeer, loQueSePinta } from "@/lib/insignia-del-favicon";
export { db } from "@/lib/db";
