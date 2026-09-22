import "server-only";

import { db } from "@/lib/db";
import { laRaizQueManda, type EnlaceDeCuentas } from "@/lib/raiz-de-la-familia";

/**
 * La FAMILIA de una cuenta: todas las que están vinculadas con ella, y quién
 * manda.
 *
 * # Por qué existe
 *
 * Porque `ownerId ?? id` **no sube a la madre**, y eso partió el chat del
 * equipo en dos sin que nadie viera un error.
 *
 * Una cuenta se cuelga de otra por dos caminos, y solo uno de ellos deja
 * rastro en la fila:
 *
 * | camino | qué es | ¿lo ve `ownerId`? |
 * | --- | --- | --- |
 * | `owner_id` | una persona del equipo, o una sub-cuenta creada desde Equipo | **sí** |
 * | `linked_accounts` | una cuenta que ya existía y se vincula a otra | **no** |
 *
 * Verzay | Atencion es del segundo tipo: una cuenta de primer nivel, sin
 * `owner_id`, vinculada bajo la cuenta de la casa. Así que `ownerId ?? id`
 * daba `atencion` para su gente y la de la casa para la madre: **dos hilos
 * distintos**, cada uno viendo solo lo suyo.
 *
 * # `linked_accounts` NO es un árbol: es una malla
 *
 * Esta función dio por hecho un árbol de un nivel —«subo a mi madre, bajo a
 * sus vinculadas»— y **los datos de producción lo desmienten**. Medido:
 *
 * - 13 filas en toda la plataforma, y **8 son parejas recíprocas** (`A -> B` y
 *   `B -> A`). Vincular en los dos sentidos es lo normal, no una excepción.
 * - En la familia de la casa, diez filas cruzan cinco cuentas: la madre
 *   vinculó a las cuatro bajo la suya, dos de ellas la habían vinculado a ella
 *   antes, y hay tres enlaces entre hermanas.
 *
 * Con eso, «de quién cuelgo» devolvía **dos** filas para la madre, y se
 * elegía la primera por `id ASC` —el orden alfabético de un uuid—. Los tres
 * daños, los tres mudos:
 *
 * 1. **Nadie era la madre**, así que el selector de cuentas de Finanzas no se
 *    pintaba y nadie podía repartir un canal entre cuentas.
 * 2. **Cada cuenta calculaba una raíz distinta**, así que el General volvió a
 *    partirse: medido en producción, Verzay | Ventas veía **3 de los 8**
 *    mensajes del hilo.
 * 3. Y el tamaño de la familia salía distinto según desde dónde se preguntara
 *    —3, 5 o 2 para la misma familia de cinco—.
 *
 * Así que la familia es ahora el **componente entero**: todo lo que esté unido
 * por `linked_accounts`, **en los dos sentidos**. Un `UNION` recursivo, que
 * deduplica contra lo ya visto y por eso **termina aunque haya ciclos** —que
 * es justo lo que la versión anterior de este comentario temía de un bucle
 * escrito a mano—. Medido: el componente mayor de la plataforma son **5**
 * cuentas, y solo dos cuentas cambian de tamaño de familia con esto.
 *
 * # `owner_id` sube, pero NO baja
 *
 * A propósito, y es la mitad que se olvida: por `owner_id` cuelga **gente del
 * equipo**, no cuentas. Bajando por ahí, la familia de una empresa se llenaría
 * de personas y el selector de Finanzas ofrecería asesores como si fueran
 * cuentas. Se sube de una persona a su cuenta y a partir de ahí se camina solo
 * por `linked_accounts`, que es lo que la versión anterior ya hacía.
 */

export type Familia = {
    /** La cuenta que manda. **La misma para todos los miembros de la familia.** */
    raiz: string;
    /** Todas las cuentas de la familia. Siempre trae al menos la preguntada. */
    cuentas: string[];
    /**
     * Los enlaces de `linked_accounts` dentro de la familia, con su SENTIDO:
     * `de` vinculó a `a` bajo la suya. Hacen falta para saber qué cuelga de
     * qué —la familia es el componente sin dirección, y eso NO es un alcance:
     * ver `lasCuentasQueCuelganDe` en `lib/crm-de-la-familia.ts`—.
     *
     * Opcional en el tipo porque hay quien construye una familia a mano (los
     * bancos, el respaldo de un fallo); sin enlaces no cuelga nada de nadie.
     */
    enlaces?: EnlaceDeCuentas[];
};

