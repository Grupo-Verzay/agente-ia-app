import "server-only";

import { db } from "@/lib/db";
import { isAdmin, isSuperAdmin } from "@/lib/rbac";
import { aplicaBloqueoPorPlan } from "@/lib/panel-tabs";
import { parseItemIds } from "@/lib/permisos";
import { cuentaAlcanzaLaRuta } from "@/lib/acceso-a-modulo";

/**
 * De estas filas de `User`, cuáles **alcanzan** una ruta de módulo.
 *
 * Es la pregunta del menú, contestada contra la base: *¿vería esta fila esa
 * ruta en su barra lateral?* La decide `cuentaAlcanzaLaRuta`, que es pura y es
 * la misma regla que aplica el layout; aquí solo se le traen los datos.
 *
 * `import "server-only"` y no `'use server'`: esto lee `User`, `Module` y
 * `_UserModules` y no tiene por qué ser alcanzable desde el navegador. Un
 * fichero de acciones publica todo lo que exporta como un POST.
 *
 * ## Vale para una CUENTA y para una PERSONA, y ese es el motivo de existir
 *
 * Una fila de `User` puede ser una cuenta —sin `owner_id`— o alguien de su
 * equipo. Las dos se preguntan igual, porque las dos tienen sus propios
 * `_UserModules`, sus apartados negados y sus concedidos: **el alcance se
 * pregunta a la fila EFECTIVA**, que es la regla de siempre. Por eso esta
 * función recibe ids y devuelve el conjunto de los que alcanzan, en vez de
 * contestar «sí o no» sobre una sola: quien pregunta por una cuenta mira si el
 * conjunto trae algo, y quien pregunta por un equipo se queda con la lista.
 *
 * ## Y `_UserModules` es una RESTRICCIÓN, no una concesión
 *
 * Es el fallo que ya costó una vuelta con el botón de grabar: una fila **sin
 * ninguna** fila en `_UserModules` no es «no tiene ningún módulo», es «sin
 * tope» — ve todos los que su plan permita. Quien lo lea al revés esconde el
 * módulo a quien en el menú sí lo tiene. Esa lectura vive en
 * `cuentaAlcanzaLaRuta` y no se vuelve a escribir aquí.
 *
 * Nunca lanza: ante un fallo devuelve el conjunto vacío —el lado seguro, se
 * avisa de menos y nunca de más— **y lo dice**, porque «a mí no me llega nada»
 * es de lo más difícil de diagnosticar después.
 */
export async function quienesAlcanzanLaRuta(
    ids: readonly string[],
    ruta: string,
): Promise<Set<string>> {
    const limpios = Array.from(new Set(ids.map((i) => (i ?? "").trim()).filter(Boolean)));
    if (!limpios.length) return new Set();

    try {
        // Los módulos que llevan la ruta, por su cabecera o por un apartado. La
        // mitad de los módulos de esta plataforma la llevan dentro, así que
        // mirar solo `route` dejaría fuera justo a los que se montan así.
        const modulos = await db.module.findMany({
            where: {
                OR: [{ route: ruta }, { moduleItems: { some: { url: ruta } } }],
            },
            select: {
                id: true,
                route: true,
                adminOnly: true,
                allowedPlans: true,
                lockedPlans: true,
                moduleItems: { select: { id: true, url: true, lockedPlans: true } },
            },
        });
        // Si nadie ha creado el módulo, no hay ruta que alcanzar.
        if (!modulos.length) return new Set();

        const filas = await db.user.findMany({
            where: { id: { in: limpios } },
            select: {
                id: true,
                role: true,
                plan: true,
                ownerId: true,
                advisorRole: true,
                trialEndsAt: true,
                deniedModuleItems: true,
                grantedModuleItems: true,
                userModules: { select: { A: true } },
            },
        });

        // El rol de la CUENTA de quien cuelga de alguien. Un **administrador**
        // del equipo actúa por su cuenta y abre lo que ella abre
        // (`rolQueAbrePuertas`), y su propio `role` es `user` porque el equipo
        // se crea así: sin esto, un módulo «Solo Admin» se le caería a quien en
        // su menú lo tiene. Una consulta más y solo cuando hace falta.
        const duenos = Array.from(
            new Set(
                filas
                    .filter((f) => f.ownerId && f.advisorRole === "administrador")
                    .map((f) => f.ownerId as string),
            ),
        );
        const rolDeLaCuenta = new Map<string, string | null>();
        if (duenos.length) {
            const filasDuenas = await db.user.findMany({
                where: { id: { in: duenos } },
                select: { id: true, role: true },
            });
            for (const d of filasDuenas) rolDeLaCuenta.set(d.id, d.role ?? null);
        }

        const alcanzan = new Set<string>();
        for (const fila of filas) {
            // Un agente —fila con dueño y sin `administrador`— no hereda nada:
            // participa, no manda. Un administrador sí, y por eso se le mira el
            // rol de su cuenta.
            const esAgente = !!fila.ownerId && fila.advisorRole !== "administrador";
            const rolQueAbre = esAgente
                ? fila.role
                : (fila.ownerId ? rolDeLaCuenta.get(fila.ownerId) : null) ?? fila.role;

            const puede = cuentaAlcanzaLaRuta(
                {
                    esSuperAdmin: isSuperAdmin(fila.role) || isSuperAdmin(rolQueAbre),
                    esAdmin: isAdmin(rolQueAbre) && !esAgente,
                    // La prueba abre todo, y a alguien del equipo el plan no le
                    // aplica: `aplicaBloqueoPorPlan` lo decide con `trialEndsAt`
                    // y `ownerId`, así que los dos tienen que venir en la fila.
                    filtraPorPlan: aplicaBloqueoPorPlan(fila),
                    plan: fila.plan ?? null,
                    restriccion: new Set(fila.userModules.map((r) => r.A)),
                    negados: parseItemIds(fila.deniedModuleItems),
                    concedidos: parseItemIds(fila.grantedModuleItems),
                },
                modulos,
                ruta,
            );
            if (puede) alcanzan.add(fila.id);
        }
        return alcanzan;
    } catch (error) {
        console.warn("[modulos] no se pudo resolver quién alcanza una ruta", {
            ruta,
            cuantos: limpios.length,
            error: error instanceof Error ? error.message : String(error),
        });
        return new Set();
    }
}
