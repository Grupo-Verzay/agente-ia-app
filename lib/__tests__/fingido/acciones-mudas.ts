/**
 * Un doble de las acciones de servidor, para el banco del navegador.
 *
 * Las filas de Chats importan acciones (`'use server'`) que por dentro traen
 * Prisma, `next/headers` y medio backend: empaquetarlas para un navegador no
 * solo no compila, es que no tiene sentido — aquí no se pulsa ninguna, se
 * MIDE cómo se pinta la fila. Lo que se finge es el borde, no lo que se prueba.
 */
const nada = async () => ({ success: true as const, message: "banco" });

export const updateSessionLeadStatus = nada;
export const updateSessionServiceType = nada;
export const updateSessionClientStatus = nada;
export const takeSession = nada;
export const releaseSession = nada;
export const getAssignmentHistory = async () => [];
export default nada;
