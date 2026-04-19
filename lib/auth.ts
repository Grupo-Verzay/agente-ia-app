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
        where: { id: effectiveUserId }, // por id (no email)
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
        },
    });

    if (request) {
        userCache.set(request, userPromise);
    }

    return userPromise;
}
