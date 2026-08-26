'use server'

import { currentUser } from "@/lib/auth";
import { MainGuide } from "./_components";
import AccessDenied from "@/app/AccessDenied";

interface Props {
    searchParams: { [key: string]: string | undefined }
}

const GuidePage = async ({ searchParams }: Props) => {
    const user = await currentUser();

    // if (!user || user?.role !== "admin") {
    //     return <AccessDenied />;
    // };

    // Sin sesion no hay nada que enseñar aqui.
    if (!user) return null;

    return (
        <MainGuide user={user} />
    );
};

export default GuidePage;