/**
 * Un tope de cordura sobre el tamaño de la familia.
 *
 * El componente mayor de producción son 5 cuentas, así que esto no recorta
 * nada hoy. Está para que una malla mal metida a mano no se traiga media
 * plataforma a una consulta que corre en cada carga del chat del equipo. Si se
 * alcanza **se dice**: una familia recortada se nota como «mis mensajes no le
 * llegan a nadie», que es el fallo del que venimos.
 */
export const TOPE_DE_LA_FAMILIA = 200;

/**
 * La familia de una cuenta.
 *
 * **Nunca lanza**: si la tabla de vinculadas no se puede leer se sigue con la
 * cuenta sola, que es el lado seguro —se ve menos, nunca de más—. Pero **no es
 * mudo**: una familia recortada se nota como «mis mensajes no le llegan a
 * nadie», que es justo el fallo del que venimos.
 */
export async function laFamiliaDeLaCuenta(cuentaId: string): Promise<Familia> {
    const id = String(cuentaId ?? "").trim();
    if (!id) return { raiz: "", cuentas: [] };

    try {
        // Primero se sube de PERSONA a CUENTA. Solo este salto usa `owner_id`:
        // hacia abajo esa columna trae asesores, que no son cuentas.
        const suya = await db.$queryRaw<{ id: string }[]>`
            SELECT u."owner_id" AS id
            FROM "User" u
            WHERE u.id = ${id} AND u."owner_id" IS NOT NULL
            LIMIT 1
        `;
        const base = suya[0]?.id?.trim() || id;

        // Y desde ahí, el componente entero de `linked_accounts`, en los DOS
        // sentidos. El `UNION` del recursivo deduplica contra lo acumulado, así
        // que un ciclo no lo cuelga: la tabla de trabajo se vacía cuando deja
        // de aparecer una cuenta nueva.
        const filas = await db.$queryRaw<{ id: string }[]>`
            WITH RECURSIVE familia(id) AS (
                SELECT ${base}::text
              UNION
                SELECT CASE WHEN la."master_user_id" = f.id
                            THEN la."linked_user_id"
                            ELSE la."master_user_id" END
                FROM familia f
                JOIN "linked_accounts" la
                  ON la."master_user_id" = f.id OR la."linked_user_id" = f.id
            )
            SELECT id FROM familia ORDER BY id ASC LIMIT ${TOPE_DE_LA_FAMILIA}
        `;

        if (filas.length >= TOPE_DE_LA_FAMILIA) {
            console.warn("[familia] la familia viene al tope y se ha recortado", {
                cuenta: id,
                tope: TOPE_DE_LA_FAMILIA,
            });
        }

        // El COMPONENTE son cuentas. `id` puede ser una persona —se preguntó
        // por un asesor— y va aparte: entra en `cuentas`, como iba antes, pero
        // **no compite por la raíz**. Sin esa separación, preguntar desde un
        // asesor de una cuenta sin vinculadas devolvería al asesor como raíz y
        // su propia cuenta dejaría de ser la madre.
        const componente = new Set<string>([base]);
        for (const f of filas) if (f.id?.trim()) componente.add(f.id.trim());
        const deLaFamilia = Array.from(componente);

        // Quién manda sale de los enlaces del componente, no del orden de los
        // ids. Se piden acotados a la familia: fuera de ella no hay ninguno.
        const enlaces = await db.$queryRaw<EnlaceDeCuentas[]>`
            SELECT la."master_user_id" AS de, la."linked_user_id" AS a
            FROM "linked_accounts" la
            WHERE la."master_user_id" = ANY(${deLaFamilia}::text[])
              AND la."linked_user_id" = ANY(${deLaFamilia}::text[])
        `;

        const cuentas = new Set<string>(deLaFamilia);
        cuentas.add(id);

        return {
            raiz: laRaizQueManda(deLaFamilia, enlaces),
            cuentas: Array.from(cuentas),
            enlaces,
        };
    } catch (error) {
        console.warn("[chat-equipo] no se pudo resolver la familia de la cuenta", {
            cuenta: id,
            error: error instanceof Error ? error.message : String(error),
        });
        return { raiz: id, cuentas: [id], enlaces: [] };
    }
}

/** ¿Es esta cuenta la madre de su familia? Solo ella reparte canales que cruzan. */
export function esLaCuentaMadre(familia: Familia, cuentaId: string): boolean {
    return Boolean(cuentaId) && familia.raiz === cuentaId;
}
