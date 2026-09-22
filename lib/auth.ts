// lib/auth.ts
import { cache } from "react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isAdminLike, isAdminOrReseller } from "@/lib/rbac";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import { juzgarElAlcance } from "@/lib/alcance-entre-cuentas.server";
import { cookies } from "next/headers";
import { llaveDeLaSesion, recordarPorSesion } from "@/lib/cache-de-sesion";
import type { Prisma } from "@prisma/client";

const USER_SELECT = {
    id: true,
    status: true,
    name: true,
    email: true,
    role: true,
    company: true,
    notificationNumber: true,
    apiUrl: true,
    apiKey: true,
    image: true,
    plan: true,
    webhookUrl: true,
    apiKeyId: true,
    instancias: true,
    onFacebook: true,
    onInstagram: true,
    meetingDuration: true,
    minNoticeMinutes: true,
    timezone: true,
    meetingUrl: true,
    enabledSynthesizer: true,
    enabledLeadStatusClassifier: true,
    enabledCrmFollowUps: true,
    advisorSignature: true,
    delSeguimiento: true,
    ownerId: true,
    advisorRole: true,
    // Permisos de la persona (ver lib/permisos.ts).
    deniedModuleItems: true,
    grantedModuleItems: true,
    canTakeUnassigned: true,
    preferredCurrencyCode: true,
    trialEndsAt: true,
    // El layout los necesita en CADA navegación (tema de la interfaz y con qué
    // marca se nombra el nivel del plan). Venían de dos consultas extra a la
    // MISMA fila que ya se lee aquí; traerlos de una quita esas dos idas y
    // vueltas de todas las páginas.
    theme: true,
    demoResellerId: true,
} satisfies Prisma.UserSelect;

type DbUser = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export type CurrentUser = DbUser & {
    effectiveId: string;
    sessionUserId: string;
    /**
     * El rol de plataforma de la PERSONA que esta sentada delante.
     *
     * `role`, arriba, es el de la fila EFECTIVA: con el conmutador de cuentas o
     * con la cookie de «Ingresar», esa fila es la de la cuenta en la que se
     * esta metido, asi que `role` deja de ser el tuyo. Un superadministrador
     * dentro de una cuenta `admin` era, para todo el codigo, un `admin`.
     *
     * Este campo no cuesta ni una consulta: `resolverElUsuario` ya lee la fila
     * real —la necesita para los permisos— y hasta ahora tiraba su `role`.
     *
     * **No se usa para heredar nada.** Lo unico que decide es lo que dice
     * `esSuperAdminDeVerdad` (`lib/super-admin-de-verdad.ts`): que quien manda
     * en la plataforma sigue mandando este donde este.
     */
    rolDeLaPersona: string | null;
    /**
     * El rol de plataforma de la CUENTA en la que se esta trabajando.
     *
     * Ni el tuyo (`rolDeLaPersona`) ni necesariamente el de la fila efectiva:
     * para un miembro del equipo, `role` es el suyo —`user`, porque el equipo se
     * crea asi— y el de su cuenta es otro. Con esa confusion, a un administrador
     * del equipo de una cuenta `admin` el MENU le escondia «Panel» mientras la
     * PUERTA le dejaba entrar escribiendo la URL.
     *
     * No cuesta una consulta: la rama que lee las credenciales del dueño ya va a
     * esa fila. **Se coge aparte y NUNCA se derrama sobre `role`** — eso seria
     * heredar el rol, que es lo que este documento prohibe desde el principio.
     */
    rolDeLaCuenta: string | null;
    /**
     * Se ha entrado a ESTA cuenta con «Ingresar».
     *
     * No es lo mismo que el conmutador de cuentas vinculadas, y la diferencia
     * es la que decide quien manda dentro:
     *
     * - **Conmutador** (`active_account_id`): se cambia entre cuentas PROPIAS,
     *   las que cuelgan del mismo equipo. Ahi el rol de la persona sigue
     *   contando — es lo que hace que un superadministrador administre su
     *   cuenta vinculada sin cambiar de sesion.
     * - **«Ingresar»** (`impersonate_user_id`): se entra a la cuenta de un
     *   CLIENTE, y se entra justamente para ver lo que ve el. Que el rol propio
     *   se colara dentro convertia esa pantalla en otra cosa: el super
     *   administrador veia la Analitica de plataforma donde el cliente ve su
     *   cartera, y el menu, los apartados y los botones de Chats le salian
     *   abiertos de mas.
     *
     * Con esta marca el rol propio **deja de contar mientras se esta dentro**
     * (ver `elRolPropioQueCuenta`, en `lib/super-admin-de-verdad.ts`). Salir
     * sigue siendo borrar la cookie, que no pregunta ningun rol.
     */
    porImpersonacion: boolean;
    /**
     * El nombre de la PERSONA que está sentada delante.
     *
     * `name`, arriba, es el de la fila EFECTIVA: dentro de una cuenta ajena es
     * el de esa cuenta. Para firmar algo que escribe una persona —el chat
     * interno del equipo— eso no vale: el mensaje quedaba a nombre de la cuenta
     * y el equipo no sabía quién había hablado.
     *
     * No cuesta ni una consulta, por lo mismo que `rolDeLaPersona`: la fila
     * real ya se lee y hasta ahora se tiraba su nombre.
     */
    nombreDeLaPersona: string | null;
};

