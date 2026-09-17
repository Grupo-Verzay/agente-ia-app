import type { User } from '@prisma/client';
import type { CurrentUser } from '@/lib/auth';
import type { ModuleWithItems } from '@/schema/module';
import { canAccessRoute } from '@/utils/access';
import { isAdminLike, isSuperAdmin } from '@/lib/rbac';
import { elRolPropioQueCuenta } from '@/lib/super-admin-de-verdad';
import { parseItemIds } from '@/lib/permisos';

// Rutas de panel administrativo y del panel del cliente. Se mantienen aquí para
// que el sidebar (NavMain) y el personalizador de menú (NavCustomizer) usen
// EXACTAMENTE el mismo criterio de visibilidad y no se desincronicen.
export const PANEL_ROUTES = ['/panel', '/admin'];
export const CLIENT_PANEL_ROUTE = '/client-panel';
export const RESELLER_PANEL_ROUTE = '/reseller-panel';

/**
 * El panel del administrador, aparte del de superadministrador.
 *
 * `/panel` lo compartian los dos, asi que no habia forma de recortarle
 * apartados a un administrador sin quitarselos tambien al superadministrador.
 * Con una fila propia, cada uno lleva los suyos.
 */
export const ADMIN_PANEL_ROUTE = '/panel-admin';

/**
 * El panel que le PERTENECE a un rol, EN ORDEN DE PREFERENCIA.
 *
 * Es una lista y no una ruta unica a proposito: se toma la primera que exista.
 * Asi, mientras nadie haya creado todavia el modulo `/panel-admin`, un
 * administrador sigue entrando a `/panel` como hasta ahora, y el dia que se
 * cree pasa a usarlo sin tocar codigo.
 *
 * Estricta: cada rol solo lleva lo suyo. Para decidir que se PINTA en el menu
 * hace falta la version de abajo, que es mas permisiva.
 */
export function rutasDePanelPara(role?: string | null): string[] {
    if (role === 'reseller') return [RESELLER_PANEL_ROUTE];
    // El superadministrador se queda con el panel completo de siempre.
    if (role === 'super_admin') return [...PANEL_ROUTES];
    if (role === 'admin') return [ADMIN_PANEL_ROUTE, ...PANEL_ROUTES];
    return [CLIENT_PANEL_ROUTE];
}

/**
 * Lo mismo, pero para elegir cual se pinta.
 *
 * Aqui se anade el panel del cliente como ultimo recurso a todos menos al
 * reseller, y NO es lo mismo que la lista estricta: la eleccion se hace sobre
 * modulos ya filtrados por rol, plan y permisos, asi que si a alguien le
 * sobrevivio el panel del equipo es porque puede entrar -aunque sea un agente
 * al que solo se le concedieron dos apartados-. Si no le sobrevivio, le toca el
 * de cliente. Quitarle ese respaldo dejaria sin panel a quien hoy si lo tiene.
 */
export function rutasDePanelParaElMenu(role?: string | null): string[] {
    if (role === 'reseller') return [RESELLER_PANEL_ROUTE];
    if (role === 'admin') return [ADMIN_PANEL_ROUTE, ...PANEL_ROUTES, CLIENT_PANEL_ROUTE];
    return [...PANEL_ROUTES, CLIENT_PANEL_ROUTE];
}

/**
 * De los paneles que existen, CUAL le toca a este rol. Uno solo.
 *
 * # Por que vive aqui y no en cuatro sitios
 *
 * Habia cuatro resolutores de esta misma pregunta, y **no coincidian**:
 *
 * | Donde | Sobre que | Con que rol | Con que lista |
 * | --- | --- | --- | --- |
 * | el layout (`suPanelId`) | modulos YA filtrados | el de `ownerId` | `rutasDePanelPara` |
 * | `panelDeLaCuenta` (Equipo) | filas de `Module` sin filtrar | `owner.role` | `rutasDePanelPara` |
 * | `getVisibleSidebarModules` | modulos filtrados | `user.role` | `rutasDePanelParaElMenu` |
 * | `apartadosDelPanel` | filas de `Module` | `persona.role` | `rutasDePanelParaElMenu` |
 *
 * Tres origenes de rol y dos listas de rutas. Discrepaban justo cuando el
 * modulo panel se caia por un filtro: entonces el dialogo de Permisos decia
 * «este apartado esta activo» y el guard del layout cerraba la ruta. De ahi
 * salia «Seccion no habilitada» con los 42 permisos puestos.
 *
 * Ahora la REGLA es una: se recorren las rutas candidatas **en orden de
 * preferencia** y se toma la primera que exista en la lista que se pase. Lo
 * unico que cambia entre los cuatro es esa lista —unos miran los modulos ya
 * filtrados, otros las filas de la base— y eso es legitimo: son preguntas
 * distintas sobre el mismo criterio.
 */
