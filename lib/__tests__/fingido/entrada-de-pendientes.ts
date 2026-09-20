/**
 * La entrada que se empaqueta para el banco del número de la pestaña.
 *
 * Reúne las tres fuentes que el icono suma, cada una por su camino de
 * producción: los chats de clientes que esperan respuesta y los dos avisos del
 * equipo —un directo y una mención—. Ninguna pide sesión: todas reciben a
 * quién miran como parámetro, así que aquí no hace falta fingir `currentUser`.
 */
export { contarChatsSinLeer } from "@/lib/chat-persistence";
export { losChatsQueEsperan } from "@/lib/chats-que-esperan.server";
export { loQuePuedeSonar, marcarLeido } from "@/lib/chat-de-equipo-db";
export { elNumeroDeChats, loQueSePinta } from "@/lib/insignia-del-favicon";
export { db } from "@/lib/db";
