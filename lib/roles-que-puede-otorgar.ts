/**
 * Quién puede repartir qué rol de plataforma.
 *
 * # El agujero que cierra
 *
 * En Panel › Clientes el desplegable de rol listaba **los cinco roles** a
 * cualquiera que abriera la pantalla (`Object.values(Role)`), y la acción que
 * guarda —`updateClientData`— copiaba el `role` del formulario **tal cual** a
 * `db.user.update`. O sea: un `admin` podía hacerse un compañero
 * «Super administrador», o ascender a cualquier cliente por encima de sí mismo,
 * y nadie lo comprobaba. La puerta de la acción solo preguntaba «¿gestionas a
 * este cliente?» (`exigirGestionDelCliente`), nunca «¿qué rol le estás
 * poniendo?». Son dos preguntas distintas y faltaba la segunda.
 *
 * # La regla
 *
 * **Nadie otorga un rol igual o superior al suyo.** De ahí sale todo lo demás:
 * un `admin` llega hasta `reseller`, un `reseller` hasta `affiliate`, y
 * «Administrador» y «Super administrador» **solo los reparte un súper
 * administrador de verdad** —el de la PERSONA, no el de la cuenta en la que
 * esté metida (ver `lib/super-admin-de-verdad.ts`)—.
 *
 * El súper administrador es la única excepción, y tiene que serlo: si se le
 * aplicara «ni igual ni superior» no quedaría nadie capaz de crear otro, y la
 * plataforma se quedaría sin forma de repartir su propio rol.
 *
 * # Y la otra mitad, que es la que se olvida
 *
 * No basta con mirar el rol que se pone: hay que mirar también **el que ya
 * tenía**. Sin eso, un `admin` no puede ascender a nadie a `super_admin` pero sí
 * puede **degradar** al súper administrador a `user` —que es «otorgar un rol
 * inferior», permitido por la letra— y quedarse mandando él. Por eso
 * `puedeCambiarElRol` exige que las DOS puntas estén por debajo de quien
 * reparte.
 *
 * # Puro a propósito
 *
 * Sin imports: lo usan el servidor (las acciones que guardan) y el navegador
 * (los desplegables), y el banco lo prueba sin levantar nada. Que el
 * desplegable y la acción salgan de la misma función es lo que evita el caso de
 * siempre —esconder la opción y dejar la petición abierta—, pero el orden
 * importa: **quien decide es el servidor**; el desplegable solo es su fachada.
 */

/** Los roles de plataforma, **de menos a más**. El orden ES la jerarquía. */
export const JERARQUIA_DE_ROLES = [
    "user",
    "affiliate",
    "reseller",
    "admin",
    "super_admin",
] as const;

export type RolDePlataforma = (typeof JERARQUIA_DE_ROLES)[number];

/** ¿Es esto un rol de los que existen? Lo que llegue de fuera pasa por aquí. */
export function esRolDePlataforma(rol: unknown): rol is RolDePlataforma {
    return (
        typeof rol === "string" &&
        (JERARQUIA_DE_ROLES as readonly string[]).includes(rol)
    );
}

/** Cómo se llama cada rol en pantalla. Estaba copiado en cinco componentes. */
export const NOMBRE_DEL_ROL: Record<RolDePlataforma, string> = {
    user: "Usuario",
    affiliate: "Afiliado",
    reseller: "Reseller",
    admin: "Administrador",
    super_admin: "Super administrador",
};

/**
 * Con qué rol reparte roles alguien.
 *
 * El súper administrador **de verdad** reparte como súper administrador esté en
 * la cuenta que esté —es la regla de «ve y administra todo, en cualquier
 * cuenta»—. Los demás reparten con el rol de la CUENTA por la que actúan, que
 * es el mismo con el que se les abre la pantalla de Clientes: el
 * `administrador` de una cuenta reseller reparte como reseller, no como el
 * `user` con el que se creó su fila.
 */
export function rolQueReparte(
    esSuperAdminDeVerdad: boolean,
    rolDeLaCuenta: string | null | undefined,
): string {
    if (esSuperAdminDeVerdad) return "super_admin";
    return rolDeLaCuenta ?? "";
}

/** Los roles que esta persona puede poner. Vacío si no puede poner ninguno. */
export function rolesQuePuedeOtorgar(
    rolDeQuienReparte: string | null | undefined,
): RolDePlataforma[] {
    if (rolDeQuienReparte === "super_admin") return [...JERARQUIA_DE_ROLES];

    const suyo = (JERARQUIA_DE_ROLES as readonly string[]).indexOf(
        String(rolDeQuienReparte ?? ""),
    );
    // Un rol que no está en la lista no reparte nada, y `user` tampoco: por
    // debajo de él no hay ninguno.
    if (suyo <= 0) return [];
    return JERARQUIA_DE_ROLES.slice(0, suyo) as unknown as RolDePlataforma[];
}

/** ¿Puede poner ESE rol? */
export function puedeOtorgarElRol(
    rolDeQuienReparte: string | null | undefined,
    rol: unknown,
): boolean {
    if (!esRolDePlataforma(rol)) return false;
    return rolesQuePuedeOtorgar(rolDeQuienReparte).includes(rol);
}

/**
 * ¿Puede cambiarle el rol a esta cuenta, del que tiene al que se pide?
 *
 * Las dos puntas: el rol nuevo tiene que poder otorgarlo, y el que ya tenía
 * también —si no, degradar a quien está por encima sería la escalada por el
 * otro lado—.
 */
export function puedeCambiarElRol(
    rolDeQuienReparte: string | null | undefined,
    rolActual: unknown,
    rolNuevo: unknown,
): boolean {
    if (!esRolDePlataforma(rolNuevo)) return false;
    if (rolDeQuienReparte === "super_admin") return true;

    const otorgables = rolesQuePuedeOtorgar(rolDeQuienReparte);
    if (!otorgables.includes(rolNuevo)) return false;

    // Un rol actual que no reconocemos no se toca: es el lado seguro.
    if (!esRolDePlataforma(rolActual)) return false;
    return otorgables.includes(rolActual);
}

/** Por qué se rechaza, en palabras que se puedan leer en pantalla. */
export function porQueNoPuedeOtorgarlo(
    rolDeQuienReparte: string | null | undefined,
    rolActual: unknown,
    rolNuevo: unknown,
): string {
    if (!esRolDePlataforma(rolNuevo)) return "Ese rol no existe.";

    if (!puedeOtorgarElRol(rolDeQuienReparte, rolNuevo)) {
        const comoSeLlama = NOMBRE_DEL_ROL[rolNuevo];
        if (rolNuevo === "admin" || rolNuevo === "super_admin") {
            return `No puedes asignar el rol «${comoSeLlama}»: solo lo reparte un súper administrador.`;
        }
        return `No puedes asignar el rol «${comoSeLlama}»: nadie otorga un rol igual o superior al suyo.`;
    }

    return "No puedes cambiarle el rol a una cuenta con un rol igual o superior al tuyo.";
}
