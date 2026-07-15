import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MainCopiloto } from "./_components";

const CopilotoPage = async () => {
    const user = await currentUser();

    if (!user) {
        redirect("/login");
    }

    return <MainCopiloto />;
};

export default CopilotoPage;
