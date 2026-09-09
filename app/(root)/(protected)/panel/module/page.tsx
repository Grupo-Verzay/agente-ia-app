'use server'

import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { getAllModules } from "@/actions/module-actions";
import { MainModule } from "./_components";
import AccessDenied from "@/app/AccessDenied";
import type { ModuleWithItems } from "@/schema/module";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";

const ModulePage = async () => {
    const user = await currentUser();

    // Quien manda aqui es la CUENTA, no la persona: su administrador actua por
    // ella (ver `lib/cuenta-que-manda.ts`). Con su propio rol —`user`— esta
    // pantalla le contestaba «Acceso Denegado» aunque el menu se la enseñara.
    const cuenta = user ? await cuentaQueManda(user) : null;
    if (!user || !cuenta || !isAdminLike(cuenta.role)) {
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
