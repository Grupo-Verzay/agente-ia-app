"use client";

import type { ReactNode } from "react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { BarraDeslizable } from "@/components/shared/BarraDeslizable";
import { cn } from "@/lib/utils";

/**
 * Las métricas de una pantalla, en la BARRA DE FILTROS y no en tarjetas arriba.
 *
 * # De dónde viene
 *
 * Veintidós pantallas de lista abrían con una fila de `MetricCard` a todo lo
 * ancho —«Total», «Activos», «Vencidas»…— y debajo su barra de filtros. Esa
 * fila se llevaba **una franja entera de alto** en la pantalla donde menos
 * sobra: encima de una tabla o de un tablero, que es lo que la persona viene a
 * mirar. Y no era una sola pantalla: era el mismo bloque copiado veintidós
 * veces, así que cada una lo tenía un poco distinto —unas con `grid`, otras con
 * `flex-wrap`, unas con `mb-2` y otras sin él—.
 *
 * Las cifras siguen estando: pasan a la barra como pastillas de icono y número,
 * con su etiqueta al posar el cursor. Es la forma que ya tenía la barra de
 * Clientes (`ClientStatusPanel`), que es de donde sale el diseño.
 *
 * # Quién decide qué
 *
 * **Este componente decide cómo se ve una métrica; la pantalla decide cuáles
 * son.** Es la única razón por la que esto no son veintidós implementaciones:
 * el día que se afine el alto, el color o el tooltip se afina aquí y salen
 * todas. Y `ModuleToolbar` acepta `metricas`, así que las pantallas que usan la
 * barra compartida tampoco eligen **dónde** se colocan.
 *
 * # Las tres reglas de una pastilla
 *
 * 1. **Si la pantalla tiene un filtro equivalente, la pastilla filtra.** Se
 *    pasa `alPulsar` y entonces es un `<button>` con su estado activo. Sin
 *    `alPulsar` es un `<span>`: **nada que no haga nada se pinta como
 *    pulsable**, que es lo que enseña a no pulsar el resto.
 * 2. **Lo que ya está en la barra no se repite.** `sinLasQueYaEstan` quita por
 *    `clave` las que la barra ya pinta por su cuenta — en Clientes las cuatro
 *    de `ClientStatusPanel`. Dos pastillas con el mismo número una al lado de
 *    la otra no son redundancia: son dos cifras que alguien va a comparar.
 * 3. **La etiqueta va en el tooltip, no al lado del número.** Con la etiqueta
 *    escrita, cinco pastillas ocupan más que la fila de tarjetas que vienen a
 *    quitar. El icono es lo que se reconoce de un vistazo; el nombre exacto se
 *    consulta, y para eso basta posar el cursor.
 *
 * # Y una métrica que no filtra NADA no se pinta: se borra
 *
 * La primera vuelta admitía una pastilla sin `alPulsar` —un `<span>` sin
 * aspecto de mando— para las cifras que ninguna pantalla podía filtrar. Eso
 * sigue valiendo para un dato que acompaña a los que sí filtran, pero **un
 * total suelto que no lleva a ninguna parte se quita del todo**: ocupa sitio
 * en la única fila que escasea, no contesta ninguna pregunta que la lista de
 * abajo no conteste ya, y enseña a no mirar las de al lado.
 *
 * # `enElTelefono`: la excepción, y por qué es opt-in
 *
 * Las pastillas van `hidden sm:flex` **a propósito**: son cifras que la lista
 * de abajo ya contesta, y en un teléfono la barra ya va justa con el buscador y
 * el botón de crear. Esa sigue siendo la regla.
 *
 * Lo que `enElTelefono` abre es el caso contrario, el mismo por el que las dos
 * pastillas de Reuniones se escribieron a mano: **cuando la pastilla es la
 * única forma de llegar a algo**, esconderla en el teléfono es quitar la
 * función, no ahorrar sitio. En el marcador de Llamadas las tres pastillas son
 * el filtro de dirección del historial, y su renglón ya se desplaza, así que no
 * le quitan ancho a nada. Va **opt-in y con su motivo escrito en quien la
 * pasa**: en las veintidós pantallas que no la pasan no cambia nada.
 *
 * # `deslizable`: la barra no crece, se desplaza
 *
 * Una fila de pastillas dentro de una barra que ya lleva buscador y botones se
 * sale por el borde en cuanto la ventana se estrecha. Con `deslizable` el grupo
 * va dentro de `BarraDeslizable`, el mismo carril con flechas de las pestañas
 * del panel: lo que no cabe **se desplaza**, y la barra conserva su alto. Sin
 * él, el grupo es `shrink-0` y empuja — que es lo que hacía la fila de
 * tarjetas, una franja entera de más.
 */
export type Metrica = {
    /** Identifica la métrica. Es la llave con la que se quitan las repetidas. */
    clave: string;
    icono: ReactNode;
    /** Lo que se lee al posar el cursor. */
    etiqueta: string;
    valor: number | string;
    /** Hex de 6 dígitos (`#22C55E`). Sin él, la pastilla va en tono neutro. */
    color?: string;
    /** La explicación larga de la tarjeta, si la tenía. Se suma al tooltip. */
    ayuda?: string;
    /** Solo cuando la pantalla YA tiene un filtro equivalente. */
    alPulsar?: () => void;
    /** Para pintarla puesta cuando ese filtro está activo. */
    activa?: boolean;
};

