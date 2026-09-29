import AccessDenied from "@/app/AccessDenied";
import IframeRenderer from "@/components/custom/IframeRenderer";
import { currentUser } from "@/lib/auth";
import { getEvoUrls } from "@/actions/evo-url-action";
import { MOTIVO_SIN_EVOLUTION } from "@/lib/puerta-de-evolution";
import { laSesionAdministraEvolution } from "@/lib/puerta-de-evolution.server";

const DEFAULT_EVO_URL = "https://evoapi1.ia-app.com/manager";

interface Props {
    searchParams: { slot?: string }
}

const EvoPage = async ({ searchParams }: Props) => {
    const user = await currentUser();

    // La MISMA puerta que Panel › Evo: se decide con la sesión —el rol de la
    // cuenta por la que se actúa—, no con el rol de la persona, que en el
    // equipo es `user` siempre (ver `lib/puerta-de-evolution.ts`).
    if (!user || !(await laSesionAdministraEvolution(user))) {
        return <AccessDenied detalle={MOTIVO_SIN_EVOLUTION} />;
    }

    const slot = searchParams?.slot
    // Sin slot → usa evo0; con slot → usa evoN
    const slotKey = slot ? `evo${slot}` : 'evo0'

    const result = await getEvoUrls(user.id)
    const entry = result.data?.find(t => t.name === slotKey)
    const url = entry?.description || DEFAULT_EVO_URL

    return <IframeRenderer url={url} />;
}

export default EvoPage;
