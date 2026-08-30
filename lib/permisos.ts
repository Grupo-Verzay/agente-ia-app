/**
 * Permisos por persona: qué apartados ve alguien del equipo dentro de la cuenta.
 *
 * El rol (Agente / Administrador) decide bloques enteros. Esto es el ajuste
 * fino encima, y funciona en los dos sentidos:
 *
 * - En los módulos normales se guarda lo NEGADO. Lo natural es tener acceso,
 *   así que un apartado nuevo aparece solo, sin ir persona por persona.
 * - En los módulos "Solo Admin" se guarda lo PERMITIDO. Ahí lo natural es no
 *   tener acceso, y un apartado nuevo del Panel no se le abre a nadie solo.
 *   Es lo que permite decir "este agente no entra al Panel, salvo a Diagramas".
 */

export function parseItemIds(raw?: string | null): Set<string> {
    if (!raw) return new Set();
    return new Set(
        raw
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
    );
}

export function serializeItemIds(ids: Iterable<string>): string | null {
    const limpio = [...new Set([...ids].map((id) => id.trim()).filter(Boolean))];
    return limpio.length ? limpio.join(',') : null;
}

type ModuloConItems = {
    adminOnly?: boolean | null;
    moduleItems?: { id: string }[] | null;
};

/**
 * Deja en cada módulo los apartados que esta persona ve, y quita el módulo
 * entero cuando no le queda ninguno: un módulo que agrupa apartados y se queda
 * sin ellos no lleva a ningún sitio.
 *
 * `mandaLoPermitido` es true para quien el rol no deja entrar a los módulos
 * "Solo Admin" —un agente, o un asesor sin rol de administrador—: en esos
 * módulos solo ve lo que se le haya dado. Para un administrador es false y esos
 * módulos se comportan como los demás.
 *
 * Un módulo sin apartados (Chats, Llamadas) no se toca aquí: esos se quitan
 * desde "Módulos habilitados".
 */
export function aplicarPermisos<T extends ModuloConItems>(
    modules: T[],
    opts: {
        denied: Set<string>;
        granted: Set<string>;
        mandaLoPermitido: boolean;
    },
): T[] {
    const visibles: T[] = [];

    for (const m of modules) {
        const items = m.moduleItems ?? [];
        if (items.length === 0) {
            visibles.push(m);
            continue;
        }

        const quedan =
            opts.mandaLoPermitido && m.adminOnly
                ? items.filter((it) => opts.granted.has(it.id))
                : items.filter((it) => !opts.denied.has(it.id));

        if (quedan.length === 0) continue;
        visibles.push(quedan.length === items.length ? m : { ...m, moduleItems: quedan });
    }

    return visibles;
}
