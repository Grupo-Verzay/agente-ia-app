import AccessDenied from "@/app/AccessDenied";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { MainEvo } from "./_components/MainEvo";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";

const EvoManagementPage = async () => {
    const user = await currentUser();

    // Quien manda aqui es la CUENTA, no la persona: su administrador actua por
    // ella (ver `lib/cuenta-que-manda.ts`). Con su propio rol —`user`— esta
    // pantalla le contestaba «Acceso Denegado» aunque el menu se la enseñara.
    const cuenta = user ? await cuentaQueManda(user) : null;
    if (!user || !cuenta || !isAdminLike(cuenta.role)) {
        return <AccessDenied />;
    }

    return (
        <div className="p-6 space-y-6">
            <MainEvo userId={user.id} />
        </div>
    );
}

export default EvoManagementPage;