// El cache por objeto `Request` que habia aqui se fue con la cache por sesion:
// exigia que el llamador pasara el `Request` y NINGUNO lo hacia (comprobado en
// todo el repo). La de `lib/cache-de-sesion.ts` no pide nada al llamador.

/**
 * Usuario de la petición actual, memoizado.
 *
 * Se llama desde 335 puntos del código y cada llamada cuesta entre 2 y 4
 * consultas (sesión, usuario real, usuario efectivo y, según el caso, las
 * credenciales del dueño o la tabla de cuentas vinculadas). Dentro de una misma
 * petición se repetía varias veces —el layout, la página y cada Server Action
 * que participa—, multiplicando ese coste sin que nada cambiara entre llamadas.
 *
 * `cache()` de React deduplica por petición: la primera llamada consulta y las
 * demás reciben el mismo resultado. Ya existía un caché por objeto `Request`,
 * pero exigía pasarlo y casi ningún llamador lo hacía.
 *
 * Es seguro respecto al cambio de cuenta: las cookies que deciden la cuenta
 * activa (`impersonate_user_id`, `active_account_id`) no cambian a mitad de una
 * petición, y las acciones que las escriben devuelven inmediatamente sin volver
 * a leer el usuario, así que la siguiente petición ya ve la cuenta nueva.
 */
export const currentUser = cache(_currentUser);

/**
 * Y una cache corta ENTRE peticiones, encima de la de React.
 *
 * `cache()` deduplica dentro de un render, y un route handler no abre ese
 * ambito: ahi es un paso directo. Con Chats fuera de la cola de acciones, una
 * carga son cinco peticiones resolviendo lo mismo desde cero.
 *
 * La llave son las cookies que deciden el resultado, asi que el conmutador de
 * cuentas y el cierre de sesion se invalidan solos. Dura 5 s. Lo que se recuerda
 * es QUIEN ERES, no a que llegas: el alcance se consulta en vivo en cada
 * llamada. Todo el razonamiento esta en `lib/cache-de-sesion.ts`.
 */
async function _currentUser(): Promise<CurrentUser | null> {
    let llave: string | null = null;
    try {
        llave = llaveDeLaSesion(cookies().getAll());
    } catch {
        // Fuera del ambito de una peticion no hay cookies que leer: se resuelve
        // como siempre, sin recordar nada.
        llave = null;
    }

    return recordarPorSesion(llave, () => resolverElUsuario(), {
        // Un `null` -sin sesion- no se cachea nunca: seria recordar que alguien
        // no ha entrado, y eso tiene que volver a comprobarse siempre.
        sirveParaCachear: (valor) => valor !== null,
    });
}

