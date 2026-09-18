"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
import { laFamiliaDeLaCuenta } from "@/lib/familia-de-cuentas";
import { quienFirma } from "@/lib/chat-de-equipo";
import { laJornadaDe } from "@/lib/actividad-del-equipo-db";
import {
    accionesEnCero,
    diaDeLaJornada,
    seccionesEnCero,
    type JornadaDeUnaPersona,
} from "@/lib/actividad-del-equipo";

/**
 * Lo que lee la pantalla de Actividad del equipo.
 *
 * **Este fichero solo exporta funciones `async`.** Los tipos y las constantes
 * están en `lib/actividad-del-equipo.ts`: en un módulo `'use server'` una
 * constante exportada pasa el build limpio y luego, en producción, cada llamada
 * a cualquier acción del fichero da 500. Ya costó la primera versión entera de
 * Carpetas. Un `export type` sí puede quedarse: se borra al compilar.
 */

export type ActividadDelEquipo = {
    /** Quién mira, para que la pantalla sepa si enseñar una fila o una tabla. */
    soloLaMia: boolean;
    desde: string;
    hasta: string;
    personas: JornadaDeUnaPersona[];
    /**
     * Las cuentas de la CASA de quien mira: la suya, su raíz y sus vinculadas.
     *
     * Es lo único que hace falta para partir la pantalla en dos, y se manda
     * como dato en vez de partir aquí la lista porque el reparto es **puro**
     * (`repartirEnDosBloques`) y así se puede probar en el banco sin levantar
     * nada. Para quien no es súper administrador trae las cuentas de su propia
     * gente, así que **todo el mundo cae en el bloque de arriba** y no hay
     * barra de clientes: su pantalla no cambia.
     */
    cuentasDeLaFamilia: string[];
};

type FilaDePersona = {
    id: string;
    nombre: string | null;
    /** `owner_id ?? id` de SU fila: la cuenta a la que pertenece. */
    cuentaId: string;
    cuentaNombre: string | null;
};

/**
 * Las columnas de una persona con su cuenta resuelta.
 *
 * La cuenta sale de **su propia fila** (`owner_id ?? id`) y su nombre de un
 * `LEFT JOIN` contra esa misma cuenta. No se mira `actividad_jornada.cuentaId`
 * en ningún sitio: esa columna dice contra qué cuenta se guardó el rato, que no
 * es lo mismo (ver `JornadaDeUnaPersona.cuentaId`).
 */
const COLUMNAS_DE_PERSONA = Prisma.sql`
  u."id",
  COALESCE(NULLIF(TRIM(u."name"), ''), u."email") AS "nombre",
  COALESCE(u."owner_id", u."id") AS "cuentaId",
  COALESCE(NULLIF(TRIM(c."name"), ''), c."email") AS "cuentaNombre"
`;

/**
 * A quién alcanza quien mira. **Es la puerta, y está aquí y no en la pantalla**:
 * la pantalla pinta lo que esto devuelva, así que no puede abrir de más.
 *
 * Los tres escalones son los del encargo, y cada uno usa la regla que la
 * plataforma ya tiene en vez de una condición nueva — escribir una aquí es lo
 * que dejó fuera a media gente en Clientes, Equipo y Analíticas:
 *
 * 1. **El súper administrador de verdad ve todo.** Se pregunta por la PERSONA
 *    (`esSuperAdminDeVerdad`), no por la cuenta en la que esté metida, y va
 *    PRIMERO: detrás de una condición de cuenta no sirve de nada.
 * 2. **Quien administra ve a su equipo** (`canManageWorkspace`): el dueño y su
 *    `administrador`. Un `agente` no pasa por aquí — participa, no manda.
 * 3. **Y cualquiera ve la suya.** Nunca se devuelve «No autorizado» a alguien
 *    por su propia jornada: es suya.
 */
