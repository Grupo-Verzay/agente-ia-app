import { isAdminLike, isSuperAdmin } from "@/lib/rbac";

/**
 * Quién manda en la plataforma: **la PERSONA, no la fila en la que esté metida**.
 *
 * # El problema que cierra
 *
 * `currentUser()` devuelve la fila de la cuenta EFECTIVA. Con el conmutador de
 * cuentas vinculadas, o con la cookie de «Ingresar», esa fila es la de la
 * cuenta en la que se está metido, así que `user.role` **deja de ser el tuyo**:
 * un superadministrador dentro de una cuenta `admin` era, para las 48 puertas
 * que preguntan por la cuenta, un `admin`; dentro de una cuenta de cliente, un
 * `user`.
 *
 * Y encima veinte puertas cierran por `advisorRole !== "administrador"`
 * —`workspace-roles`, `cuenta-que-configura`, `panel-acceso`, `mando-en-chats`,
 * el `esAgente` del layout…— y **ninguna eximía al superadministrador**. El
 * resultado desde fuera: la cuenta que administra la plataforma entera abría
 * una pantalla de una cuenta suya y le salía «Sección no habilitada».
 *
 * # Cómo lo resuelve, y por qué no cuesta una consulta
 *
 * Esto generaliza el `esAdminDeVerdad` que ya existía en dos rutas de `/api`,
 * que ante un rol efectivo insuficiente iba a buscar a la base el rol de
 * `sessionUserId`. Aquí **no hace falta ir**: `resolverElUsuario` ya lee la fila
 * de la persona real —la necesita para los permisos— y ahora la propaga en
 * `rolDeLaPersona`. Así la regla es **pura y síncrona**, que es lo único que
 * permite ponerla dentro de `canManageWorkspace` y `puedeBorrarEnChats`, que no
 * son `async` y tienen decenas de llamadores.
 *
 * # Dos cosas que hay que mantener
 *
 * 1. **Esto NO hereda el rol.** `user.role` sigue siendo el de la fila efectiva
 *    para todo lo demás, y `cuentaQueManda` sigue decidiendo el alcance por
 *    cuenta. Lo único que dice esta función es que quien manda en la plataforma
 *    sigue mandando esté donde esté — la regla escrita: «el súper administrador
 *    ve y administra todo, en cualquier cuenta».
 * 2. **Se mira el rol efectivo TAMBIÉN**, no solo el de la persona. Una cuenta
 *    de superadministrador a la que se entra sin conmutador tiene su rol en
 *    `role` y en `rolDeLaPersona` el mismo; pero al revés —un super admin que
 *    entra en otra cuenta— solo lo dice `rolDeLaPersona`. Preguntar por uno
 *    solo deja fuera la mitad de los casos.
 */
export type Persona = {
    role?: string | null;
    rolDeLaPersona?: string | null;
    /** Se entró a esta cuenta con «Ingresar» (ver `lib/auth.ts`). */
    porImpersonacion?: boolean | null;
};

/**
 * El rol PROPIO, cuando cuenta.
 *
 * # La excepción, y por qué no es una excepción
 *
 * La regla de arriba —quien manda en la plataforma manda esté donde esté— se
 * escribió para el **conmutador de cuentas vinculadas**: cambiar a una cuenta
 * del propio equipo y seguir pudiendo administrarla. Eso sigue igual.
 *
 * Pero «Ingresar» en la cuenta de un CLIENTE es otra cosa, y es justo la
 * contraria: **se entra para ver lo que ve él**. Con el rol propio colándose
 * dentro, esa pantalla dejaba de ser la suya — Analíticas le enseñaba la
 * plataforma entera donde el cliente ve su cartera, y el menú, los apartados
 * del panel y los botones de Chats le salían abiertos de más. Mirar una cuenta
 * «como la ve su dueño» y verla con poderes de superadministrador son dos
 * cosas distintas, y el botón dice la primera.
 *
 * Así que dentro de una cuenta ajena por «Ingresar» **el rol propio no
 * cuenta**. Y no hace falta tocar los diez sitios que preguntan: todos pasan
 * por aquí.
 *
 * Salir no queda nunca cerrado: es borrar la cookie (`/api/logout`), que no
 * pregunta ningún rol.
 */
export function elRolPropioQueCuenta(
    persona: Persona | null | undefined,
): string | null | undefined {
    if (!persona) return null;
    if (persona.porImpersonacion) return null;
    return persona.rolDeLaPersona;
}

export function esSuperAdminDeVerdad(
    persona: Persona | null | undefined,
): boolean {
    if (!persona) return false;
    return isSuperAdmin(persona.role) || isSuperAdmin(elRolPropioQueCuenta(persona));
}

/**
 * Lo mismo, pero para `admin` y `super_admin`.
 *
 * Es el `esAdminDeVerdad` de `/api/admin/grupos` y de
 * `/api/admin/limpiar-salientes-duplicados`, sin su consulta: ahora el rol de
 * la persona viaja en `currentUser()`.
 */
export function esAdminDeVerdad(
    persona: Persona | null | undefined,
): boolean {
    if (!persona) return false;
    return isAdminLike(persona.role) || isAdminLike(elRolPropioQueCuenta(persona));
}
