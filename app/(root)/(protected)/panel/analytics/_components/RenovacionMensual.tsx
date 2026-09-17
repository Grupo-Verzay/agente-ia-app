import { RefreshCw, Clock } from "lucide-react";
import {
    nombreDelMes,
    resumirLaRenovacion,
    type VistaDeLaRenovacion,
} from "@/lib/renovacion-mensual";

/**
 * De las cuentas que vencían el mes pasado, cuántas siguieron.
 *
 * Los ingresos mensuales dicen cuánto entró; esto dice **si se está fugando
 * gente**, que es lo que no se ve hasta que ya pasó: la cuenta que no paga se
 * desactiva y al mes se elimina, y hoy uno se entera mirando una por una.
 *
 * Va junto a las otras dos tarjetas internas, dentro del contenedor que
 * scrollea de `VerzayAnalytics`. La puerta no está aquí: la consulta devuelve
 * `null` a quien no pueda verla (`puedeVerLaAnaliticaDeLaCasa`).
 *
 * **Lo que más importa de este componente es lo que NO hace**: cuando el mes
 * no tiene cohorte completa no enseña un porcentaje. Un 0 % ahí no diría «se
 * fueron todos», diría «no lo sabemos», y las dos cosas no se pueden pintar
 * igual. La lista sí se enseña, que esa es cierta.
 */
export function RenovacionMensual({ vista }: { vista: VistaDeLaRenovacion }) {
    if (!vista.mes) {
        return (
            <Marco>
                <SinDatos>
                    Todavía no hay ningún mes anotado. La cohorte se empieza a guardar con el
                    trabajo diario de facturación; el primer mes completo se podrá medir el mes
                    que viene.
                </SinDatos>
            </Marco>
        );
    }

    const r = resumirLaRenovacion(vista.mes);

    return (
        <Marco mes={nombreDelMes(r.mes)}>
            {r.total === 0 ? (
                <SinDatos>
                    {r.parcial
                        ? "Ese mes empezó antes de que se guardara la cohorte, así que no hay nada anotado de él."
                        : "Ese mes no vencía ninguna cuenta."}
                </SinDatos>
            ) : (
                <>
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        {r.porcentaje === null ? (
                            // El hueco del número, con el motivo en su sitio. Un
                            // guion suelto no explica nada y un 0 % miente.
                            <span className="flex items-center gap-2 text-amber-600">
                                <Clock className="h-5 w-5 shrink-0" />
                                <span className="font-medium">Todavía no se puede medir</span>
                            </span>
                        ) : (
                            <>
                                <span className="text-4xl font-semibold tabular-nums">
                                    {r.porcentaje}%
                                </span>
                                <span className="text-sm text-muted-foreground">
                                    renovaron · {r.renovaron} de {r.total}
                                </span>
                            </>
                        )}
                    </div>

                    {r.parcial && (
                        <p className="mt-2 text-xs text-muted-foreground">
                            De este mes solo se conocen las cuentas que <strong>no</strong>{" "}
                            renovaron: su vencimiento se quedó donde estaba y por eso se pueden
                            deducir. Las que sí renovaron no dejaron rastro —al cobrar, la fecha
                            de vencimiento se pisa— así que no hay con qué dividir. Desde el
                            primer mes entero anotado sale el porcentaje.
                        </p>
                    )}

                    {r.seFueronEstas.length > 0 ? (
                        <div className="mt-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                            <p className="mb-2 text-sm font-medium">
                                No renovaron ({r.seFueron})
                            </p>
                            <table className="w-full min-w-[32rem] text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs text-muted-foreground">
                                        <th className="py-2 pr-3 font-medium">Cuenta</th>
                                        <th className="py-2 pr-3 font-medium">Correo</th>
                                        <th className="py-2 font-medium">Vencía</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {r.seFueronEstas.map((c) => (
                                        <tr key={c.userId} className="border-b last:border-0">
                                            <td className="py-2 pr-3">
                                                <span
                                                    className="block max-w-[14rem] truncate"
                                                    title={c.nombre ?? c.userId}
                                                >
                                                    {c.nombre?.trim() || "Sin nombre"}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-3 text-muted-foreground">
                                                <span
                                                    className="block max-w-[16rem] truncate"
                                                    title={c.correo ?? ""}
                                                >
                                                    {c.correo?.trim() || "—"}
                                                </span>
                                            </td>
                                            <td className="py-2 tabular-nums text-muted-foreground">
                                                {enFecha(c.fechaDeVencimiento)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="mt-2 text-xs text-muted-foreground">
                                El nombre y el correo se guardan al anotar la cohorte, así que la
                                fila sigue aquí aunque la cuenta ya se haya eliminado.
                            </p>
                        </div>
                    ) : (
                        <p className="mt-3 text-sm text-muted-foreground">
                            No se fue ninguna: las {r.total} renovaron.
                        </p>
                    )}
                </>
            )}
        </Marco>
    );
}

function Marco({ mes, children }: { mes?: string; children: React.ReactNode }) {
    return (
        // `shrink-0` por lo mismo que las tarjetas hermanas: en una columna flex
        // que scrollea, un hijo con una tabla dentro se aplasta.
        <section className="shrink-0 rounded-xl border bg-card p-4 sm:p-5">
            <header className="mb-4 flex flex-wrap items-center gap-2">
                <RefreshCw className="h-[21px] w-[21px] shrink-0 text-muted-foreground" />
                <h2 className="text-[19px] font-semibold">Renovación mensual</h2>
                <span className="text-xs text-muted-foreground">
                    {mes ? `${mes} · interno` : "interno"}
                </span>
            </header>
            {children}
        </section>
    );
}

function SinDatos({ children }: { children: React.ReactNode }) {
    return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** El día, sin hora: lo que interesa de un vencimiento es la fecha. */
function enFecha(iso: string): string {
    return new Date(iso).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    });
}
