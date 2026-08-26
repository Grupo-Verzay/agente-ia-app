import { UnderConstruction } from "@/components/custom/UnderConstruction";
import { MainTemplate } from "../(protected)/admin/templates/_components";
import { currentUser } from "@/lib/auth";

export default async function TemplatesPage() {
    const user = await currentUser();

    if (!user) return;

    return (
        // <div className="flex flex-1 flex-wrap gap-4 items-center justify-center">
        //   <UnderConstruction />
        // </div>
        <MainTemplate userRole={user.role} />
    )
}