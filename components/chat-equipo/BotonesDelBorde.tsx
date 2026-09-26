"use client";

import { useState } from "react";
import { MessagesSquare, NotebookPen, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/ai-chat/useChatStore";
import { ChatLauncher } from "@/app/(root)/ai-chat/components/ChatLauncher";
import { ChatSheet } from "@/app/(root)/ai-chat/components/ChatSheet";
import { InsigniaDelFavicon } from "@/components/shared/InsigniaDelFavicon";
import { PanelDeEquipo } from "@/components/chat-equipo/PanelDeEquipo";
import { PanelDeNotaRapida } from "@/components/nota-rapida/PanelDeNotaRapida";
import { useSinLeerDelEquipo } from "@/hooks/useSinLeerDelEquipo";
import {
    BOTON_DEL_BORDE,
    COLUMNA_DEL_BORDE,
    GLIFO_DEL_BOTON_DEL_BORDE,
    elDesplazamientoDelEje,
} from "@/lib/botones-del-borde";

/**
 * Los TRES botones del borde derecho, como columna.
 *
 * De arriba abajo: la **nota rápida**, el **copiloto** y el **chat del
 * equipo**. Cada uno con su panel, y nunca dos abiertos a la vez.
 *
 * # Dónde caen, y por qué no basta con centrar la columna
 *
 * El copiloto es el EJE: se queda clavado en la mitad de la ventana y los otros
 * dos se reparten arriba y abajo, a la misma distancia de él. Eso **no** es lo
 * que hacía el `-translate-y-1/2` de antes: aquello centraba la COLUMNA, así
 * que con dos botones el copiloto quedaba 20 px por encima del centro y el del
 * equipo 20 por debajo — ninguno centrado, y con dos botones iguales eso no se
 * nota.
 *
 * Con tres iguales, centrar la columna vuelve a dar lo correcto por casualidad.
 * Y deja de darlo, en silencio, el día que entre un cuarto botón o que uno
 * cambie de alto. Así que la columna se pega a `top: 50%` y se sube **lo que
 * mide desde su borde hasta el centro del eje**, que lo calcula
 * `elDesplazamientoDelEje`. Los tres botones son `h-9`, el hueco es `gap-1`, y
 * esos dos números viven en `lib/botones-del-borde.ts` junto con la cuenta.
 *
 * Va en `style` y no en una clase: Tailwind solo genera lo que ve escrito
 * literal, así que un `-translate-y-[58px]` armado en tiempo de ejecución no
 * existiría en el CSS y la columna se quedaría sin desplazar **con el build en
 * verde** — la familia de `removeConsole`.
 *
 * # Y se quedan quietos
 *
 * Fijos al borde: no se arrastran. Lo que sí se arrastra en esta plataforma es
 * la ventana de una llamada y la de una reunión, que llevan dentro el botón de
 * colgar y pueden tapar lo que se está mirando durante media hora. Estos tres
 * son mandos, no ventanas: un mando que cambia de sitio es un mando que hay que
 * buscar cada vez.
 *
 * # Y no tapan la caja de escribir de Chats
 *
 * La columna mide 116 px con el eje en su mitad, así que su borde de abajo cae
 * en `50vh + 58px`. La caja de escribir está pegada al fondo: a 1280×800 son
 * 342 px de separación y en un móvil de 667 quedan 275. Los 36 px de lado son
 * de cuando el botón tapaba los tres puntos de las filas, y esa medida se
 * respeta.
 */
export function BotonesDelBorde({
    cuentaId,
    personaId,
}: {
    /**
     * Quién entra. No lo usan los botones: baja hasta el hilo del equipo, que
     * lo necesita para volver al canal donde se estaba. Viene del layout
     * porque hace falta antes de la primera consulta del panel.
     *
     * La nota rápida **no lo recibe a propósito**: es de la persona y el
     * servidor la resuelve solo, sin aceptar ningún id del navegador. Ver
     * `actions/nota-rapida-actions.ts`.
     */
    cuentaId?: string;
    personaId?: string;
} = {}) {
    const copilotoAbierto = useChatStore((s) => s.isOpen);
    const abrirCopiloto = useChatStore((s) => s.setOpen);
    const [equipoAbierto, setEquipoAbierto] = useState(false);
    const [notaAbierta, setNotaAbierta] = useState(false);
    // El contador corre SIEMPRE, también con el panel cerrado: de eso va. El
    // reloj del hilo es el contrario —solo con el panel abierto— porque esto
    // cuelga del layout y aquel se trae los mensajes.
    // Y este mismo reloj es el que suena: lo que trae la vuelta ya dice qué
    // merece sonar y si esta persona lo quiere. Un segundo reloj para el sonido
    // sería preguntar dos veces lo mismo en todas las pantallas de la App.
    const { total: sinLeer, sonido, dirigidos } = useSinLeerDelEquipo();

    // Nunca dos a la vez: son tres paneles en el mismo sitio, y abiertos a la
    // vez uno taparía al otro sin decir cuál está delante. Eso NO se escribe
    // aquí: lo decide `usePanelLateral`, que es por donde pasan TODOS los
    // paneles. Con la condición escrita también en esta columna habría dos
    // reglas que mantener a la par, y el día que se afine una la otra se queda
    // atrás: dos paneles abiertos a la vez de vez en cuando, que es el fallo
    // más difícil de reproducir de esta familia.
    const alternarEquipo = () => setEquipoAbierto((antes) => !antes);
    const alternarNota = () => setNotaAbierta((antes) => !antes);

    return (
        <>
            <div
                className={COLUMNA_DEL_BORDE}
                style={{ transform: `translateY(-${elDesplazamientoDelEje()}px)` }}
                data-columna-del-borde
            >
                <button
                    type="button"
                    onClick={alternarNota}
                    aria-label={notaAbierta ? "Cerrar la nota rápida" : "Abrir la nota rápida"}
                    aria-expanded={notaAbierta}
                    data-boton-del-borde="nota"
                    className={cn(
                        BOTON_DEL_BORDE,
                        notaAbierta && "bg-primary text-primary-foreground",
                    )}
                >
                    {notaAbierta ? (
                        <X className={GLIFO_DEL_BOTON_DEL_BORDE} />
                    ) : (
                        <NotebookPen className={GLIFO_DEL_BOTON_DEL_BORDE} />
                    )}
                    <span className="sr-only">
                        {notaAbierta ? "Cerrar la nota rápida" : "Abrir la nota rápida"}
                    </span>
                </button>

                <ChatLauncher open={copilotoAbierto} onOpenChange={abrirCopiloto} />

                <button
                    type="button"
                    onClick={alternarEquipo}
                    aria-label={equipoAbierto ? "Cerrar chat del equipo" : "Abrir chat del equipo"}
                    aria-controls="chat-equipo-escritorio"
                    aria-expanded={equipoAbierto}
                    data-boton-del-borde="equipo"
                    className={cn(
                        BOTON_DEL_BORDE,
                        equipoAbierto && "bg-primary text-primary-foreground",
                    )}
                >
                    {equipoAbierto ? (
                        <X className={GLIFO_DEL_BOTON_DEL_BORDE} />
                    ) : (
                        <MessagesSquare className={GLIFO_DEL_BOTON_DEL_BORDE} />
                    )}
                    {/* El número va FUERA del botón en el flujo —`absolute`—
                        para no empujar su icono: los tres miden 36 px y el del
                        medio es el eje de la columna, así que uno que crezca
                        los descuadraría a los tres. Se esconde con el panel
                        abierto, donde ya está bajando a cero. */}
                    {!equipoAbierto && sinLeer > 0 && (
                        <span
                            aria-hidden
                            className="pointer-events-none absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground shadow"
                        >
                            {sinLeer > 99 ? "99+" : sinLeer}
                        </span>
                    )}
                    <span className="sr-only">
                        {equipoAbierto
                            ? "Cerrar chat del equipo"
                            : sinLeer > 0
                              ? `Abrir chat del equipo, ${sinLeer} sin leer`
                              : "Abrir chat del equipo"}
                    </span>
                </button>
            </div>

            {/* El número de la pestaña. Vive aquí y no en el layout porque
                este es el ÚNICO sitio que ya tiene el contador del equipo:
                llamar al hook otra vez montaría un segundo reloj de 15 s en
                todas las pantallas, que es justo el sondeo que esto no trae.
                No pinta nada en el árbol. */}
            <InsigniaDelFavicon delEquipo={dirigidos} />

            <PanelDeNotaRapida abierto={notaAbierta} onCerrar={() => setNotaAbierta(false)} />
            <ChatSheet open={copilotoAbierto} onOpenChange={abrirCopiloto} />
            <PanelDeEquipo
                abierto={equipoAbierto}
                sonido={sonido}
                onCerrar={() => setEquipoAbierto(false)}
                cuentaId={cuentaId}
                personaId={personaId}
            />
        </>
    );
}
