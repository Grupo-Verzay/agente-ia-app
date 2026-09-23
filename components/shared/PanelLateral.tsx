"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    FRANJA_DEL_PANEL,
    HOJA_DEL_PANEL,
    HOJA_SIN_TRANSICION,
    MS_DEL_DESLIZAMIENTO,
} from "@/lib/panel-lateral";
import { usePanelLateral } from "@/hooks/usePanelLateral";

/**
 * Un panel lateral, con su franja, su hoja y su cabecera. **Escrito una vez.**
 *
 * # Por qué existe
 *
 * El copiloto y el chat del equipo ya compartían las CLASES
 * (`lib/panel-lateral`) y cada uno escribía su propio marco: la franja, la
 * hoja, el `translate-x-full` que la desliza y la cabecera con su equis. Con
 * tres paneles más —contexto del lead, recordatorio y tarea— eso serían cinco
 * copias de lo mismo, y el día que se afine el deslizamiento se afina en una y
 * las otras cuatro se quedan atrás. Eso no se ve como un error: se ve como
 * cinco paneles que no parecen del mismo sitio.
 *
 * **Compartir las clases no es compartir el componente** — es la lección que
 * ya costó una vuelta entera en la barra de escribir.
 *
 * # Se monta SIEMPRE y se desliza
 *
 * La hoja existe en el DOM esté abierta o cerrada, y lo que cambia es su
 * `translate-x`: es lo que da la animación de entrada **y la de salida**.
 * Lo de dentro sí es perezoso —no existe hasta la primera apertura— y al
 * cerrar se conserva mientras la hoja termina de salir, o lo que se vería
 * deslizarse es una hoja en blanco.
 *
 * # Y se PORTA al `<body>`: un `fixed` no es fijo dentro de un `backdrop-filter`
 *
 * La cabecera de Chats lleva `backdrop-blur-sm`, y un ancestro con `filter`,
 * `backdrop-filter`, `transform`, `perspective`, `contain` o `will-change`
 * pasa a ser el **bloque contenedor** de todo `position: fixed` que cuelgue de
 * él. Montado ahí, el panel no se colocaba contra la ventana sino contra la
 * cabecera: el recordatorio salía DENTRO de la conversación, y una instancia
 * CERRADA de la tarea —desplazada su `translate-x-full`— asomaba entera en la
 * franja de la derecha, en blanco (lo de dentro es perezoso) y con una equis
 * que llamaba a cerrar algo que ya estaba cerrado. Tres fallos, una causa.
 *
 * Así que la franja se pinta en un portal al `<body>`: dónde se monte el
 * componente deja de decidir dónde se ve. Es lo mismo que hace Radix con
 * todos sus diálogos y menús, y por el mismo motivo.
 *
 * # Y cerrado del todo, no existe para la vista ni para el ratón
 *
 * Una vez fuera, la hoja lleva `invisible` —que además la saca del foco del
 * teclado y de los clics—. No es decoración: es la
 * red por si algún día vuelve a caer dentro de un bloque contenedor raro —un
 * panel cerrado que asoma se lee como un panel roto, no como uno cerrado—.
 *
 * # Y no tiene velo
 *
 * A propósito, y es el encargo entero: un panel lateral deja **leer la
 * conversación mientras se rellena**. El fondo oscuro es lo que hacía que
 * estos tres fueran modales, que es justo lo que se viene a quitar.
 */
