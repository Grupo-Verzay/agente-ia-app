// app/(dashboard)/crm/page.tsx
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MainCrm } from "./components/MainCrm";
import { listTagsAction } from "@/actions/tag-actions";

interface PageProps {
    params: { id?: string };
    searchParams: { [key: string]: string | string[] | undefined };
}

const CrmPage = async ({ searchParams }: PageProps) => {
    const user = await currentUser();

    if (!user) {
        redirect("/login");
    }

    // si quieres filtrar por ?status=true/false en la URL:
    // const rawStatus = searchParams.status;
    // const status =
    //     rawStatus === "true"
    //         ? true
    //         : rawStatus === "false"
    //             ? false
    //             : undefined;

    const tagsRes = await listTagsAction(user.id);

    const allTags =
        tagsRes.data?.map((t) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
            color: t.color,
            order: t.order ?? 0,
            sessionCount: t._count?.sessionTags ?? 0,

        })) ?? [];

    return <MainCrm userId={user.id} allTags={allTags} />

};

export default CrmPage;
