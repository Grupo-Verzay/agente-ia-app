"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarraDeslizable } from "@/components/shared/BarraDeslizable";
import { cn } from "@/lib/utils";

/**
 * La barra de una pantalla de lista. **Una sola, y en un solo sitio.**
 *
 * # Qué pasaba
 *
 * Cada pantalla colocaba sus mandos donde le tocó. En Clientes el botón de
 * crear iba pegado al buscador; en Módulos había **dos `ml-auto`** peleándose
 * —uno en las pastillas y otro en el botón— así que el azul quedaba flotando
 * en mitad de la barra; en Plantillas iba al final de una fila con `flex-wrap`,
 * que en cuanto no cabía se lo llevaba a una segunda línea. Ninguna estaba
 * «mal» por su cuenta: puestas una al lado de otra, la plataforma parecía
 * cinco plataformas.
 *
 * # La regla, y no tiene excepciones
 *
 * > **A la izquierda el buscador y los filtros. A la derecha, pegado al borde,
 * > el `⋯` de acciones masivas; y justo antes, el botón azul de crear.**
 *
 * El orden no es gusto: el azul con su texto destaca solo, así que **la esquina
 * —el sitio más fácil de acertar con el ratón— se la queda el `⋯`**, que es un
 * icono pequeño y sin palabra. Es como estaba Clientes, que es de donde sale
 * el patrón.
 *
 * # Y la zona de la izquierda SE DESPLAZA, no crece ni encoge
 *
 * Es lo que impide que la barra se parta en dos filas cuando una pantalla tiene
 * buscador, dos desplegables y cuatro pastillas: lo de la izquierda vive en un
 * carril que se desplaza y lo de la derecha es `shrink-0`. Con `flex-wrap` —que
 * es lo que había en media plataforma— la barra crece hacia abajo y se come
 * justo el alto que la tabla necesita.
 *
 * El `overflow-x-auto` a secas **no bastaba**, y se vio midiendo: en
 * `/proyectos`, con el menú lateral abierto, la barra pasaba de **40 px a
 * 62 px** en cinco de las ocho combinaciones de ancho. Un carril que se
 * desplaza no impide que lo de dentro se ENCOJA: sus hijos siguen siendo
 * hijos de un flex con el ancho del carril, así que primero se comprimen
 * —y lo que lleve `flex-wrap` dentro se parte en dos líneas— y solo después
 * desbordan. Por eso van **las dos** cosas:
 *
 * 1. **El contenido no encoge**, con `min-w-max` en la fila de dentro. Es
 *    `min-w-max` y no `w-max` a propósito: con `w-max` la fila mediría siempre
 *    su contenido, y entonces un `ml-auto` —el que usa Conexión para empujar
 *    sus pastillas a la derecha— dejaría de tener hueco que repartir. Con
 *    `min-w-max` la fila sigue estirándose hasta el carril cuando sobra sitio
 *    y solo deja de encoger cuando falta.
 * 2. **Y si no cabe, se desplaza con FLECHAS**, las mismas de la barra de
 *    pestañas del panel (`BarraDeslizable`). Antes el carril llevaba
 *    `scrollbar-hide`, así que lo que sobraba —32 px en `/proyectos` a 1024,
 *    566 px en `/equipo` a 390— **no tenía ni barra ni flecha**: no había forma
 *    de enterarse de que había más, que es el fallo que ya costó una vuelta en
 *    las pestañas del panel.
 *
 * Lo que **no** entra aquí es la fila de pastillas de Chats: esa va aparte, con
 * su propia regla —los huecos de la pastilla ceden— y no pasa por esta barra.
 *
 * # Cómo se usa
 *
 * ```tsx
 * <BarraDeAcciones
 *   buscador={<Input … />}
 *   filtros={<><FiltroDeEstado /><PastillasDeMetricas … /></>}
 *   crear={<BotonDeCrear onClick={abrirDialogo}>Nuevo</BotonDeCrear>}
 *   acciones={<AccionesMasivas … />}
 * />
 * ```
 *
 * **Ninguna pantalla vuelve a escribir esta fila a mano.** Si hace falta un
 * mando nuevo, entra por uno de los cuatro huecos; si no encaja en ninguno, es
 * que el hueco hay que añadirlo aquí y sale en todas a la vez.
 *
 * # Y el buscador es un hueco APARTE, no un filtro más
 *
 * Estaba dentro de `filtros`, o sea dentro del carril que se desplaza, y eso
 * hacía que la flecha corriera **la fila entera de punta a punta**: con las
 * pastillas de una cuenta grande, desplazar para ver la última se llevaba el
 * buscador fuera de la pantalla. Y el buscador no es un mando más de la fila:
 * es el que se usa en cada visita, así que **no puede irse de sitio**.
 *
 * Ahora hay tres zonas y solo la del medio se mueve: **el buscador fijo a la
 * izquierda, las pastillas en el carril, y el azul con el `⋯` fijos a la
 * derecha**. Es lo mismo que ya hacían los dos extremos de la derecha, aplicado
 * también al extremo de la izquierda.
 */
