// lib/auth.ts
import { cache } from "react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isAdminLike, isAdminOrReseller } from "@/lib/rbac";
import { cookies } from "next/headers";
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

export type CurrentUser = DbUser & { effectiveId: string; sessionUserId: string };

type AccountRole = "agente" | "administrador";

const userCache = new WeakMap<Request, Promise<CurrentUser | null>>();

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

async function _currentUser(request?: Request): Promise<CurrentUser | null> {
    if (request && userCache.has(request)) {
        return userCache.get(request)!;
    }

    const session = await auth();
    if (!session?.user?.id) return null;

    const impersonateId = cookies().get("impersonate_user_id")?.value;
    const activeAccountId = cookies().get("active_account_id")?.value;

    const realUser = await db.user.findUnique({
        where: { id: session.user.id },
        select: {
            id: true,
            role: true,
            deniedModuleItems: true,
            grantedModuleItems: true,
            canTakeUnassigned: true,
        },
    });

    if (!realUser) return null;

    let effectiveUserId = realUser.id;
    let fromMembership = false;
    let porImpersonacion = false;
    let accountRole: AccountRole | null = null;

    if (impersonateId && isAdminLike(realUser.role)) {
        effectiveUserId = impersonateId;
        porImpersonacion = true;
    } else if (impersonateId && isAdminOrReseller(realUser.role)) {
        // Reseller (no admin): solo puede actuar como uno de SUS clientes
        // (asignados en `reseller` o creados como demo por él).
        const target = await db.user.findUnique({
            where: { id: impersonateId },
            select: { demoResellerId: true },
        });
        let owns = target?.demoResellerId === realUser.id;
        if (!owns) {
            const assignment = await db.reseller.findFirst({
                where: { userId: impersonateId, resellerid: realUser.id },
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
        try {
            const membership = await db.$queryRaw<{ role: AccountRole }[]>`
                SELECT role
                FROM "linked_accounts"
                WHERE "master_user_id" = ${activeAccountId}
                  AND "linked_user_id" = ${realUser.id}
                LIMIT 1
            `;

            if (membership.length > 0) {
                effectiveUserId = activeAccountId;
                fromMembership = true;
                accountRole = membership[0].role;
            } else {
                const legacyLink = await db.$queryRaw<{ id: string }[]>`
                    SELECT id
                    FROM "linked_accounts"
                    WHERE "master_user_id" = ${realUser.id}
                      AND "linked_user_id" = ${activeAccountId}
                    LIMIT 1
                `;

                if (legacyLink.length > 0) {
                    effectiveUserId = activeAccountId;
                }
            }
        } catch {
            // Tabla aún no existe o no responde, ignorar y seguir con la cuenta base.
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

        if (fromMembership) {
            return {
                ...u,
                ...permisosDeLaPersona,
                ownerId: effectiveUserId === realUser.id ? null : effectiveUserId,
                advisorRole: accountRole,
                effectiveId: effectiveUserId,
                sessionUserId: realUser.id,
            };
        }

        if (u.ownerId) {
            const ownerCreds = await db.user.findUnique({
                where: { id: u.ownerId },
                select: {
                    apiKey: true,
                    apiKeyId: true,
                    apiUrl: true,
                    webhookUrl: true,
                    instancias: true,
                    notificationNumber: true,
                    timezone: true,
                },
            });
            if (ownerCreds) {
                return {
                    ...u,
                    ...ownerCreds,
                    ...permisosDeLaPersona,
                    effectiveId: u.ownerId,
                    sessionUserId: realUser.id,
                };
            }
        }

        return {
            ...u,
            ...permisosDeLaPersona,
            effectiveId: u.ownerId ?? u.id,
            sessionUserId: realUser.id,
        };
    });

    if (request) {
        userCache.set(request, userPromise);
    }

    return userPromise;
}
