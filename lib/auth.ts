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
        // Obtener ownerId via SQL raw para evitar error de schema incompleto del cliente Prisma
        let ownerId: string | null = null;
        try {
            const rows = await db.$queryRaw<{ owner_id: string | null }[]>`
                SELECT owner_id FROM "User" WHERE id = ${u.id}
            `;
            ownerId = rows[0]?.owner_id ?? null;
        } catch {
            // Si la columna aún no existe, ownerId queda null
        }
        return { ...u, ownerId, effectiveId: ownerId ?? u.id };
    });

    if (request) {
        userCache.set(request, userPromise);
    }

    return userPromise;
}
