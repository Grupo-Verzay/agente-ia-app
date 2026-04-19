import { UnderConstruction } from "@/components/custom";
import { MainTemplate } from "../(protected)/admin/templates/_components";
import { currentUser } from "@/lib/auth";
import { User } from "@prisma/client";

export default async function TemplatesPage() {
    const user = await currentUser() as User;

    if (!user) return;

    return (
        // <div className="flex flex-1 flex-wrap gap-4 items-center justify-center">
        //   <UnderConstruction />
        // </div>
        <MainTemplate userRole={user.role} />
    )
}