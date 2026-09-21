/**
 * ¿Una cuenta ALCANZA una ruta de módulo? — la misma pregunta que el menú.
 *
 * Esto existe porque `_UserModules` tiene DOS significados opuestos en la
 * plataforma y confundirlos es un fallo real (el del botón de grabar):
 *
 * - **El menú lateral** (`app/(root)/layout.tsx`) trata `_UserModules` como una
 *   **restricción**: si la cuenta tiene filas, ve SOLO esos módulos; si no tiene
 *   ninguna —lo normal en una cuenta de administrador o Enterprise— ve **todos**
 *   los que su plan permite. O sea: sin filas = «sin tope», ve todo.
 * - Quien pregunta «¿tiene este módulo?» mirando si EXISTE una fila en
 *   `_UserModules` lo lee al revés: sin filas = «no tiene nada». Así, una cuenta
 *   sin restricción —que en el menú ve el módulo— daba `false`, y el botón que
 *   depende de esa puerta no salía por mucho que se asignara el módulo.
 *
 * La regla, entonces, es la del menú: **una cuenta alcanza una ruta si la vería
 * en su menú**. Es puro a propósito —entra el criterio ya resuelto, salen
 * `boolean`— para poder probarlo sin base y para que la puerta y el menú no
 * discrepen. Los booleans del criterio (`esAdmin`, `filtraPorPlan`, …) se
 * calculan con las MISMAS funciones que usa el layout (`isAdmin`, `isSuperAdmin`,
 * `aplicaBloqueoPorPlan`, `parseItemIds`), no con una copia.
 */

/** Un módulo, con lo justo para decidir si su ruta se alcanza. */
export interface ModuloParaAcceso {
    id: string;
    route: string;
    adminOnly: boolean;
    allowedPlans: string[];
    lockedPlans: string[];
    moduleItems: { id: string; url: string; lockedPlans: string[] }[];
}

/** Lo que de una cuenta decide qué módulos ve, ya resuelto. */
export interface CriterioDeAcceso {
    /** El super admin es el dueño de la plataforma: lo ve todo. */
    esSuperAdmin: boolean;
    /** `isAdmin(rolQueAbrePuertas)` y no es agente: abre los módulos «Solo Admin». */
    esAdmin: boolean;
    /** `aplicaBloqueoPorPlan`: si no, el plan no limita nada (prueba, agente, super). */
    filtraPorPlan: boolean;
    /** El plan de la cuenta, para cruzarlo con `allowedPlans`/`lockedPlans`. */
    plan: string | null;
    /**
     * Los ids de módulo de `_UserModules`. Vacío o `null` = **sin restricción**,
     * ve todo (ese es justo el caso que el fallo leía al revés).
     */
    restriccion: Set<string> | null;
    /** `deniedModuleItems`: apartados escondidos a mano a esta cuenta. */
    negados: Set<string>;
    /** `grantedModuleItems`: apartados sueltos concedidos a mano. */
    concedidos: Set<string>;
}

/**
 * `true` si la cuenta vería la ruta en su menú, con la misma regla que el
 * layout: restricción por cuenta → «Solo Admin» → plan, y la ruta puede llegar
 * por el propio módulo o por uno de sus apartados.
 */
export function cuentaAlcanzaLaRuta(
    criterio: CriterioDeAcceso,
    modulos: ModuloParaAcceso[],
    ruta: string,
): boolean {
    if (criterio.esSuperAdmin) return true;

    const tieneRestriccion = !!criterio.restriccion && criterio.restriccion.size > 0;

    for (const m of modulos) {
        // Restricción por cuenta: con lista, el módulo tiene que estar en ella.
        // Sin lista, no limita nada —«sin tope», ve todo—.
        if (tieneRestriccion && !criterio.restriccion!.has(m.id)) continue;

        // «Solo Admin»: sin ser admin y sin un apartado concedido, no.
        const tieneConcedidos = m.moduleItems.some((it) => criterio.concedidos.has(it.id));
        if (m.adminOnly && !criterio.esAdmin && !tieneConcedidos) continue;

        // El plan, solo cuando aplica (a un cliente sí, al equipo interno y a la
        // prueba no —eso lo decide `filtraPorPlan`—).
        if (criterio.filtraPorPlan && criterio.plan) {
            if (m.allowedPlans.length && !m.allowedPlans.includes(criterio.plan)) continue;
            if (m.lockedPlans.includes(criterio.plan)) continue;
        }

        // La ruta puede ser la del propio módulo…
        if (m.route === ruta) return true;

        // …o la de un apartado, que además no puede estar denegado ni bloqueado
        // por plan para esta cuenta.
        const item = m.moduleItems.find((it) => it.url === ruta);
        if (!item) continue;
        if (criterio.negados.has(item.id)) continue;
        if (criterio.filtraPorPlan && criterio.plan && item.lockedPlans.includes(criterio.plan)) {
            continue;
        }
        return true;
    }

    return false;
}