/**
 * Quita las métricas que la barra ya pinta por su cuenta.
 *
 * Se compara por `clave` y no por etiqueta: dos pantallas pueden llamar «Total»
 * a cosas distintas, y el texto además se traduce y se retoca.
 */
export function sinLasQueYaEstan(metricas: Metrica[], claves: string[]): Metrica[] {
    const yaEstan = new Set(claves);
    return metricas.filter((m) => !yaEstan.has(m.clave));
}

export function PastillasDeMetricas({
    metricas,
    className,
    deslizable = false,
    enElTelefono = false,
}: {
    metricas: Metrica[];
    className?: string;
    /** El grupo va en un carril con flechas en vez de empujar la barra. */
    deslizable?: boolean;
    /**
     * También en el teléfono. Solo donde la pastilla es la única forma de
     * llegar a lo que filtra; ver la explicación de arriba.
     */
    enElTelefono?: boolean;
}) {
    if (metricas.length === 0) return null;

    // Sin `enElTelefono` manda la regla de siempre: escondido, y `sm:` lo
    // enseña. Con él se pinta desde el primer píxel — y hay que escribir el
    // `display` bueno, no solo quitar el `hidden`: `sm:flex` a secas deja la
    // fila en `block` por debajo de 640 y las pastillas salen apiladas.
    const enReposo = (mostrado: string) => (enElTelefono ? mostrado : "hidden");

    return (
        // El `TooltipProvider` va AQUÍ y no se da por supuesto en la pantalla:
        // Radix revienta si un `Tooltip` no tiene provider encima, y de las
        // veintidós pantallas que pintan pastillas solo unas pocas lo montaban.
        // Anidarlo donde ya existe es inofensivo —manda el de dentro— y ahorra
        // tener que acordarse en cada una; olvidarlo sería una pantalla en
        // blanco, no un tooltip que no sale.
        <TooltipProvider delayDuration={120}>
            {/* En el teléfono no caben: son las mismas cifras que las tarjetas,
                que también se saltaban en móvil (`hidden sm:flex`). Ahí la barra
                ya va justa con el buscador y el botón de crear. La excepción
                —`enElTelefono`— está explicada arriba. */}
            {deslizable ? (
                <BarraDeslizable className={cn(enReposo("block"), "sm:block", className)}>
                    <div className="flex w-max items-center gap-1">
                        {metricas.map((m) => (
                            <Pastilla key={m.clave} metrica={m} />
                        ))}
                    </div>
                </BarraDeslizable>
            ) : (
                <div className={cn(enReposo("flex"), "shrink-0 items-center gap-1 sm:flex", className)}>
                    {metricas.map((m) => (
                        <Pastilla key={m.clave} metrica={m} />
                    ))}
                </div>
            )}
        </TooltipProvider>
    );
}

function Pastilla({ metrica }: { metrica: Metrica }) {
    const { icono, etiqueta, valor, color, ayuda, alPulsar, activa } = metrica;

    // El color solo se acepta en hex de 6 dígitos porque se le añade alfa
    // pegando dos caracteres al final. Es la misma comprobación que hacía
    // `MetricCard`, y sin ella un `rgb(...)` o un nombre de color salían como
    // `rgb(...)52`, que el navegador descarta entero y deja la pastilla sin
    // borde ni fondo.
    const hexValido = /^#[0-9A-Fa-f]{6}$/.test(color ?? "");
    const conAlfa = (alfa: string) => (hexValido ? `${color}${alfa}` : undefined);

    const contenido = (
        <>
            <span
                className="flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:h-3.5 [&_svg]:w-3.5"
                style={hexValido ? { color } : undefined}
            >
                {icono}
            </span>
            <span className="text-xs font-semibold tabular-nums">{valor}</span>
        </>
    );

    // Alto 9 (36 px) para que quede a la altura de los `Button size="sm"` que ya
    // viven en estas barras. `tabular-nums` para que un contador que sube de 9 a
    // 10 no mueva la pastilla de al lado.
    const comun = cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2",
        activa ? "border-current" : "border-input",
    );

    const disparador = alPulsar ? (
        <button
            type="button"
            onClick={alPulsar}
            aria-pressed={activa ?? false}
            aria-label={etiqueta}
            className={cn(
                comun,
                "bg-background transition-colors hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
            style={activa && hexValido ? { borderColor: conAlfa("99"), backgroundColor: conAlfa("14") } : undefined}
        >
            {contenido}
        </button>
    ) : (
        // Sin filtro equivalente: ni `hover`, ni cursor de mano, ni `button`.
        // Es un dato que se lee, no un mando.
        <span className={cn(comun, "bg-muted/30 text-muted-foreground")} aria-label={etiqueta}>
            {contenido}
        </span>
    );

    return (
        <Tooltip>
            <TooltipTrigger asChild>{disparador}</TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-56 text-xs">
                <p className="font-medium">{etiqueta}</p>
                {ayuda && <p className="mt-0.5 text-muted-foreground">{ayuda}</p>}
            </TooltipContent>
        </Tooltip>
    );
}
