import { currentUser } from "@/lib/auth";
import SendMessageCard from "./_components/SendMessageCard";
import { redirect } from "next/navigation";


interface PageProps {
    params: { id?: string };
    searchParams: { [key: string]: string | string[] | undefined };
}

const MessagePage = async ({ searchParams }: PageProps) => {
    const user = await currentUser();

    if (!user) {
        redirect("/login");
    }

    return (
        <div className="flex p-4 justify-center items-center">
            <SendMessageCard user={user} />
        </div>
    )

};

export default MessagePage;
