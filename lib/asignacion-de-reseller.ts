/**
 * Qué viaja al navegador de la pantalla de Resellers, y a quién se puede
 * colgar de un reseller. Puro: se prueba sin levantar nada.
 *
 * # Lo que pasaba
 *
 * 1. **Las fichas iban enteras.** `getClientsByReseller` devolvía las filas de
 *    `User` tal cual —con la contraseña cifrada, el `apiKeyId`, el token de
 *    sesión y ochenta columnas más— y la página hacía lo mismo con la lista de
 *    resellers. Todo eso llegaba al navegador para pintar un nombre.
 * 2. **Un cliente podía quedar en dos resellers a la vez.** Asignar era un
 *    `create` a secas: nada miraba si ese cliente ya colgaba de otro, ni por la
 *    tabla `reseller` (el método viejo) ni por `demoResellerId` (el nuevo). Y
 *    con dos dueños, el cobro, los avisos y la marca los decide quien aparezca
 *    primero en cada consulta.
 * 3. **«Sin asignar» eran todos los `user`**: también las personas del equipo
 *    de otras cuentas, las cuentas ya eliminadas y los clientes que un reseller
 *    trajo por su enlace. Ofrecerlos es ofrecer asignarlos dos veces.
 *
 * # La regla
 *
 * > Un cliente cuelga de **un** reseller o de ninguno, se mire por el camino
 * > que se mire. Y al navegador llega la ficha corta —id, nombre, correo,
 * > empresa— y nada más.
 */

/** Lo único que la pantalla necesita de una cuenta. */
export const CAMPOS_DE_LA_FICHA = {
    id: true,
    name: true,
    email: true,
    company: true,
} as const;

export type FichaDeCuenta = {
    id: string;
    name: string | null;
    email: string;
    company: string;
};

/** Recorta una fila a la ficha: lo que no esté aquí no viaja. */
export function comoFicha(fila: {
    id: string;
    name?: string | null;
    email?: string | null;
    company?: string | null;
}): FichaDeCuenta {
    return {
        id: fila.id,
        name: fila.name ?? null,
        email: fila.email ?? "",
        company: fila.company ?? "",
    };
}

/** Lo que hace falta saber de un cliente para decidir si se puede asignar. */
export type CandidatoAReseller = {
    id: string;
    role: string | null;
    ownerId: string | null;
    deletedAt: Date | string | null;
    /** El reseller por el camino nuevo (`User.demoResellerId`). */
    demoResellerId: string | null;
    /** Los resellers por el camino viejo (filas de la tabla `reseller`). */
    resellersAsignados: string[];
};

export type VeredictoDeAsignacion = { ok: true } | { ok: false; motivo: string };

/** ¿Es un cliente al que se le puede poner reseller? (sin mirar cuál). */
export function esClienteAsignable(c: Omit<CandidatoAReseller, "id">): boolean {
    return c.role === "user" && !c.ownerId && !c.deletedAt;
}

/** ¿De qué resellers cuelga ya, por los dos caminos? Sin repetidos. */
export function losResellersDelCliente(c: CandidatoAReseller): string[] {
    const todos = [...c.resellersAsignados, ...(c.demoResellerId ? [c.demoResellerId] : [])];
    return Array.from(new Set(todos.filter(Boolean)));
}

/** «Sin asignar»: asignable y sin reseller por ningún camino. */
export function estaSinAsignar(c: CandidatoAReseller): boolean {
    return esClienteAsignable(c) && losResellersDelCliente(c).length === 0;
}

export function puedeAsignarseAlReseller(
    c: CandidatoAReseller | null | undefined,
    resellerId: string,
): VeredictoDeAsignacion {
    if (!c) return { ok: false, motivo: "Ese cliente no existe." };
    if (!resellerId) return { ok: false, motivo: "Falta el reseller." };
    if (c.id === resellerId) return { ok: false, motivo: "Un reseller no se asigna a sí mismo." };
    if (c.deletedAt) return { ok: false, motivo: "Esa cuenta está eliminada." };
    if (c.ownerId) return { ok: false, motivo: "Es una persona del equipo de otra cuenta, no un cliente." };
    if (c.role !== "user") return { ok: false, motivo: "Solo se asignan cuentas de cliente." };

    const suyos = losResellersDelCliente(c);
    if (suyos.includes(resellerId)) return { ok: false, motivo: "Ese cliente ya es de este reseller." };
    if (suyos.length > 0) {
        return { ok: false, motivo: "Ese cliente ya es de otro reseller. Quítalo de allí primero." };
    }
    return { ok: true };
}
