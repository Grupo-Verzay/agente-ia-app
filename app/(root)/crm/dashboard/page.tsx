import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MainDashboard } from "./components/MainDashboard";

const CrmDashboardPage = async ({ searchParams }: { searchParams: { view?: string } }) => {
    const user = await currentUser();
    if (!user) redirect("/login");

    const view = searchParams.view;
    const initialView =
        view === "kanban" ? "kanban" :
        view === "registros" ? "registros" :
        undefined;

    return <MainDashboard userId={user.id} initialView={initialView} />;
};

export default CrmDashboardPage;
