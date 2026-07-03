'use server'

import { currentUser } from "@/lib/auth";
import { MainDocumentation } from "./_components";
import AccessDenied from "@/app/AccessDenied";

import { BookOpen, FileCog, Play, Plug } from 'lucide-react'

interface Props {
    searchParams: { [key: string]: string | undefined }
}

const DocumentationPage = async ({ searchParams }: Props) => {
    // const user = await currentUser();

    // if (!user || user?.role !== "admin") {
    //     return <AccessDenied />;
    // };

    const modules = [
        {
            title: "Administrador tutoriales",
            description: "Gestión de videos tutoriales por modulo.",
            icon: <Play className="text-red-600" />,
            href: "/documentation/tutorial",
            buttonLabel: "Ir a Tutoriales",
        },
        {
            title: "Administrador guías",
            description: "Gestion de documentación/manuales de usuario.",
            icon: <BookOpen className="text-blue-600" />,
            href: "/documentation/guide",
            buttonLabel: "Ir a Guías",
        },
        {
            title: "Plantillas IA",
            description: "Crea y gestiona plantillas para prompts personalizados.",
            icon: <FileCog className="text-teal-600" />,
            href: "/templates",
            buttonLabel: "Ir a Plantillas",
        },
        {
            title: "Conexión API de Meta",
            description: "Paso a paso para obtener tus credenciales y conectar WhatsApp, Facebook e Instagram.",
            icon: <Plug className="text-[#0866FF]" />,
            href: "/documentation/meta",
            buttonLabel: "Ver guía",
            accent: "#0866FF",
        },
    ];

    return <MainDocumentation modules={modules} />
};

export default DocumentationPage;

