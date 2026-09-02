import { currentUser } from "@/lib/auth";
import AccessDenied from "@/app/AccessDenied";
import { PanelHome } from "../panel/_components/PanelHome";
import { resolveModuleItemDest } from "@/lib/canva-embed";
import { apartadosDelPanel } from "@/lib/panel-acceso";

/**
 * La portada del panel del ADMINISTRADOR.
 *
 * Existe aparte de /panel porque los dos roles lo compartían, y con una sola
 * fila de módulo no había forma de recortarle apartados a un administrador sin
 * quitárselos también al superadministrador.
 *
 * No decide nada por su cuenta: `apartadosDelPanel` resuelve por rol qué panel
 * le toca a quien entra y qué apartados puede abrir, la misma regla que arma el
 * menú. Así, si el Panel le sale en el menú, aquí no se le cierra la puerta.
 *
 * Mientras nadie haya creado el módulo /panel-admin, esta página muestra los
 * apartados de /panel: es el respaldo que evita dejar a los administradores sin
 * portada entre que sale el código y alguien lo configura.
 */
export default async function PanelAdminPage() {
    const user = await currentUser();
    if (!user) return <AccessDenied />;

    const acceso = await apartadosDelPanel(user);

    if (!acceso || acceso.items.length === 0) {
        return (
            <AccessDenied
                detalle={`portada admin · rol ${user.role} · equipo ${user.advisorRole ?? "—"} · apartados 0 · sesión ${user.sessionUserId.slice(0, 8)} · viendo ${user.effectiveId.slice(0, 8)}`}
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
