"use client";

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Un carril que se sale de la pantalla, con flechas a los lados.
 *
 * Lo usan **las tres barras de pestañas** del panel y **la barra de acciones de
 * una lista** (`BarraDeAcciones`), que es el mismo problema con otro contenido:
 * una fila de mandos que no cabe y que no puede crecer hacia abajo. Por eso las
 * flechas dicen qué hay dentro (`queHay`) en vez de hablar siempre de pestañas.
 *
 * # Qué pasaba
 *
 * La barra del panel del súper administrador —Informes, Actividad, Operaciones,
 * Proyectos, Tickets, Diagramas, Clientes, Instancias, Analíticas, Finanzas y
 * las que vengan— **se cortaba sin decirlo**. Iba dentro de un `ScrollArea` de
 * Radix, cuya barra de desplazamiento solo aparece al pasar el cursor por
 * encima, así que lo que se veía era la última pestaña partida por el borde y
 * ninguna señal de que hubiera más: la única forma de enterarse era arrastrar
 * por si acaso. Y en un táctil, ni eso.
 *
 * # Las tres cosas que hace, y por qué cada una
 *
 * 1. **Las flechas salen solo donde hay algo.** Una flecha que no lleva a
 *    ninguna parte es ruido, y además enseña a no pulsarlas. Se recalcula al
 *    desplazar, al cambiar de tamaño la ventana **y al cambiar la lista** —las
 *    pestañas dependen de los permisos de cada persona y del plan, así que
 *    medir solo al montar deja la flecha puesta o quitada a destiempo—.
 * 2. **La pestaña activa se trae sola.** Al entrar a `/panel/finanzas` con la
 *    barra desplazada a la izquierda, su pestaña quedaba fuera de vista: la
 *    pantalla no decía dónde estabas. Y se trae **entera**, descontando el
 *    ancho de la flecha, porque una pestaña justo debajo de la flecha está
 *    «visible» y no se lee.
 * 3. **También al recibir el foco.** Tabulando con el teclado se llega a
 *    pestañas que están fuera del carril; sin esto el foco se va a un sitio
 *    invisible y parece que se perdió.
 *
 * # Y no usa `scrollIntoView`
 *
 * Es la forma corta y trae un efecto que no se quiere: desplaza **todos** los
 * antepasados, así que con la barra pegada arriba (`sticky`) la página entera
 * daba un salto vertical al cambiar de pestaña. Se calcula el `scrollLeft` y se
 * mueve solo este carril.
 */

/** Lo que se desplaza al pulsar una flecha: casi una pantalla, no toda. */
const PARTE_QUE_SE_DESPLAZA = 0.8;

/** Ancho de la flecha (36 px) más un respiro. Es el hueco que tapa. */
const HUECO_DE_LA_FLECHA = 44;

/** Un píxel de holgura: `scrollWidth` y `clientWidth` redondean distinto. */
const HOLGURA = 1;

