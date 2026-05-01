import AccessDenied from "@/app/AccessDenied";
import IframeRenderer from "@/components/custom/IframeRenderer";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { getEvoUrls } from "@/actions/evo-url-action";

const DEFAULT_EVO_URL = "https://evoapi1.ia-app.com/manager";

interface Props {
    searchParams: { slot?: string }
}

const EvoPage = async ({ searchParams }: Props) => {
    const user = await currentUser();

    if (!user || !isAdminLike(user.role)) {
        return <AccessDenied />;
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
