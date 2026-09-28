import AccessDenied from "@/app/AccessDenied";
import { listarPropuestasAction } from "@/actions/propuestas-actions";
import { PropuestasClient } from "./_components/PropuestasClient";

export const dynamic = "force-dynamic";

/**
 * Panel › Propuestas comerciales.
 *
 * **La página no vuelve a preguntar por el rol**: la puerta está en
 * `listarPropuestasAction` (quien administra la cuenta), y aquí solo se pinta
 * lo que devuelva. Es la misma regla que Salud del envío y Cobros: una pantalla
 * no puede abrir más de lo que la consulta deja.
 */
export default async function PropuestasPage() {
    const r = await listarPropuestasAction();
    if (!r.success) return <AccessDenied />;
    return (
        <PropuestasClient
            inicial={r.data.propuestas}
            origen={r.data.origen}
            lineas={r.data.lineas}
            esloganInicial={r.data.eslogan}
        />
    );
}