async function aQuienAlcanza(
    user: Parameters<typeof quienFirma>[0] & {
        id: string;
        ownerId?: string | null;
        role?: string | null;
        rolDeLaPersona?: string | null;
        advisorRole?: string | null;
    },
): Promise<{
    personas: FilaDePersona[];
    soloLaMia: boolean;
    cuentasDeLaFamilia: string[];
}> {
    const firma = quienFirma(user);
    const miCuenta = firma?.cuentaId ?? user.ownerId ?? user.id;
    const yo: FilaDePersona = {
        id: firma?.personaId ?? user.id,
        nombre: firma?.nombre ?? null,
        cuentaId: miCuenta,
        cuentaNombre: null,
    };

    // 1. Quien manda en la plataforma, esté donde esté.
    if (esSuperAdminDeVerdad(user)) {
        // La CASA es la familia de su cuenta, no su cuenta sola: `ownerId ?? id`
        // **no sube a la madre** —una cuenta vinculada no deja rastro en la
        // fila— y sin esto las cuentas hermanas saldrían en Clientes, que es el
        // mismo fallo que ya partió el chat del equipo en dos.
        const familia = await laFamiliaDeLaCuenta(miCuenta);
        const cuentas = familia.cuentas;

        // La casa se lista desde `User` y **no desde quien ha registrado algo**:
        // si se partiera de la actividad, una familia que ese mes trabajó dentro
        // de cuentas de clientes —con «Ingresar», que guarda el rato bajo la
        // cuenta ajena— dejaría el bloque de arriba vacío, que es justo lo que
        // no puede pasar. Aquí el cero es el dato.
        const deLaCasa = await db.$queryRaw<FilaDePersona[]>`
      SELECT DISTINCT ON (u."id") ${COLUMNAS_DE_PERSONA}
      FROM "User" u
      LEFT JOIN "User" c ON c."id" = COALESCE(u."owner_id", u."id")
      WHERE u."id" = ANY(${cuentas}::text[])
         OR u."owner_id" = ANY(${cuentas}::text[])
      ORDER BY u."id"
    `;

        // Y los clientes sí se parten de quien ha registrado algo: `User` entera
        // son todas las cuentas de la plataforma, y una tabla con las que nunca
        // han abierto la App no dice nada. El filtro mira **la cuenta de la
        // persona**, nunca la de su actividad.
        const deClientes = await db.$queryRaw<FilaDePersona[]>`
      SELECT ${COLUMNAS_DE_PERSONA}
      FROM "User" u
      LEFT JOIN "User" c ON c."id" = COALESCE(u."owner_id", u."id")
      WHERE EXISTS (
              SELECT 1 FROM "actividad_jornada" j WHERE j."personaId" = u."id"
            )
        AND NOT (u."id" = ANY(${cuentas}::text[]))
        AND NOT (COALESCE(u."owner_id", u."id") = ANY(${cuentas}::text[]))
      ORDER BY 4 ASC, 2 ASC
      LIMIT 500
    `;

        const filas = [...deLaCasa, ...deClientes];
        return {
            // Quien mira sale siempre, aunque hoy no tenga nada.
            personas: filas.some((f) => f.id === yo.id) ? filas : [yo, ...filas],
            soloLaMia: false,
            cuentasDeLaFamilia: cuentas,
        };
    }

    // 2. Quien administra su cuenta: su equipo.
    if (canManageWorkspace(user)) {
        // El MISMO criterio con el que `getTeamAdvisorInfos` resuelve el
        // equipo: los que cuelgan de la cuenta y las cuentas vinculadas. Con
        // otro, la pantalla enseñaría a gente que no es de este equipo o se
        // dejaría fuera a media plantilla.
        const filas = await db.$queryRaw<FilaDePersona[]>`
      SELECT DISTINCT ON (u."id") ${COLUMNAS_DE_PERSONA}
      FROM "User" u
      LEFT JOIN "User" c ON c."id" = COALESCE(u."owner_id", u."id")
      WHERE u."id" = ${miCuenta}
         OR u."owner_id" = ${miCuenta}
         OR u."id" IN (
              SELECT la."linked_user_id" FROM "linked_accounts" la
              WHERE la."master_user_id" = ${miCuenta}
            )
      ORDER BY u."id"
    `;
        const conmigo = filas.some((f) => f.id === yo.id) ? filas : [yo, ...filas];
        // Su pantalla no cambia: se declara familia a las cuentas de la gente
        // que ya le devuelve su propia consulta, así que todos caen arriba y la
        // barra de Clientes ni se pinta. No hace falta resolver ninguna familia
        // —sería una consulta más para no cambiar nada.
        return {
            personas: conmigo,
            soloLaMia: false,
            cuentasDeLaFamilia: [...new Set(conmigo.map((f) => f.cuentaId))],
        };
    }

    // 3. Y cualquiera, la suya.
    return { personas: [yo], soloLaMia: true, cuentasDeLaFamilia: [miCuenta] };
}

/** Un `YYYY-MM-DD` que llega de fuera, o nada. */
function comoDia(valor: unknown): string | null {
    const texto = String(valor ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
}

/**
 * La actividad de un rango de días.
 *
 * Devuelve `null` a quien no tenga sesión, y **nunca** a alguien por su propia
 * jornada. La pantalla enseña «Acceso denegado» solo si esto dice que no.
 */
export async function leerLaActividad(entrada?: {
    desde?: string;
    hasta?: string;
}): Promise<ActividadDelEquipo | null> {
    const user = await currentUser();
    if (!user?.id) return null;

    const hoy = diaDeLaJornada(new Date());
    // Por defecto, los últimos 30 días. Un rango que llega de fuera pasa por
    // la forma esperada: lo que no sea una fecha no se mete en la consulta.
    const hace30 = diaDeLaJornada(new Date(Date.now() - 29 * 86400000));
    let desde = comoDia(entrada?.desde) ?? hace30;
    let hasta = comoDia(entrada?.hasta) ?? hoy;
    if (desde > hasta) [desde, hasta] = [hasta, desde];

    try {
        const alcance = await aQuienAlcanza(user);
        const ids = alcance.personas.map((p) => p.id);
        const jornadas = await laJornadaDe({ personaIds: ids, desde, hasta });

        // Se devuelve una fila por persona **aunque no tenga nada**: un equipo
        // en el que alguien no aparece se lee como que falta gente, no como
        // que esa persona no registró tiempo. El cero es el dato.
        const personas = alcance.personas.map((p) => {
            const suya = jornadas.get(p.id);
            return {
                personaId: p.id,
                personaNombre: p.nombre,
                cuentaId: p.cuentaId,
                cuentaNombre: p.cuentaNombre,
                porSeccion: suya?.porSeccion ?? seccionesEnCero(),
                segundos: suya?.segundos ?? 0,
                acciones: suya?.acciones ?? accionesEnCero(),
            } satisfies JornadaDeUnaPersona;
        });

        personas.sort((a, b) => b.segundos - a.segundos);

        return {
            soloLaMia: alcance.soloLaMia,
            desde,
            hasta,
            personas,
            cuentasDeLaFamilia: alcance.cuentasDeLaFamilia,
        };
    } catch (error) {
        // Un fallo aquí no puede ser mudo: una pantalla vacía sin explicación
        // se lee como «el equipo no trabajó», que es lo peor que puede decir.
        console.warn("[actividad] no se pudo leer la actividad", error);
        return null;
    }
}
