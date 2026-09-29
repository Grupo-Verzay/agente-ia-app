import AccessDenied from "@/app/AccessDenied";
import { currentUser } from "@/lib/auth";
import { MainEvo } from "./_components/MainEvo";
import { MOTIVO_SIN_EVOLUTION } from "@/lib/puerta-de-evolution";
import { laSesionAdministraEvolution } from "@/lib/puerta-de-evolution.server";

const EvoManagementPage = async () => {
    const user = await currentUser();

    // La MISMA puerta que `/evo` (ver `lib/puerta-de-evolution.ts`): quien
    // manda aqui es la CUENTA, no la persona.
    if (!user || !(await laSesionAdministraEvolution(user))) {
        return <AccessDenied detalle={MOTIVO_SIN_EVOLUTION} />;
    }

    return (
        <div className="p-6 space-y-6">
            <MainEvo userId={user.id} />
        </div>
    );
}

export default EvoManagementPage;
