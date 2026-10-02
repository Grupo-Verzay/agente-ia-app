import { notFound } from "next/navigation";

import { GuiasDeLaCategoria } from "@/components/ayuda/GuiasDeLaCategoria";
import { RUTA_PUBLICA_DE_TUTORIALES, laCategoria, lasGuiasDeLaCategoria } from "@/lib/centro-de-ayuda";
import { lasGuiasDelCentroDeAyuda } from "@/lib/guias-del-centro-de-ayuda";

/** Las guías de una categoría, desde la landing (`/tutoriales/<categoria>`). */
export default function CategoriaDeTutorialesPage({ params }: { params: { categoria: string } }) {
    const categoria = laCategoria(params.categoria);
    if (!categoria) notFound();
    return (
        <GuiasDeLaCategoria
            categoria={categoria}
            guias={lasGuiasDeLaCategoria(lasGuiasDelCentroDeAyuda(), categoria.slug)}
            raiz={RUTA_PUBLICA_DE_TUTORIALES}
        />
    );
}
