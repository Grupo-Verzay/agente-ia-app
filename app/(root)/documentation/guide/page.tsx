'use server'

import { currentUser } from "@/lib/auth";
import { MainGuide } from "./_components";
import { mandaEnLaCasaDeVerdad } from "@/lib/mando-de-la-casa";
import { EditarIntroduccionDeLaGuia } from "./_components/EditarIntroduccionDeLaGuia";
import { MODULOS_CON_GUIA, NOMBRE_DE_LA_GUIA } from "@/lib/introduccion-de-la-guia";
import { leerMiOrdenAction } from "@/actions/orden-propio-actions";

interface Props {
    searchParams: { [key: string]: string | undefined }
}

const GuidePage = async ({ searchParams }: Props) => {
    const user = await currentUser();

    // Sin sesion no hay nada que enseñar aqui.
    if (!user) return null;

    // Las guías públicas (`/guia/<modulo>`) son de la CASA: solo quien manda
    // en la plataforma edita su introducción. La puerta está en la acción.
    const manda = await mandaEnLaCasaDeVerdad(user);
    if (!manda) return <MainGuide user={user} />;

    // Una fila por guía que deja la IA. Se arrastran para ponerlas en el orden
    // de cada persona, así que cada una va con su id y su nombre (para el
    // buscador) y la fila ya pintada.
    const guiasPublicas = MODULOS_CON_GUIA.map((modulo) => ({
        id: modulo,
        nombre: NOMBRE_DE_LA_GUIA[modulo],
        nodo: <EditarIntroduccionDeLaGuia key={modulo} modulo={modulo} conAsa nombre={NOMBRE_DE_LA_GUIA[modulo]} />,
    }));
    const orden = await leerMiOrdenAction("guias-publicadas");

    return <MainGuide user={user} guiasPublicas={guiasPublicas} ordenInicial={orden.success ? orden.data : {}} />;
};

export default GuidePage;