export function BarraDeAcciones({
    buscador,
    filtros,
    crear,
    acciones,
    className,
}: {
    /**
     * El buscador. Va **fijo** a la izquierda, fuera del carril: es lo que se
     * usa siempre, así que no se desplaza con los filtros.
     */
    buscador?: ReactNode;
    /** Desplegables de filtro y pastillas. Van en el carril que se desplaza. */
    filtros?: ReactNode;
    /** El botón azul. `BotonDeCrear`, no un `Button` con clases a mano. */
    crear?: ReactNode;
    /** El `⋯`. Normalmente `AccionesMasivas`. */
    acciones?: ReactNode;
    className?: string;
}) {
    return (
        // `min-h-10` es el alto de un `Button` por defecto: la barra mide lo
        // mismo en una pantalla con botones y en una que solo tiene buscador,
        // que es la mitad de que se vean iguales.
        <div className={cn("flex min-h-10 shrink-0 flex-row items-center gap-2", className)}>
            {buscador ? <div className="flex shrink-0 items-center">{buscador}</div> : null}
            <BarraDeslizable className="flex-1" queHay="filtros">
                {/* `min-w-max`: lo de dentro no encoge, y cuando no cabe lo
                    recoge el carril con sus flechas. Ver arriba. */}
                <div className="flex min-w-max items-center gap-2">{filtros}</div>
            </BarraDeslizable>
            {crear ? <div className="flex shrink-0 items-center">{crear}</div> : null}
            {acciones ? <div className="flex shrink-0 items-center">{acciones}</div> : null}
        </div>
    );
}

/**
 * El botón azul de crear, con su forma escrita una vez.
 *
 * # Dice «Nuevo», y nada más
 *
 * Llevaba el nombre de la entidad repetido —«+ Nuevo proyecto» estando ya en
 * Proyectos, «+ Nueva plantilla» estando ya en Plantillas— y eso son hasta diez
 * caracteres que no dicen nada: **la pantalla ya dice de qué**. Y se los quita a
 * la única fila que escasea, que es justo donde los filtros pelean por sitio.
 *
 * Así que el texto es «Nuevo» en las veintiocho pantallas, sin excepciones. Si
 * alguna vez hiciera falta un segundo botón que también crea algo, entonces no
 * es «el botón de crear» de esa pantalla y no va aquí.
 *
 * En el teléfono se queda **solo con el más**: hasta la palabra sobra cuando el
 * ancho es lo único que escasea. El texto sigue llegando al lector de pantalla
 * por el `aria-label`, que sale del mismo `children` para que no se puedan
 * separar.
 */
export function BotonDeCrear({
    children,
    className,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    const etiqueta = typeof children === "string" ? children : undefined;

    return (
        <Button
            type="button"
            title={etiqueta}
            aria-label={etiqueta}
            className={cn(
                "h-10 w-10 shrink-0 gap-1.5 bg-blue-600 p-0 text-white hover:bg-blue-700 sm:w-auto sm:px-4",
                className,
            )}
            {...props}
        >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{children}</span>
        </Button>
    );
}
