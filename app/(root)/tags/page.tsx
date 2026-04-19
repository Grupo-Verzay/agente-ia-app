import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionTagsManager } from "./components";
import { listTagsAction, getSessionTagsAction } from "@/actions/tag-actions";
import { db } from "@/lib/db";

export default async function SessionsPage() {
    const user = await currentUser();

    if (!user) {
        redirect("/login");
    }

    // 🔎 Buscar la sesión que quieras gestionar por tags
    // Aquí tomo la más reciente de ese usuario
    const session = await db.session.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
    });

    if (!session) {
        // Si el usuario aún no tiene sesiones
        return (
            <div className="p-4 text-sm text-muted-foreground">
                Aún no hay sesiones para este usuario.
            </div>
        );
    }

    // Cargar tags disponibles del usuario + tags de ESA sesión
    const [tagsRes, sessionTagsRes] = await Promise.all([
        listTagsAction(user.id),
        getSessionTagsAction(user.id, session.id),
    ]);

    const allTags = tagsRes.data ?? [];
    const initialSelectedTagIds = (sessionTagsRes.data ?? []).map((t) => t.id);

    return (
        <SessionTagsManager
            userId={user.id}
            sessionId={session.id}
            allTags={allTags}
            initialSelectedTagIds={initialSelectedTagIds}
        />
    );
}
