// lib/auth.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isAdminLike } from "@/lib/rbac";
import { cookies } from "next/headers";

// Cache para la duración de la request
const userCache = new WeakMap<Request, Promise<any>>();

export async function currentUser(request?: Request) {
    // Si tenemos cache para esta request, la usamos
    if (request && userCache.has(request)) {
        return userCache.get(request);
    }

    const session = await auth();
    if (!session?.user?.id) return null;

    // cookie de impersonación
    const impersonateId = cookies().get("impersonate_user_id")?.value;

    // trae el usuario real (solo para saber su role)
    const realUser = await db.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, role: true },
    });

    if (!realUser) return null;

    // decide qué userId usar
    const effectiveUserId =
        impersonateId && isAdminLike(realUser.role) ? impersonateId : realUser.id;

    const userPromise = db.user.findUnique({
        where: { id: effectiveUserId },
        select: {
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
            timezone: true,
            meetingUrl: true,
            enabledSynthesizer: true,
            enabledLeadStatusClassifier: true,
            enabledCrmFollowUps: true,
            advisorSignature: true,
            delSeguimiento: true,
        },
    }).then(async (u) => {
        if (!u) return null;
        // Obtener ownerId y advisorRole via SQL raw para evitar error de schema incompleto del cliente Prisma
        let ownerId: string | null = null;
        let advisorRole: string | null = null;
        try {
            const rows = await db.$queryRaw<{ owner_id: string | null; advisor_role: string | null }[]>`
                SELECT owner_id, advisor_role FROM "User" WHERE id = ${u.id}
            `;
            ownerId = rows[0]?.owner_id ?? null;
            advisorRole = rows[0]?.advisor_role ?? null;
        } catch {
            // Si las columnas aún no existen, quedan null
        }

        // Si es asesor, heredar credenciales de API del dueño
        if (ownerId) {
            const ownerCreds = await db.user.findUnique({
                where: { id: ownerId },
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
                return { ...u, ...ownerCreds, ownerId, advisorRole, effectiveId: ownerId };
            }
        }

        return { ...u, ownerId, advisorRole, effectiveId: ownerId ?? u.id };
    });

    if (request) {
        userCache.set(request, userPromise);
    }

    return userPromise;
}