async function resolverElUsuario(): Promise<CurrentUser | null> {
    const session = await auth();
    if (!session?.user?.id) return null;

    const impersonateId = cookies().get("impersonate_user_id")?.value;
    const activeAccountId = cookies().get("active_account_id")?.value;

    const realUser = await db.user.findUnique({
        where: { id: session.user.id },
        select: {
            id: true,
            role: true,
            // El nombre de la PERSONA real. Esta consulta ya se hace —hace
            // falta para los permisos—, asi que el dato sale gratis.
            name: true,
            deniedModuleItems: true,
            grantedModuleItems: true,
            canTakeUnassigned: true,
            // Para saber si actúa por su cuenta (ver más abajo).
            ownerId: true,
            advisorRole: true,
        },
    });

    if (!realUser) return null;

    let effectiveUserId = realUser.id;
    let porImpersonacion = false;

    // Con qué alcance se entra a otra cuenta. El `administrador` de una cuenta
    // entra a donde entra ella: si no, «Ingresar» ponía la cookie y la sesión
    // no cambiaba —se quedaba en la suya— sin decir nada. Solo se resuelve
    // cuando hace falta, que es cuando hay cookie de impersonación.
    const quienEntra = impersonateId
        ? await cuentaQueManda(realUser)
        : { id: realUser.id, role: realUser.role as string };

    // Y a DÓNDE se entra, que se vuelve a mirar en cada petición y no solo al
    // pulsar «Ingresar»: la cookie vive treinta días y una que se puso antes de
    // esta regla —o a mano— no puede seguir abriendo lo que ya no se abre.
    // Nunca a un superadministrador, nunca hacia arriba, nunca a una cuenta de
    // la casa que no cuelgue de la suya (`lib/alcance-entre-cuentas.ts`).
    // Si no alcanza, la cookie se ignora y se sigue en la cuenta propia.
    const alcanza = impersonateId
        ? (
              await juzgarElAlcance({
                  esSuperAdmin: realUser.role === "super_admin",
                  cuenta: quienEntra.id,
                  objetivoId: impersonateId,
                  donde: "currentUser",
              })
          ).puede
        : false;

    if (impersonateId && !alcanza) {
        // Se queda en la suya. El aviso ya lo escribió `juzgarElAlcance`.
    } else if (impersonateId && isAdminLike(quienEntra.role)) {
        effectiveUserId = impersonateId;
        porImpersonacion = true;
    } else if (impersonateId && isAdminOrReseller(quienEntra.role)) {
        // Reseller (no admin): solo puede actuar como uno de SUS clientes
        // (asignados en `reseller` o creados como demo por él).
        const target = await db.user.findUnique({
            where: { id: impersonateId },
            select: { demoResellerId: true },
        });
        let owns = target?.demoResellerId === quienEntra.id;
        if (!owns) {
            const assignment = await db.reseller.findFirst({
                where: { userId: impersonateId, resellerid: quienEntra.id },
                select: { id: true },
            });
            owns = !!assignment;
        }
        if (owns) {
            effectiveUserId = impersonateId;
            porImpersonacion = true;
        }
    } else if (impersonateId) {
        // Colaborador del equipo: solo a los clientes que le asignaron. Es el
        // caso de quien tiene que entrar a arreglar una cuenta concreta sin
        // que haya que darle rol de admin y con él la plataforma entera.
        const asignado = await db.advisorClient
            .findFirst({
                where: { advisorUserId: realUser.id, clientUserId: impersonateId },
                select: { id: true },
            })
            .catch(() => null);
        if (asignado) {
            effectiveUserId = impersonateId;
            porImpersonacion = true;
        }
    } else if (activeAccountId && activeAccountId !== realUser.id) {
        // El conmutador solo BAJA: se cambia a una cuenta que uno vinculó bajo
        // la suya (`master = yo, linked = ella`). El camino contrario —una hija
        // cambiándose a la cuenta de su madre porque su madre la vinculó— se
        // cerró a propósito: una cuenta hija no actúa como su madre. Antes esa
        // rama («membership») dejaba a Verzay | Atencion entrar como Carlos
        // Arcos con un clic en el menú de cuentas.
        try {
            const haciaAbajo = await db.$queryRaw<{ id: string }[]>`
                SELECT id
                FROM "linked_accounts"
                WHERE "master_user_id" = ${realUser.id}
                  AND "linked_user_id" = ${activeAccountId}
                LIMIT 1
            `;

            if (haciaAbajo.length > 0) {
                effectiveUserId = activeAccountId;
            } else if (activeAccountId !== realUser.ownerId) {
                // Una cookie que ya no abre nada —se puso cuando la rama de
                // subir existía— se ignora, pero no en silencio.
                console.warn("[cuentas] el conmutador pidió una cuenta que no cuelga de la propia", {
                    persona: realUser.id,
                    pedida: activeAccountId,
                });
            }
        } catch (error) {
            console.warn("[cuentas] no se pudo leer el conmutador; se sigue en la cuenta propia", {
                persona: realUser.id,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const userPromise = db.user.findUnique({
        where: { id: effectiveUserId },
        select: USER_SELECT,
    }).then(async (u): Promise<CurrentUser | null> => {
        if (!u) return null;

        // Los permisos son de la PERSONA, no de la cuenta que esté mirando.
        // Cuando se entra a otra cuenta, `u` es la fila de ESA cuenta, y sus
        // permisos —normalmente vacíos— tapaban los de quien de verdad está
        // sentado delante: por eso alguien con apartados concedidos llegaba a
        // la pantalla sin ninguno.
        //
        // Salvo al ENTRAR como la cuenta, que es otra cosa: ahí se actúa como
        // ella, con sus módulos y sus apartados. Los recortes propios acotan lo
        // que uno hace en su cuenta, no lo que puede hacer dentro de una que le
        // confiaron: el admin entra y la ve entera, y quien la tiene asignada
        // tiene que poder hacer ahí lo mismo, que para eso se le pasó.
        const permisosDeLaPersona = porImpersonacion
            ? {
                deniedModuleItems: u.deniedModuleItems,
                grantedModuleItems: u.grantedModuleItems,
                canTakeUnassigned: u.canTakeUnassigned,
            }
            : {
                deniedModuleItems: realUser.deniedModuleItems,
                grantedModuleItems: realUser.grantedModuleItems,
                canTakeUnassigned: realUser.canTakeUnassigned,
            };

        if (u.ownerId) {
            const ownerCreds = await db.user.findUnique({
                where: { id: u.ownerId },
                select: {
                    // El rol de la CUENTA. Esta consulta ya se hace, asi que el
                    // dato sale gratis; se guarda aparte, sin pisar el de la
                    // persona.
                    role: true,
                    apiKey: true,
                    apiKeyId: true,
                    apiUrl: true,
                    webhookUrl: true,
                    instancias: true,
                    notificationNumber: true,
                    timezone: true,
                    // El plan es DE LA CUENTA, no de la persona.
                    //
                    // Quien entra al equipo se crea con el plan por defecto y
                    // esa fila no se toca nunca mas: la suscripcion la paga la
                    // cuenta. Sin traerlo de aqui, al administrador de una
                    // cuenta Enterprise le salia «Plan Basico» en la barra
                    // lateral y en su Perfil, y las pantallas que se abren por
                    // plan (`lib/sidebar-modules.ts`, los limites de productos,
                    // las plantillas de flujo) le median por un plan que nadie
                    // contrato.
                    //
                    // El `rol` NO se hereda, a proposito: eso es lo que decide
                    // sobre que cuentas manda, y prestarlo seria abrirle la
                    // plataforma entera. El plan solo dice hasta donde llega la
                    // cuenta en la que ya esta.
                    plan: true,
                    // Con que marca se nombra ese plan (`etiquetaDePlanParaCuenta`).
                    // Sin el, un cliente de reseller veria a su equipo los
                    // nombres genericos de la plataforma en vez de los suyos.
                    demoResellerId: true,
                },
            });
            if (ownerCreds) {
                // `role` se saca del spread A PROPOSITO: derramarlo sobre `u`
                // convertiria a cada miembro del equipo en lo que sea su cuenta,
                // y eso es heredar el rol. Va a su propio campo, que solo leen
                // las reglas que preguntan por la CUENTA.
                const { role: rolDeSuCuenta, ...credencialesDelDueno } = ownerCreds;
                return {
                    ...u,
                    ...credencialesDelDueno,
                    ...permisosDeLaPersona,
                    effectiveId: u.ownerId,
                    sessionUserId: realUser.id,
                    rolDeLaPersona: realUser.role,
                    nombreDeLaPersona: realUser.name,
                    rolDeLaCuenta: rolDeSuCuenta ?? u.role,
                    porImpersonacion,
                };
            }
        }

        return {
            ...u,
            ...permisosDeLaPersona,
            effectiveId: u.ownerId ?? u.id,
            sessionUserId: realUser.id,
            rolDeLaPersona: realUser.role,
            nombreDeLaPersona: realUser.name,
            // Sin dueño, la cuenta es uno mismo.
            rolDeLaCuenta: u.role,
            porImpersonacion,
        };
    });

    return userPromise;
}
