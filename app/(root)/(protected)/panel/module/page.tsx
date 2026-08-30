'use server'

import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { getAllModules } from "@/actions/module-actions";
import { MainModule } from "./_components";
import AccessDenied from "@/app/AccessDenied";
import type { ModuleWithItems } from "@/schema/module";

const ModulePage = async () => {
    const user = await currentUser();

    if (!user || !isAdminLike(user.role)) {
        return <AccessDenied />;
    };

    // Todos los módulos de la plataforma, pedidos aquí y no heredados del menú
    // lateral. El menú va filtrado por persona —por plan, por permisos y por
    // "de los tres paneles, el que le toca"—, y con eso el editor dejaba de
    // listar los paneles que no fueran el propio: no había forma de entrar a
    // configurar el del reseller ni el del cliente. Esta pantalla es donde se
    // configuran, así que tiene que verlos todos.
    const res = await getAllModules();
    const todosLosModulos = (res.success ? res.data ?? [] : []) as ModuleWithItems[];

    return (
        <MainModule todosLosModulos={todosLosModulos} />
    );
};

export default ModulePage;