export function BarraDeslizable({
    children,
    className,
    carrilClassName,
    /** El elemento que tiene que verse entero. Normalmente la pestaña activa. */
    activo,
    /**
     * Qué hay dentro, para lo que leen las flechas. Esto lo usan dos barras
     * —las pestañas del panel y la de acciones de una lista— y «Ver más
     * pestañas» sobre un buscador y unos filtros es una etiqueta que miente.
     */
    queHay = "pestañas",
}: {
    children: ReactNode;
    className?: string;
    carrilClassName?: string;
    activo?: HTMLElement | null;
    queHay?: string;
}) {
    const carril = useRef<HTMLDivElement>(null);
    const [hayIzquierda, setHayIzquierda] = useState(false);
    const [hayDerecha, setHayDerecha] = useState(false);

    const medir = useCallback(() => {
        const caja = carril.current;
        if (!caja) return;
        const maximo = caja.scrollWidth - caja.clientWidth;
        setHayIzquierda(caja.scrollLeft > HOLGURA);
        setHayDerecha(caja.scrollLeft < maximo - HOLGURA);
    }, []);

    useEffect(() => {
        const caja = carril.current;
        if (!caja) return;

        medir();

        // Una vuelta por fotograma: el navegador dispara `scroll` muchas más
        // veces de las que puede pintar. Es la misma regla que ya rige en la
        // lista de Chats.
        let pedido = 0;
        const alDesplazar = () => {
            if (pedido) return;
            pedido = requestAnimationFrame(() => {
                pedido = 0;
                medir();
            });
        };
        caja.addEventListener("scroll", alDesplazar, { passive: true });

        // El carril cambia de ancho con la ventana y con el menú lateral; el
        // contenido, con los permisos de cada persona. Hacen falta los dos: con
        // solo el carril, quitar una pestaña dejaba la flecha derecha puesta
        // sobre un carril que ya cabía entero.
        const observador = new ResizeObserver(medir);
        observador.observe(caja);
        const contenido = caja.firstElementChild;
        if (contenido) observador.observe(contenido);

        return () => {
            if (pedido) cancelAnimationFrame(pedido);
            caja.removeEventListener("scroll", alDesplazar);
            observador.disconnect();
        };
    }, [medir]);

    /** Trae un elemento del carril a la vista, entero y sin mover la página. */
    const traerALaVista = useCallback((elemento: HTMLElement, suave: boolean) => {
        const caja = carril.current;
        if (!caja || !caja.contains(elemento)) return;

        const borde = caja.getBoundingClientRect();
        const suyo = elemento.getBoundingClientRect();

        // El hueco solo se descuenta del lado donde de verdad hay flecha: en un
        // carril que empieza al principio no hay flecha izquierda que tape, y
        // descontarla dejaría la primera pestaña con un margen que nadie pidió.
        const tapaIzquierda = caja.scrollLeft > HOLGURA ? HUECO_DE_LA_FLECHA : 0;
        const maximo = caja.scrollWidth - caja.clientWidth;
        const tapaDerecha = caja.scrollLeft < maximo - HOLGURA ? HUECO_DE_LA_FLECHA : 0;

        const seSaleIzquierda = suyo.left - (borde.left + tapaIzquierda);
        const seSaleDerecha = suyo.right - (borde.right - tapaDerecha);

        let mover = 0;
        if (seSaleIzquierda < 0) mover = seSaleIzquierda;
        else if (seSaleDerecha > 0) mover = seSaleDerecha;
        if (mover === 0) return;

        caja.scrollTo({
            left: caja.scrollLeft + mover,
            behavior: suave ? "smooth" : "auto",
        });
    }, []);

    // Al montar, sin animación: una barra que se desliza sola nada más abrir la
    // página se lee como un fallo de pintado. Los cambios de pestaña de después
    // sí van suaves, que ahí el movimiento explica de dónde viene.
    const yaSeMonto = useRef(false);
    useLayoutEffect(() => {
        if (!activo) return;
        traerALaVista(activo, yaSeMonto.current);
        yaSeMonto.current = true;
    }, [activo, traerALaVista]);

    const desplazar = (haciaLaDerecha: boolean) => {
        const caja = carril.current;
        if (!caja) return;
        const paso = Math.max(120, caja.clientWidth * PARTE_QUE_SE_DESPLAZA);
        caja.scrollBy({ left: haciaLaDerecha ? paso : -paso, behavior: "smooth" });
    };

    return (
        <div className={cn("relative min-w-0", className)}>
            <div
                ref={carril}
                // `scrollbar-hide` porque la señal de que hay más son las
                // flechas: con las dos cosas, la barra gris se come dos píxeles
                // del borde de abajo y desalinea el subrayado de la activa.
                className={cn("scrollbar-hide overflow-x-auto overflow-y-hidden", carrilClassName)}
                onFocus={(evento) => {
                    const destino = evento.target;
                    if (destino instanceof HTMLElement) traerALaVista(destino, true);
                }}
            >
                {children}
            </div>

            {hayIzquierda && <Flecha lado="izquierda" queHay={queHay} onClick={() => desplazar(false)} />}
            {hayDerecha && <Flecha lado="derecha" queHay={queHay} onClick={() => desplazar(true)} />}
        </div>
    );
}

function Flecha({
    lado,
    queHay,
    onClick,
}: {
    lado: "izquierda" | "derecha";
    queHay: string;
    onClick: () => void;
}) {
    const esIzquierda = lado === "izquierda";
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={esIzquierda ? `Ver ${queHay} anteriores` : `Ver más ${queHay}`}
            // Fuera del orden de tabulación a propósito: no llevan a ningún
            // sitio nuevo —las pestañas se alcanzan tabulando, y el carril las
            // trae solo al recibir el foco—, así que como paradas de teclado
            // solo serían dos pasos de más antes de cada barra.
            tabIndex={-1}
            className={cn(
                "absolute top-0 flex h-full w-9 items-center justify-center",
                "text-muted-foreground transition-colors hover:text-foreground",
                esIzquierda
                    ? "left-0 bg-gradient-to-r from-background via-background to-transparent pr-2"
                    : "right-0 bg-gradient-to-l from-background via-background to-transparent pl-2",
            )}
        >
            {esIzquierda ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
    );
}
