'use server'

import { currentUser } from "@/lib/auth";
import { MainTutorial } from "./_components";
import AccessDenied from "@/app/AccessDenied";

interface Props {
    searchParams: { [key: string]: string | undefined }
}

const TutorialPage = async ({ searchParams }: Props) => {
    const user = await currentUser();

    // if (!user || user?.role !== "admin") {
    //     return <AccessDenied />;
    // };

    return (
        <MainTutorial user={user} />
    );
};

export default TutorialPage;

