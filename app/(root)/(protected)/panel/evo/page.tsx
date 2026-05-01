import AccessDenied from "@/app/AccessDenied";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { MainEvo } from "./_components/MainEvo";

const EvoManagementPage = async () => {
    const user = await currentUser();

    if (!user || !isAdminLike(user.role)) {
        return <AccessDenied />;
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Gestión de servidores EVO</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Configura hasta 5 servidores EVO. Cada uno estará disponible como ruta en el módulo manager.
                </p>
            </div>
            <MainEvo userId={user.id} />
        </div>
    );
}

export default EvoManagementPage;
