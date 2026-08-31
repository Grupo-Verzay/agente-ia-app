/**
 * Quien puede ver y tocar un diagrama, aparte de quien lo hizo.
 *
 * - `privado`: solo su autor. No sale en el listado de nadie más.
 * - `lectura`: el equipo lo ve y lo abre, pero no lo cambia.
 * - `edicion`: el equipo lo edita. Es como se comportaba todo hasta ahora, y
 *   por eso es el valor por defecto: los diagramas que ya existían siguen igual
 *   de compartidos que estaban.
 *
 * Vive aquí y no junto a las acciones porque un fichero `"use server"` solo
 * puede exportar funciones: la lista es un dato, y la necesitan las dos partes.
 */
export const VISIBILIDADES = ["privado", "lectura", "edicion"] as const;
export type FlowVisibility = (typeof VISIBILIDADES)[number];
