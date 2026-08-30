/**
 * Permisos por persona: qué submódulos NO ve un usuario de la cuenta.
 *
 * El rol del equipo (Agente / Administrador) decide bloques enteros. Esto es el
 * ajuste fino encima: "sí entra al Panel, pero no a Finanzas".
 *
 * Se guarda como lista de NEGADOS, no de permitidos, para que un submódulo
 * nuevo aparezca solo en vez de quedar oculto hasta que alguien vaya cuenta por
 * cuenta a habilitarlo.
 */

export function parseDeniedItems(raw?: string | null): Set<string> {
    if (!raw) return new Set();
    return new Set(
        raw
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
    );
}

export function serializeDeniedItems(ids: Iterable<string>): string | null {
    const limpio = [...new Set([...ids].map((id) => id.trim()).filter(Boolean))];
    return limpio.length ? limpio.join(',') : null;
}

/**
 * Quita de cada módulo los submódulos negados, y el módulo entero cuando se
 * queda sin ninguno: un módulo que agrupa submódulos y no tiene ya ninguno no
 * lleva a ningún sitio.
 *
 * Un módulo sin submódulos (Chats, Llamadas) no se toca aquí: esos se quitan
 * desde "Módulos habilitados".
 */
export function aplicarPermisos<
    T extends { moduleItems?: { id: string }[] | null },
>(modules: T[], denied: Set<string>): T[] {
    if (denied.size === 0) return modules;

    const visibles: T[] = [];
    for (const m of modules) {
        const items = m.moduleItems ?? [];
        if (items.length === 0) {
            visibles.push(m);
            continue;
        }
        const quedan = items.filter((it) => !denied.has(it.id));
        if (quedan.length === 0) continue;
        visibles.push(quedan.length === items.length ? m : { ...m, moduleItems: quedan });
    }
    return visibles;
}
