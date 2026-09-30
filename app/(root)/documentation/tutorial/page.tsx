'use server'

import { currentUser } from "@/lib/auth";
import { MainTutorial } from "./_components";
import { leerMiOrdenAction } from "@/actions/orden-propio-actions";

interface Props {
    searchParams: { [key: string]: string | undefined }
}

const TutorialPage = async ({ searchParams }: Props) => {
    const user = await currentUser();

    // Sin sesion no hay nada que enseñar aqui.
    if (!user) return null;

    // El orden en que ESTA persona dejó las tarjetas (se arrastran).
    const orden = await leerMiOrdenAction("tutoriales");

    return (
        <MainTutorial user={user} ordenInicial={orden.success ? orden.data : {}} />
    );
};

export default TutorialPage;

