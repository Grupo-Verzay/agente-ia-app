import { redirect } from "next/navigation";

import { elEnlaceDeTutoriales } from "@/lib/tutoriales-de-la-landing";

/**
 * `/tutoriales/<categoria>`: la misma categoría, abierta dentro de la sección
 * de tutoriales de la landing (`/inicio#tutoriales/<categoria>`). Una que no
 * existe lleva a la portada de tutoriales.
 */
export default function CategoriaDeTutorialesPage({ params }: { params: { categoria: string } }) {
    redirect(elEnlaceDeTutoriales(params.categoria));
}
