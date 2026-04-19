// app/(dashboard)/crm/dashboard/page.tsx
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MainDashboard } from "./components/MainDashboard";

const CrmDashboardPage = async () => {
    const user = await currentUser();
    if (!user) redirect("/login");

    return <MainDashboard userId={user.id} />;
};

export default CrmDashboardPage;
