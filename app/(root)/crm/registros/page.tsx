import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MainDashboard } from "../dashboard/components/MainDashboard";

const CrmRegistrosPage = async () => {
    const user = await currentUser();
    if (!user) redirect("/login");
    return <MainDashboard userId={user.effectiveId} initialView="registros" />;
};

export default CrmRegistrosPage;
