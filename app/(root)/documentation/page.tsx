'use server'

import { currentUser } from "@/lib/auth";
import { MainDocumentation } from "./_components";
import AccessDenied from "@/app/AccessDenied";

import { BookOpen, Megaphone, Play, Plug } from 'lucide-react'

interface Props {
    searchParams: { [key: string]: string | undefined }
}

const DocumentationPage = async ({ searchParams }: Props) => {
    // const user = await currentUser();

    // if (!user || user?.role !== "admin") {
    //     return <AccessDenied />;
    // };

    // Orden de izquierda a derecha: Actualizaciones, Tutoriales, Guías y Meta.
    // Cada tarjeta lleva su color escrito (`accent`): con el color sacado del
    // índice, reordenar las tarjetas les cambiaba el color a todas.
    // «Plantillas IA» se quitó de aquí; su pantalla (/templates) sigue existiendo.
    const modules = [
        {
            title: "Actualizaciones",
            description: "Publica un aviso con video o documento que ve cada usuario al entrar.",
            icon: <Megaphone />,
            href: "/documentation/actualizaciones",
            buttonLabel: "Ir a Actualizaciones",
            accent: "#F97316",
        },
        {
            title: "Administrador tutoriales",
            description: "Gestión de videos tutoriales por modulo.",
            icon: <Play />,
            href: "/documentation/tutorial",
            buttonLabel: "Ir a Tutoriales",
            accent: "#3B82F6",
        },
        {
            title: "Administrador guías",
            description: "Gestion de documentación/manuales de usuario.",
            icon: <BookOpen />,
            href: "/documentation/guide",
            buttonLabel: "Ir a Guías",
            accent: "#22C55E",
        },
        {
            title: "Conexión API de Meta",
            description: "Paso a paso para obtener tus credenciales y conectar WhatsApp, Facebook e Instagram.",
            icon: <Plug />,
            href: "/documentation/meta",
            buttonLabel: "Ver guía",
            accent: "#0866FF",
        },
    ];

    return <MainDocumentation modules={modules} />
};

export default DocumentationPage;