export function elPanelQueLeToca<T extends { route: string }>(
    role: string | null | undefined,
    modulos: readonly T[],
    opciones?: { paraElMenu?: boolean },
): T | null {
    const candidatas = opciones?.paraElMenu
        ? rutasDePanelParaElMenu(role)
        : rutasDePanelPara(role);
    for (const ruta of candidatas) {
        const encontrado = modulos.find((m) => m.route === ruta);
        if (encontrado) return encontrado;
    }
    return null;
}

/**
 * El rol con el que esta persona ABRE PUERTAS.
 *
 * No es `user.role` —el de la fila efectiva— ni el de la cuenta a secas:
 *
 * - Quien manda en la plataforma manda esté donde esté (#746) — salvo dentro
 *   de una cuenta ajena por «Ingresar», donde el rol propio deja de contar a
 *   propósito: ahí se entra para ver lo que ve su dueño
 *   (`elRolPropioQueCuenta`).
 * - Un **administrador** del equipo actua POR su cuenta, asi que abre lo que
 *   ella abre. Es la regla de `cuentaQueManda`, escrita aqui en version pura
 *   para que tambien la pueda usar el menu, que corre en el navegador.
 * - Un **agente** no hereda nada: participa, no manda.
 *
 * Sin esto, `canAccessRoute` cerraba los modulos «Solo Admin» a un
 * administrador del equipo —su `role` es `user`, porque el equipo se crea
 * asi— y el menu le escondia «Panel» mientras la puerta le dejaba entrar.
 */
export function rolQueAbrePuertas(persona: {
    role?: string | null;
    rolDeLaPersona?: string | null;
    rolDeLaCuenta?: string | null;
    ownerId?: string | null;
    advisorRole?: string | null;
    porImpersonacion?: boolean | null;
}): string {
    if (isSuperAdmin(elRolPropioQueCuenta(persona)) || isSuperAdmin(persona.role)) {
        return "super_admin";
    }
    const esAgente = !!persona.ownerId && persona.advisorRole !== "administrador";
    if (esAgente) return persona.role ?? "";
    return persona.rolDeLaCuenta ?? persona.role ?? "";
}

/**
 * LA decision sobre los paneles, y se toma UNA vez: cual le toca y los demas
 * fuera.
 *
 * # Por que devuelve la lista ya filtrada
 *
 * Antes la puerta elegia por su lado y el menu **volvia a elegir** por el suyo,
 * con otro rol y con otra lista de rutas candidatas. A un administrador del
 * equipo de una cuenta que usa `/panel-admin` le pasaba esto: la puerta elegia
 * `/panel-admin` y sacaba `/panel` de `modules`; el menu buscaba con SU rol
 * (`user`, el del equipo), cuya lista no incluye `/panel-admin`, y como
 * `/panel` ya no estaba... no encontraba ninguno y escondia la entrada. Entraba
 * escribiendo la URL y no la veia en el menu.
 *
 * Con esto **el menu ya no decide**: se queda con el que sobrevivio. Si la
 * puerta deja entrar, el menu lo enseña; no hay dos formulas que puedan
 * discrepar porque solo hay una.
 */
export function soloElPanelQueLeToca<T extends { id: string; route: string }>(
    rolDeLaCuenta: string | null | undefined,
    modules: readonly T[],
): { elegido: T | null; visibles: T[] } {
    const elegido = elPanelQueLeToca(rolDeLaCuenta, modules);
    return {
        elegido,
        visibles: modules.filter(
            (m) => !esVarianteDePanel(m.route) || m.id === elegido?.id,
        ),
    };
}

