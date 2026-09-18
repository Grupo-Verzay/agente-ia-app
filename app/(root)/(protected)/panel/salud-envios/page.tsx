import AccessDenied from "@/app/AccessDenied";
import { leerLaSaludDelEnvio } from "@/actions/salud-del-envio-actions";
import { SaludDelEnvioClient } from "./_components/SaludDelEnvioClient";

/**
 * Salud del envío: qué mandó la plataforma sola y qué se quedó por el camino.
 *
 * **La página no vuelve a preguntar por el rol.** La puerta está en
 * `leerLaSaludDelEnvio`, que devuelve `null` a quien no pueda verla; aquí solo
 * se pinta lo que devuelva. Es la misma regla que ya rige en Analíticas y en
 * Cobros: una pantalla no puede abrir más de lo que la consulta deja, y dos
 * condiciones para la misma pantalla es como acaba saliendo a trozos.
 */
export default async function SaludDeEnviosPage() {
    const vista = await leerLaSaludDelEnvio({ dias: 7 });
    if (!vista) return <AccessDenied />;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="border-b p-4">
                <h1 className="text-lg font-semibold">Salud del envío</h1>
                <p className="text-sm text-muted-foreground">
                    Los mensajes que la plataforma manda sola —cobros, desconexiones, facturación,
                    prueba de 7 días e informe semanal—, con lo único que no se puede fingir: si
                    salieron.
                </p>
            </div>
            <div className="min-h-0 flex-1">
                <SaludDelEnvioClient inicial={vista} />
            </div>
        </div>
    );
}
