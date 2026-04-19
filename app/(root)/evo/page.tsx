import AccessDenied from "@/app/AccessDenied";
import IframeRenderer from "@/components/custom/IframeRenderer";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";

const MultiagentePage = async () => {
    const user = await currentUser();
    const url = "https://evoapi1.ia-app.com/manager";

    if (!user || !isAdminLike(user.role)) {
        return <AccessDenied />;
    };

    return <IframeRenderer url={url} />;
}

export default MultiagentePage;
