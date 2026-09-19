"use client";

import type { ReactNode } from "react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
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
}: {
    metricas: Metrica[];
    className?: string;
}) {
    if (metricas.length === 0) return null;

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
                ya va justa con el buscador y el botón de crear. */}
            <div className={cn("hidden shrink-0 items-center gap-1 sm:flex", className)}>
                {metricas.map((m) => (
                    <Pastilla key={m.clave} metrica={m} />
                ))}
            </div>
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
