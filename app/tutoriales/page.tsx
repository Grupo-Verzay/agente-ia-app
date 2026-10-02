import { CentroDeAyuda } from "@/components/ayuda/CentroDeAyuda";
import { RUTA_PUBLICA_DE_TUTORIALES } from "@/lib/centro-de-ayuda";
import { lasGuiasDelCentroDeAyuda } from "@/lib/guias-del-centro-de-ayuda";

/** La portada pública de tutoriales: el centro de ayuda de `/ayuda`, sin cuenta. */
export default function TutorialesPage() {
    return <CentroDeAyuda guias={lasGuiasDelCentroDeAyuda()} raiz={RUTA_PUBLICA_DE_TUTORIALES} titulo="Tutoriales" />;
}
