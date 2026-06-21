// lib/auth.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isAdminLike } from "@/lib/rbac";
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
    preferredCurrencyCode: true,
    trialEndsAt: true,
} satisfies Prisma.UserSelect;

type DbUser = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export type CurrentUser = DbUser & { effectiveId: string; sessionUserId: string };

type AccountRole = "agente" | "administrador";

const userCache = new WeakMap<Request, Promise<CurrentUser | null>>();

export async function currentUser(request?: Request): Promise<CurrentUser | null> {
    if (request && userCache.has(request)) {
        return userCache.get(request)!;
    }

    const session = await auth();
    if (!session?.user?.id) return null;

    const impersonateId = cookies().get("impersonate_user_id")?.value;
    const activeAccountId = cookies().get("active_account_id")?.value;

    const realUser = await db.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, role: true },
    });

    if (!realUser) return null;

    let effectiveUserId = realUser.id;
    let fromMembership = false;
    let accountRole: AccountRole | null = null;

    if (impersonateId && isAdminLike(realUser.role)) {
        effectiveUserId = impersonateId;
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

        if (fromMembership) {
            return {
                ...u,
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
                return { ...u, ...ownerCreds, effectiveId: u.ownerId, sessionUserId: realUser.id };
            }
        }

        return { ...u, effectiveId: u.ownerId ?? u.id, sessionUserId: realUser.id };
    });

    if (request) {
        userCache.set(request, userPromise);
    }

    return userPromise;
}
