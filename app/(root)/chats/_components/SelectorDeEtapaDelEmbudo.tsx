'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, ListOrdered } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePanelFlotante } from '@/hooks/usePanelFlotante';
import { PANEL_QUE_SE_DESPLAZA, RELLENO_DEL_MENU } from '@/lib/paneles-flotantes';
import { elColorDeLaEtapa } from '@/lib/embudos';
import {
    etapaDeLaConversacionAction,
    moverTarjetaAction,
    type EtapaDeLaConversacion,
} from '@/actions/embudos-actions';
import { anotarCambioDeEtapa } from '@/lib/etapa-desde-el-chat';

/**
 * La etapa del embudo de ESTA conversación, en la cabecera del chat, al lado
 * del buscador de etiquetas.
 *
 * Hasta ahora una conversación solo cambiaba de etapa arrastrando su tarjeta en
 * `/embudos`, o sea saliéndose del chat que se está atendiendo. Esto es el
 * mismo cambio, desde donde ya se está.
 *
 * **No hay una segunda regla que mantener a la par**: mueve con
 * `moverTarjetaAction` —la misma del tablero, con su validación y su permiso— y
 * lee con `etapaDeLaConversacionAction`, que deduce el embudo y la etapa con
 * las mismas funciones que el tablero. Lo que se ve aquí y lo que se ve allí no
 * pueden discrepar porque salen del mismo sitio.
 *
 * **Se carga al ABRIR, no al abrir la conversación.** Es lo que hace su vecino
 * de fila (`ChatAppointmentStatusButton`) y por el mismo motivo: Chats es la
 * pantalla más cara de la App y una consulta por conversación abierta se paga
 * todo el día, también en las cuentas que no usan embudos. El precio es que el
 * rótulo dice «Etapa» hasta la primera vez que se abre.
 */
export function SelectorDeEtapaDelEmbudo({ sessionId }: { sessionId: number }) {
    const [abierto, setAbierto] = useState(false);
    // Uno más de los paneles de la cabecera: nace bajo ella y con el mismo
    // filo derecho que Acciones y los demás.
    const panel = usePanelFlotante('cabecera', 'popover');
    const [datos, setDatos] = useState<EtapaDeLaConversacion | null>(null);
    const [cargado, setCargado] = useState(false);
    const [cargando, setCargando] = useState(false);
    const [fallo, setFallo] = useState<string | null>(null);
    const [moviendo, setMoviendo] = useState(false);

    const cargar = useCallback(async () => {
        if (cargado || cargando) return;
        setCargando(true);
        const r = await etapaDeLaConversacionAction(sessionId);
        setCargando(false);
        setCargado(true);
        if (!r.success || !r.data) {
            // Un fallo aquí no puede ser mudo: lo típico no es un ataque, es una
            // pantalla que manda el id equivocado, y sin el aviso no hay forma
            // de saber cuál.
            console.warn('[chats] no se pudo leer la etapa del embudo', { sessionId, motivo: r.message });
            setFallo(r.message);
            return;
        }
        setFallo(null);
        setDatos(r.data);
    }, [cargado, cargando, sessionId]);

    const mover = async (etapaId: string) => {
        if (!datos || moviendo || etapaId === datos.etapaId) return;
        const antes = datos.etapaId;
        const nombre = datos.etapas.find((e) => e.id === etapaId)?.nombre ?? '';
        // Se pinta al momento: un gesto que no responde se repite, o sea que se
        // pone y se quita.
        setDatos({ ...datos, etapaId });
        setMoviendo(true);
        const r = await moverTarjetaAction(sessionId, etapaId);
        setMoviendo(false);
        if (!r.success) {
            setDatos((d) => (d ? { ...d, etapaId: antes } : d));
            toast.error(r.message);
            return;
        }
        // El tablero lee la misma fila, así que ya está cambiado ahí. La marca
        // es solo para que el caché del enrutador no se lo tape al volver;
        // `lib/etapa-desde-el-chat.ts` cuenta por qué no va un `revalidatePath`.
        anotarCambioDeEtapa();
        toast.success(`Movida a «${nombre}».`);
        setAbierto(false);
    };

    // El color de una etapa depende de su POSICIÓN cuando no tiene uno elegido
    // (`elColorDeLaEtapa`), así que se busca el índice y no la fila suelta.
    const etapas = datos?.etapas ?? [];
    const posicionActual = etapas.findIndex((e) => e.id === datos?.etapaId);
    const actual = posicionActual >= 0 ? etapas[posicionActual] : null;
    const colorActual = actual ? elColorDeLaEtapa(actual, posicionActual) : null;

    return (
        <Popover
            open={abierto}
            onOpenChange={(v) => {
                setAbierto(v);
                panel.alAbrir(v);
                if (v) void cargar();
            }}
        >
            <PopoverTrigger asChild ref={panel.disparador}>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={abierto}
                    title="Etapa del embudo"
                    className="h-7 max-w-[9rem] shrink-0 justify-start gap-1.5 px-2 text-xs"
                >
                    {/* El color lo pone la etapa, que es el dato; el botón se
                        queda neutro para no pelear con los de al lado. */}
                    {colorActual ? (
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorActual }} />
                    ) : (
                        <ListOrdered className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">{actual?.nombre ?? 'Etapa'}</span>
                </Button>
            </PopoverTrigger>

            {/* Como todo menú de la conversación: al filo derecho del área de
                conversación y a la misma altura que los demás de la fila. */}
            <PopoverContent
                {...panel.props}
                className={cn('w-60 space-y-2', RELLENO_DEL_MENU, PANEL_QUE_SE_DESPLAZA)}
            >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {datos?.embudoNombre ? `Embudo · ${datos.embudoNombre}` : 'Embudo'}
                </p>

                {cargando && (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                )}

                {!cargando && fallo && <p className="py-1 text-xs text-muted-foreground">{fallo}</p>}

                {!cargando && !fallo && datos && !datos.embudoId && (
                    <p className="py-1 text-xs text-muted-foreground">
                        Esta cuenta todavía no tiene embudos.
                    </p>
                )}

                {!cargando && !fallo && datos?.embudoId && (
                    <>
                        <div className="max-h-64 space-y-0.5 overflow-auto">
                            {datos.etapas.map((etapa, i) => {
                                const color = elColorDeLaEtapa(etapa, i);
                                const puesta = etapa.id === datos.etapaId;
                                return (
                                    <button
                                        key={etapa.id}
                                        type="button"
                                        // Un asesor VE la etapa de una conversación
                                        // que no lleva y no la cambia: el motivo va
                                        // escrito abajo, que es lo que un botón
                                        // apagado no dice.
                                        disabled={!datos.puedeMover || moviendo}
                                        onClick={() => void mover(etapa.id)}
                                        className={cn(
                                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs',
                                            datos.puedeMover && !moviendo
                                                ? 'cursor-pointer hover:bg-muted'
                                                : 'cursor-default',
                                            puesta && 'font-medium',
                                        )}
                                    >
                                        <Check
                                            className={cn('h-3 w-3 shrink-0', puesta ? 'opacity-100' : 'opacity-0')}
                                        />
                                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                                        <span className="truncate">{etapa.nombre}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {!datos.puedeMover && (
                            <p className="border-t border-border/50 pt-2 text-[0.7rem] leading-tight text-muted-foreground">
                                Solo puedes mover tus propias conversaciones.
                            </p>
                        )}
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}
