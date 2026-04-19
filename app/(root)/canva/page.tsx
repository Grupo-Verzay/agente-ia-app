import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MainCanva } from "./_components";

const CanvaPage = async () => {
    const user = await currentUser();

    if (!user) {
        redirect("/login");
    }

    return <MainCanva />;
};

export default CanvaPage;