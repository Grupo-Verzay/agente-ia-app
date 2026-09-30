'use server'

import { currentUser } from "@/lib/auth";
import { MainGuide } from "./_components";
import AccessDenied from "@/app/AccessDenied";
import { mandaEnLaCasaDeVerdad } from "@/lib/mando-de-la-casa";
import { EditarIntroduccionDeLaGuia } from "./_components/EditarIntroduccionDeLaGuia";
import { MODULOS_CON_GUIA, NOMBRE_DEL_MODULO } from "@/lib/introduccion-de-la-guia";

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
            {/* Una tarjeta por guía pública, sacadas de la MISMA lista que decide
                qué módulo tiene guía: con los módulos escritos aquí a mano, una
                guía nueva quedaría sin forma de editar su introducción. */}
            <div className="flex flex-col gap-2 px-4 pt-4">
                {MODULOS_CON_GUIA.map((m) => (
                    <EditarIntroduccionDeLaGuia key={m} modulo={m} nombre={NOMBRE_DEL_MODULO[m]} />
                ))}
            </div>
            <MainGuide user={user} />
        </div>
    );
};

export default GuidePage;

