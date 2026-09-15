import { Prisma } from '@prisma/client';

/**
 * Una conversación de GRUPO tiene ficha (`Session`), y el CRM no la mira.
 *
 * Los grupos entran en la bandeja (ver `api-webhook#148`) y para que la barra
 * de arriba funcione —etiquetas, asignar, tareas, recordatorios— necesitan su
 * fila en `Session`, porque todo eso cuelga de ella. Pero **un grupo no es un
 * lead**: no se cuenta, no se factura, no se exporta y no se le mandan
 * campañas.
 *
 * ## La marca es el propio `remoteJid`
 *
 * Termina en `@g.us`, y eso es imposible en un 1:1. No hay columna nueva, y eso
 * es a propósito:
 *
 * - **Sin migración.** `Session` la toca también el backend, y añadirle columnas
 *   desde la App es lo que reventó el #360.
 * - **Sin backfill.** Los grupos que ya tenían ficha de antes cumplen la
 *   condición solos, así que no hay dos clases de grupo.
 * - Es la misma condición que `cleanupJunkSessions` usaba para BORRARLOS. Al
 *   dejar de borrarlos, esa cláusula se fue de allí y vive aquí.
 *
 * ## Y por eso está en un solo sitio
 *
 * El riesgo de este camino es olvidarse en una consulta y que un grupo aparezca
 * como lead. Escribir `LIKE '%@g.us'` a mano en veinte sitios es garantizar que
 * el día que se añada el veintiuno se olvide. Se importa de aquí.
 *
 * **Chats NO es CRM.** La bandeja, la conversación y las sesiones que alimentan
 * su barra tienen que seguir viendo los grupos: si se les aplica esto, vuelve
 * la pantalla pelada que esto venía a arreglar.
 */

/** El sufijo que hace de marca. Uno solo, y de aquí salen los dos de abajo. */
const SUFIJO_DE_GRUPO = '@g.us';

/** ¿Esta conversación es un grupo? Para decidir en el navegador. */
export function esConversacionDeGrupo(remoteJid?: string | null): boolean {
  return (remoteJid ?? '').trim().toLowerCase().endsWith(SUFIJO_DE_GRUPO);
}

/**
 * El filtro para un `where` de Prisma. Se mete tal cual:
 *
 * ```ts
 * where: { userId, ...SIN_GRUPOS }
 * ```
 *
 * Ojo al combinarlo con otro `remoteJid` en el mismo `where`: en ese caso la
 * clave se pisa y hay que usar `AND`. Por eso las consultas que ya filtran por
 * `remoteJid` no lo necesitan —van a UNA conversación, no a una lista—.
 */
export const SIN_GRUPOS = {
  remoteJid: { not: { endsWith: SUFIJO_DE_GRUPO } },
} satisfies { remoteJid: Prisma.StringFilter };

/**
 * El mismo filtro para SQL en crudo. Se pasa la tabla o su alias:
 *
 * ```ts
 * WHERE s."userId" = ${userId} ${sinGruposSql('s')}
 * ```
 *
 * Empieza por `AND` a propósito: así se pega al final de un `WHERE` que ya
 * existe y no hay que acordarse de ponerlo.
 */
export function sinGruposSql(tabla: string): Prisma.Sql {
  return Prisma.sql`AND ${Prisma.raw(`lower(${tabla}."remoteJid")`)} NOT LIKE ${`%${SUFIJO_DE_GRUPO}`}`;
}
