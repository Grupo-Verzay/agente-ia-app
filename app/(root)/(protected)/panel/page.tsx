import { currentUser } from "@/lib/auth";
import AccessDenied from "@/app/AccessDenied";
import { PanelHome } from "./_components/PanelHome";
import { resolveModuleItemDest } from "@/lib/canva-embed";
import { apartadosDelPanel } from "@/lib/panel-acceso";

export default async function PanelPage() {
    const user = await currentUser();
    if (!user) return <AccessDenied />;

    // Entra quien tenga algún apartado del panel, y ve exactamente esos. Es la
    // misma cuenta que hace el menú: si el Panel le sale ahí, aquí no se le
    // puede cerrar la puerta.
    const acceso = await apartadosDelPanel(user);

    if (!acceso || acceso.items.length === 0) {
        return (
            <AccessDenied
                detalle={`portada · rol ${user.role} · equipo ${user.advisorRole ?? "—"} · apartados 0 · sesión ${user.sessionUserId.slice(0, 8)} · viendo ${user.effectiveId.slice(0, 8)}`}
            />
        );
    }

    const sections = acceso.items.map((item) => ({
        url: resolveModuleItemDest(item.url, item.customUrl),
        title: item.title,
    }));

    const adminName = user.company?.trim() || user.name?.trim() || "Administrador";

    return <PanelHome sections={sections} adminName={adminName} />;
}
