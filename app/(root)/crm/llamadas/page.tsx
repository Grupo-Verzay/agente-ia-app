import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MainDashboard } from "../dashboard/components/MainDashboard";

const LlamadasPage = async () => {
    const user = await currentUser();
    if (!user) redirect("/login");
    return <MainDashboard userId={user.effectiveId} initialView="llamadas" />;
};

export default LlamadasPage;