/** Si una ruta es una de las variantes de "Panel". En el menu va solo una. */
export function esVarianteDePanel(route: string): boolean {
    return (
        PANEL_ROUTES.includes(route) ||
        route === RESELLER_PANEL_ROUTE ||
        route === CLIENT_PANEL_ROUTE ||
        route === ADMIN_PANEL_ROUTE
    );
}

// Rutas de gestión ocultas para agentes (cuentas vinculadas sin rol admin).
const AGENT_HIDDEN_ROUTES = ['/equipo', '/sessions', '/crm', '/asesores'];

/**
 * Devuelve los módulos que el usuario realmente puede ver en el sidebar,
 * aplicando visibilidad estructural (showInSidebar) + reglas de rol/plan/acceso.
 *
 * NO aplica las preferencias del usuario (orden/oculto/etiqueta): eso lo hace
 * cada consumidor. Es la ÚNICA fuente de verdad de "qué módulos existen para
 * esta cuenta", compartida entre el sidebar y el personalizador de menú para
 * evitar duplicados y órdenes inconsistentes.
 */
export function getVisibleSidebarModules(
    user: CurrentUser,
    modules: ModuleWithItems[],
): ModuleWithItems[] {
    const isAdvisor = !!user.ownerId;
    // Agente = cuenta vinculada SIN rol administrador. Los administradores de una
    // cuenta vinculada tienen los mismos accesos que el dueño de esa cuenta.
    const isAgente = isAdvisor && user.advisorRole !== 'administrador';
    const concedidos = parseItemIds(user.grantedModuleItems);

    // El "Panel" existe en variantes: /panel y /admin (el del equipo),
    // /reseller-panel y /client-panel. Todas se llaman "Panel", y puede haber
    // más de una fila para la misma. En el sidebar va UNA: la que corresponde
    // al rol. Sin esto salían dos entradas "Panel", una encima de la otra.
    // Se elige por lo que la persona REALMENTE tiene, no por su rol a secas:
    // `modules` ya viene filtrado por rol, plan y permisos, así que si el panel
    // del equipo sigue ahí es porque puede entrar —aunque sea un agente al que
    // solo se le concedieron dos apartados—. Si no lo tiene, le toca el de
    // cliente.
    // El menu NO vuelve a decidir cual panel es el suyo: `soloElPanelQueLeToca`
    // ya lo decidio en el layout y los ajenos no estan en `modules`. Aqui solo
    // se recoge el que sobrevivio. Volver a elegir —con otro rol y otra lista—
    // es lo que escondia «Panel» a quien SI podia entrar.
    const panelDelRol = modules.find(
        (m) => m.showInSidebar && esVarianteDePanel(m.route),
    );

    return modules
        .filter((link) => link.showInSidebar)
        .filter((link) => {
            // Gestión (equipo, leads, pipeline): oculta para agentes; visible para
            // la cuenta principal y los administradores de cuenta vinculada.
            if (isAgente && AGENT_HIDDEN_ROUTES.includes(link.route)) return false;
            // /panel/mis-planes solo para resellers
            if (link.route === '/panel/mis-planes' && user.role !== 'reseller') return false;
            // Las sub-rutas de /panel no van en el sidebar del reseller: las tiene
            // arriba, en las pestañas de su panel.
            if (link.route.startsWith('/panel/') && user.role === 'reseller') return false;
            // Un solo Panel, el del rol.
            if (esVarianteDePanel(link.route) && link.id !== panelDelRol?.id) return false;
            const access = canAccessRoute({
                route: link.route,
                // El rol que ABRE PUERTAS, no el de la fila: un administrador
                // del equipo tiene `role: "user"` y se quedaba fuera de todo lo
                // marcado «Solo Admin», empezando por el propio Panel.
                userRole: rolQueAbrePuertas(user),
                userPlan: user.plan,
                modules,
                label: link.label,
                isAdvisor,
                // Los apartados que llegan aquí ya vienen filtrados por permisos
                // (ver el layout): si un módulo "Solo Admin" conserva alguno, es
                // porque a esta persona se le concedió.
                tieneConcedidos: concedidos.size > 0 && (link.moduleItems ?? []).some((it) => concedidos.has(it.id)),
            });
            if (!access.allowed) return false;
            return true;
        });
}
