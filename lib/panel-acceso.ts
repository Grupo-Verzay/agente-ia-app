import "server-only";

import { db } from "@/lib/db";
import { isAdminOrReseller } from "@/lib/rbac";
import { parseItemIds } from "@/lib/permisos";
import { rutasDePanelParaElMenu } from "@/lib/sidebar-modules";

type Persona = {
    role: string;
    ownerId?: string | null;
    advisorRole?: string | null;
    deniedModuleItems?: string | null;
    grantedModuleItems?: string | null;
};

/**
 * Los apartados del panel que esta persona puede abrir.
 *
 * Se calcula con la MISMA regla que el menú, y no con el rol: quien llegaba
 * aquí por rol entraba, y a quien se le habían dado apartados sueltos se le
 * cerraba la puerta antes de mirarlos. Además la regla no depende de que el
 * módulo esté marcado "Solo Admin": si lo está, manda lo concedido; si no, lo
 * que no se le haya quitado. Con la marca puesta o quitada, el resultado es el
 * que se ve en la pantalla de Permisos.
 *
 * Devuelve null si no hay módulo de panel; lista vacía si no puede abrir nada.
 */
export async function apartadosDelPanel(persona: Persona) {
    // El panel que le toca por rol, no "cualquier panel": un administrador
    // abriendo su portada tiene que ver SUS apartados, no los del
    // superadministrador. Se recorre en orden de preferencia y se toma el
    // primero que exista, que es lo que deja funcionar a los administradores
    // mientras nadie haya creado todavia el modulo /panel-admin.
    const candidatas = rutasDePanelParaElMenu(persona.role);
    const panelesExistentes = await db.module.findMany({
        where: { route: { in: candidatas } },
        // Desempate por id: los submódulos guardados antes de que se sellaran con
        // un instante distinto comparten createdAt, y sin criterio de desempate
        // cada consulta los devuelve en otro orden.
        include: { moduleItems: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
    const panelModule = candidatas
        .map((route) => panelesExistentes.find((m) => m.route === route))
        .find(Boolean);
    if (!panelModule) return null;

    const concedidos = parseItemIds(persona.grantedModuleItems);
    const negados = parseItemIds(persona.deniedModuleItems);
    const esAgente = !!persona.ownerId && persona.advisorRole !== "administrador";
    const mandaLoConcedido = esAgente || !isAdminOrReseller(persona.role);

    const items = (panelModule.moduleItems ?? []).filter((item) =>
        mandaLoConcedido && panelModule.adminOnly
            ? concedidos.has(item.id)
            : !negados.has(item.id),
    );

    return { panelModule, items };
}
