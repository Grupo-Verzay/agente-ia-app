'use server'

import { MainDocumentation } from "./_components";
import { leerMiOrdenAction } from "@/actions/orden-propio-actions";

import { BookOpen, Megaphone, Play, Plug } from 'lucide-react'

interface Props {
    searchParams: { [key: string]: string | undefined }
}

const DocumentationPage = async ({ searchParams }: Props) => {
    // const user = await currentUser();

    // if (!user || user?.role !== "admin") {
    //     return <AccessDenied />;
    // };

    // Orden de PARTIDA de izquierda a derecha: Actualizaciones, Tutoriales,
    // Guías y Meta. Cada persona puede reordenarlas arrastrando; el `id` es lo
    // que se guarda, no el título (`TARJETAS_DE_LA_PORTADA`).
    // Cada tarjeta lleva su color escrito (`accent`): con el color sacado del
    // índice, reordenar las tarjetas les cambiaba el color a todas.
    // «Plantillas IA» se quitó de aquí; su pantalla (/templates) sigue existiendo.
    const modules = [
        {
            id: "actualizaciones",
            title: "Actualizaciones",
            description: "Publica un aviso con video o documento que ve cada usuario al entrar.",
            icon: <Megaphone />,
            href: "/documentation/actualizaciones",
            buttonLabel: "Ir a Actualizaciones",
            accent: "#F97316",
        },
        {
            id: "tutoriales",
            title: "Administrador tutoriales",
            description: "Gestión de videos tutoriales por modulo.",
            icon: <Play />,
            href: "/documentation/tutorial",
            buttonLabel: "Ir a Tutoriales",
            accent: "#3B82F6",
        },
        {
            id: "guias",
            title: "Administrador guías",
            description: "Gestion de documentación/manuales de usuario.",
            icon: <BookOpen />,
            href: "/documentation/guide",
            buttonLabel: "Ir a Guías",
            accent: "#22C55E",
        },
        {
            id: "meta",
            title: "Conexión API de Meta",
            description: "Paso a paso para obtener tus credenciales y conectar WhatsApp, Facebook e Instagram.",
            icon: <Plug />,
            href: "/documentation/meta",
            buttonLabel: "Ver guía",
            accent: "#0866FF",
        },
    ];

    // El orden en que ESTA persona las dejó (se arrastran, como en Módulos).
    // Leído aquí para no pintarlas en un orden y moverlas al instante; si no
    // se puede leer, salen en el de siempre.
    const orden = await leerMiOrdenAction("doc-portada");

    return <MainDocumentation modules={modules} ordenInicial={orden.success ? orden.data : {}} />
};

export default DocumentationPage;

