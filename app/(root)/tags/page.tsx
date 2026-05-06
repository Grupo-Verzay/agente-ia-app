import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listTagsAction } from "@/actions/tag-actions";
import { TagsPageClient } from "./components/TagsPageClient";

export default async function TagsPage() {
    const user = await currentUser();

    if (!user) {
        redirect("/login");
    }

    const tagsRes = await listTagsAction(user.id);
    const allTags = tagsRes.data ?? [];

    return (
        <TagsPageClient
            userId={user.id}
            allTags={allTags.map((t) => ({
                id: t.id,
                name: t.name,
                slug: t.slug,
                color: t.color ?? null,
                order: t.order,
            }))}
        />
    );
}
