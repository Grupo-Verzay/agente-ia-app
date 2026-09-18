"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
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
};

type FilaDePersona = { id: string; nombre: string | null };

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
): Promise<{ personas: FilaDePersona[]; soloLaMia: boolean }> {
    const firma = quienFirma(user);
    const yo: FilaDePersona = {
        id: firma?.personaId ?? user.id,
        nombre: firma?.nombre ?? null,
    };

    // 1. Quien manda en la plataforma, esté donde esté.
    if (esSuperAdminDeVerdad(user)) {
        const filas = await db.$queryRaw<FilaDePersona[]>`
      SELECT u."id", COALESCE(NULLIF(TRIM(u."name"), ''), u."email") AS "nombre"
      FROM "User" u
      WHERE EXISTS (
        SELECT 1 FROM "actividad_jornada" j WHERE j."personaId" = u."id"
      )
      ORDER BY 2 ASC
      LIMIT 500
    `;
        // Se parte de quien ha registrado algo y no de `User` entero: esa tabla
        // tiene dentro a los clientes de la plataforma, que no son equipo de
        // nadie. Y quien mira sale siempre, aunque hoy no tenga nada.
        return {
            personas: filas.some((f) => f.id === yo.id) ? filas : [yo, ...filas],
            soloLaMia: false,
        };
    }

    // 2. Quien administra su cuenta: su equipo.
    if (canManageWorkspace(user)) {
        const cuentaId = firma?.cuentaId ?? user.ownerId ?? user.id;
        // El MISMO criterio con el que `getTeamAdvisorInfos` resuelve el
        // equipo: los que cuelgan de la cuenta y las cuentas vinculadas. Con
        // otro, la pantalla enseñaría a gente que no es de este equipo o se
        // dejaría fuera a media plantilla.
        const filas = await db.$queryRaw<FilaDePersona[]>`
      SELECT DISTINCT ON (u."id")
        u."id", COALESCE(NULLIF(TRIM(u."name"), ''), u."email") AS "nombre"
      FROM "User" u
      WHERE u."id" = ${cuentaId}
         OR u."owner_id" = ${cuentaId}
         OR u."id" IN (
              SELECT la."linked_user_id" FROM "linked_accounts" la
              WHERE la."master_user_id" = ${cuentaId}
            )
      ORDER BY u."id"
    `;
        const conmigo = filas.some((f) => f.id === yo.id) ? filas : [yo, ...filas];
        return { personas: conmigo, soloLaMia: false };
    }

    // 3. Y cualquiera, la suya.
    return { personas: [yo], soloLaMia: true };
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
                porSeccion: suya?.porSeccion ?? seccionesEnCero(),
                segundos: suya?.segundos ?? 0,
                acciones: suya?.acciones ?? accionesEnCero(),
            } satisfies JornadaDeUnaPersona;
        });

        personas.sort((a, b) => b.segundos - a.segundos);

        return { soloLaMia: alcance.soloLaMia, desde, hasta, personas };
    } catch (error) {
        // Un fallo aquí no puede ser mudo: una pantalla vacía sin explicación
        // se lee como «el equipo no trabajó», que es lo peor que puede decir.
        console.warn("[actividad] no se pudo leer la actividad", error);
        return null;
    }
}