export function PanelLateral({
    id,
    abierto,
    onCerrar,
    titulo,
    subtitulo,
    icono,
    acciones,
    etiquetaDeCerrar,
    children,
}: {
    /** Su nombre en el registro. Único: con dos iguales se cerrarían entre ellos. */
    id: string;
    abierto: boolean;
    onCerrar: () => void;
    titulo: string;
    /** Debajo del título y recortado: el nombre del contacto, normalmente. */
    subtitulo?: ReactNode;
    icono?: ReactNode;
    /** Mandos propios de la cabecera, a la izquierda de la equis. */
    acciones?: ReactNode;
    etiquetaDeCerrar?: string;
    children: ReactNode;
}) {
    const relevo = usePanelLateral(id, abierto, onCerrar);
    const dentro = useSigueDentro(abierto, relevo);
    const destino = useElBody();
    // Cerrado y ya fuera: ni se ve ni se pulsa. Mientras sale (`dentro` aún en
    // true) sigue visible, o no se vería la animación de salida.
    const escondida = !abierto && !dentro;

    if (!destino) return null;

    return createPortal(
        <div className={FRANJA_DEL_PANEL} data-franja-lateral={id}>
            <section
                // `data-panel` y no `id`: el mismo panel puede estar montado
                // más de una vez —el recordatorio va en las dos filas de la
                // cabecera— y dos nodos con el mismo `id` no son HTML válido.
                data-panel={id}
                aria-label={titulo}
                aria-hidden={!abierto}
                className={cn(
                    HOJA_DEL_PANEL,
                    abierto ? "translate-x-0" : "translate-x-full",
                    escondida && "invisible",
                    relevo && HOJA_SIN_TRANSICION,
                )}
            >
                <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                        {icono && (
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                {icono}
                            </span>
                        )}
                        <div className="min-w-0">
                            <h2 className="truncate text-base font-semibold">{titulo}</h2>
                            {subtitulo && (
                                <p className="truncate text-sm text-muted-foreground">
                                    {subtitulo}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        {acciones}
                        <button
                            type="button"
                            onClick={onCerrar}
                            aria-label={etiquetaDeCerrar ?? `Cerrar ${titulo.toLowerCase()}`}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </header>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                    {dentro ? children : null}
                </div>
            </section>
        </div>,
        destino,
    );
}

/**
 * El `<body>`, una vez montado.
 *
 * En el servidor no hay documento, y pintar la franja allí y no en el
 * navegador daría dos salidas distintas —una hidratación rota—. Así que el
 * primer pintado no pinta nada y el portal entra al montar. No se pierde nada:
 * lo de dentro ya era perezoso y la hoja nace cerrada.
 */
function useElBody(): HTMLElement | null {
    const [body, setBody] = useState<HTMLElement | null>(null);
    useEffect(() => setBody(document.body), []);
    return body;
}

/**
 * `true` desde que se abre hasta que la hoja termina de SALIR.
 *
 * Las dos mitades importan y son por motivos distintos:
 *
 * - **Antes de la primera apertura devuelve `false`**, así que tener cinco
 *   paneles montados en todas las pantallas no cuesta nada: sus consultas y
 *   sus relojes no arrancan hasta que alguien los abre. Es lo que ya hacía el
 *   `activo` del chat del equipo, aplicado a los cinco.
 * - **Y al cerrar aguanta lo que dura el deslizamiento.** Desmontando al
 *   instante, lo que se ve irse es una hoja vacía.
 *
 * Que se desmonte al acabar es lo que hace que reabrir empiece de cero, que es
 * como se comportaban estos tres siendo diálogos: un formulario a medias de
 * OTRO chat sería peor que uno en blanco.
 */
function useSigueDentro(abierto: boolean, relevo: boolean): boolean {
    const [dentro, setDentro] = useState(abierto);

    useEffect(() => {
        if (abierto) {
            setDentro(true);
            return;
        }
        // En un relevo la hoja se va sin deslizarse: no hay salida que esperar,
        // y dejarla montada medio segundo sería una hoja fantasma fuera de vista.
        if (relevo) {
            setDentro(false);
            return;
        }
        const reloj = setTimeout(() => setDentro(false), MS_DEL_DESLIZAMIENTO);
        return () => clearTimeout(reloj);
        // `relevo` fuera de las dependencias a propósito: vuelve a `false` dos
        // fotogramas después y eso no tiene que reiniciar el reloj de salida.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [abierto]);

    return dentro;
}
