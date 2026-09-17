import { Radio, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import {
    DIAS_DE_ACTIVIDAD,
    resumirLaActividad,
    type EstadoDeLinea,
    type VistaDeLaActividad,
} from "@/lib/actividad-de-instancias";

/**
 * Si las líneas están VIVAS, de un vistazo y sin entrar cuenta por cuenta.
 *
 * Va junto a Rendimiento de Chats, dentro del contenedor que scrollea de
 * `VerzayAnalytics` —colgarla como hermana de la pantalla la deja fuera del
 * único `div` con barra y se recorta sin forma de llegar a ella—.
 *
 * La puerta NO está aquí: `leerLaActividadDeInstancias` devuelve `null` a
 * quien no pueda verla —`puedeVerLaAnaliticaDeLaCasa`— y entonces esto ni se
 * pinta.
 *
 * **Las verdes no se listan, y es la mitad del diseño.** Una tabla con las
 * cincuenta líneas sanas dentro esconde las tres que fallan; el número verde
 * ya dice cuántas van bien, y eso es todo lo que hace falta saber de ellas.
 */
export function ActividadDeInstancias({ vista }: { vista: VistaDeLaActividad }) {
    const resumen = resumirLaActividad(vista.lineas);
    const hayLineas = resumen.total > 0;

    return (
        // `shrink-0` por lo mismo que en Rendimiento de Chats: en una columna
        // flex que scrollea, un hijo con una tabla dentro se aplasta.
        <section className="shrink-0 rounded-xl border bg-card p-4 sm:p-5">
            <header className="mb-4 flex flex-wrap items-center gap-2">
                <Radio className="h-[21px] w-[21px] shrink-0 text-muted-foreground" />
                <h2 className="text-[19px] font-semibold">Actividad de instancias</h2>
                <span className="text-xs text-muted-foreground">
                    últimos {DIAS_DE_ACTIVIDAD} días · interno
                </span>
            </header>

            {!hayLineas ? (
                // Con cero líneas no se puede decir «todo bien»: tres ceros en
                // verde, amarillo y rojo se leen como que no pasa nada malo,
                // cuando lo que pasa es que no hay nada que mirar.
                <p className="text-sm text-muted-foreground">
                    No hay ninguna línea registrada que mirar.
                </p>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Conteo
                            estado="verde"
                            n={resumen.verdes}
                            titulo="Responden"
                            detalle="Entran mensajes y la IA contesta."
                        />
                        <Conteo
                            estado="amarillo"
                            n={resumen.amarillas}
                            titulo="Sin respuesta de la IA"
                            detalle="Entran mensajes y no contestó ninguno."
                        />
                        <Conteo
                            estado="rojo"
                            n={resumen.rojas}
                            titulo="Sin actividad"
                            detalle={`Ni un mensaje en ${DIAS_DE_ACTIVIDAD} días.`}
                        />
                    </div>

                    {resumen.señaladas.length > 0 ? (
                        <div className="mt-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                            <table className="w-full min-w-[38rem] text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs text-muted-foreground">
                                        <th className="py-2 pr-3 font-medium">Cuenta</th>
                                        <th className="py-2 pr-3 font-medium">Recibidos</th>
                                        <th className="py-2 pr-3 font-medium">Respondió la IA</th>
                                        <th className="py-2 font-medium">Escribieron personas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {resumen.señaladas.map((l) => (
                                        <tr
                                            key={`${l.userId}::${l.instanceName}`}
                                            className="border-b last:border-0"
                                        >
                                            <td className="py-2 pr-3">
                                                <span className="flex items-center gap-2">
                                                    <Punto estado={l.estado} />
                                                    <span
                                                        className="block max-w-[14rem] truncate"
                                                        title={l.nombreDeCuenta}
                                                    >
                                                        {l.nombreDeCuenta}
                                                    </span>
                                                </span>
                                                {/* La línea, debajo: una cuenta puede
                                                    tener varias y sin esto no se sabe
                                                    cuál de ellas es la que falla. */}
                                                <span
                                                    className="ml-4 block max-w-[14rem] truncate text-xs text-muted-foreground"
                                                    title={l.instanceName}
                                                >
                                                    {l.nombreDeLinea}
                                                </span>
                                            </td>
                                            <td
                                                className={`py-2 pr-3 tabular-nums ${
                                                    l.recibidos === 0
                                                        ? "font-semibold text-destructive"
                                                        : ""
                                                }`}
                                            >
                                                {l.recibidos.toLocaleString("es")}
                                            </td>
                                            <td
                                                className={`py-2 pr-3 tabular-nums ${
                                                    l.respuestasIa === 0 && l.recibidos > 0
                                                        ? "font-semibold text-amber-600"
                                                        : "text-muted-foreground"
                                                }`}
                                            >
                                                {l.respuestasIa.toLocaleString("es")}
                                            </td>
                                            <td className="py-2 tabular-nums text-muted-foreground">
                                                {l.escritosPorHumanos.toLocaleString("es")}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="mt-2 text-xs text-muted-foreground">
                                Solo las que hay que mirar, las rojas primero. Una amarilla con
                                gente escribiendo es una línea atendida a mano; sin nadie, es una
                                conversación que se quedó sin responder. Los seguimientos y las
                                campañas cuentan como escritos por personas.
                            </p>
                        </div>
                    ) : (
                        <p className="mt-4 text-sm text-muted-foreground">
                            Las {resumen.total} líneas reciben mensajes y la IA contesta en todas.
                        </p>
                    )}
                </>
            )}
        </section>
    );
}

const COLORES: Record<EstadoDeLinea, { texto: string; punto: string }> = {
    verde: { texto: "text-emerald-600", punto: "bg-emerald-500" },
    amarillo: { texto: "text-amber-600", punto: "bg-amber-500" },
    rojo: { texto: "text-destructive", punto: "bg-destructive" },
};

const ICONOS: Record<EstadoDeLinea, typeof CheckCircle2> = {
    verde: CheckCircle2,
    amarillo: AlertTriangle,
    rojo: XCircle,
};

/**
 * Uno de los tres conteos grandes.
 *
 * Lleva icono además de color: el color solo no lo distingue quien no ve bien
 * el rojo del verde, que es más gente de la que parece.
 */
function Conteo({
    estado,
    n,
    titulo,
    detalle,
}: {
    estado: EstadoDeLinea;
    n: number;
    titulo: string;
    detalle: string;
}) {
    const Icono = ICONOS[estado];
    return (
        <div className="rounded-lg border p-3">
            <div className={`flex items-center gap-2 ${COLORES[estado].texto}`}>
                <Icono className="h-5 w-5 shrink-0" />
                <span className="text-2xl font-semibold tabular-nums">{n}</span>
            </div>
            <p className="mt-1 text-sm font-medium">{titulo}</p>
            <p className="text-xs text-muted-foreground">{detalle}</p>
        </div>
    );
}

function Punto({ estado }: { estado: EstadoDeLinea }) {
    return (
        <span
            className={`h-2 w-2 shrink-0 rounded-full ${COLORES[estado].punto}`}
            aria-label={estado === "rojo" ? "sin actividad" : "sin respuesta de la IA"}
        />
    );
}
