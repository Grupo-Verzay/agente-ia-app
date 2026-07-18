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
            <MainEvo userId={user.id} />
        </div>
    );
}

export default EvoManagementPage;
