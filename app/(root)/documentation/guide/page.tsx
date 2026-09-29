'use server'

import { currentUser } from "@/lib/auth";
import { MainGuide } from "./_components";
import AccessDenied from "@/app/AccessDenied";
import { mandaEnLaCasaDeVerdad } from "@/lib/mando-de-la-casa";
import { EditarIntroduccionDeLaGuia } from "./_components/EditarIntroduccionDeLaGuia";

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

    // Las guías públicas (`/guia/<modulo>`) son de la CASA: solo quien manda
    // en la plataforma edita su introducción. La puerta está en la acción.
    const manda = await mandaEnLaCasaDeVerdad(user);
    if (!manda) return <MainGuide user={user} />;

    return (
        <div className="flex flex-col gap-2">
            <div className="px-4 pt-4">
                <EditarIntroduccionDeLaGuia modulo="leads" nombre="Leads" />
            </div>
            <MainGuide user={user} />
        </div>
    );
};

export default GuidePage;

