import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export async function requireAuth() {
    const session = await auth();
    if (!session?.user?.id) redirect("/login");

    const dbUser = await db.user.findUnique({
        where: { id: session.user.id },
        select: { tokenVersion: true },
    });

    const tokenVersion = (session.user as any).tokenVersion ?? 0;
    const currentVersion = dbUser?.tokenVersion ?? 0;

    if (tokenVersion !== currentVersion) {
        redirect("/logout");
    }

    return session;
}