'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ListOrdered } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePanelFlotante } from '@/hooks/usePanelFlotante';
import { PANEL_QUE_SE_DESPLAZA, RELLENO_DEL_MENU } from '@/lib/paneles-flotantes';
import {
    FILA_DEL_MENU,
    FILA_PUESTA,
    MARCA_DE_LA_FILA,
    NOMBRE_EN_LA_FILA,
    ROTULO_DEL_MENU,
} from '@/lib/filas-de-los-menus';
import {
    elColorDeLaEtapa,
    type EtapaDeLaFila,
} from '@/lib/embudos';
import { CONTROL_DE_ICONO, GLIFO_DE_CONTROL } from '@/lib/cabeceras-de-chats';
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
 * # Un control de icono más de la fila, y la lista se carga al ABRIRLO
 *
 * El botón es la caja común de la cabecera (`CONTROL_DE_ICONO`), como llamar,
 * el recordatorio, la cita o la ficha: **solo el icono**, sin rótulo. Llevaba
 * el nombre de la etapa escrito al lado y era el único de su fila con texto, así
 * que se leía como otra cosa y se comía hasta 9 rem del ancho que sus vecinos se
 * reparten. Lo que dice cuál es la etapa es el COLOR del icono, y el nombre
 * entero se lee en el globo al posar el cursor.
 *
 * Para eso el color tiene que estar puesto **antes** de abrir nada, y por eso
 * entra `etapaInicial`: la bandeja ya trae la etapa de todas sus filas
 * (`lib/etapas-de-la-bandeja.server.ts`), así que la de la conversación abierta
 * baja desde ahí y no cuesta ni una consulta. Lo que sigue cargándose al ABRIR
 * el menú es la LISTA de etapas —que es lo caro y lo que casi nunca se mira—,
 * igual que hace su vecino `ChatAppointmentStatusButton`. Si esa conversación
 * no estaba en la página cargada de la bandeja, el icono sale neutro hasta que
 * se abre, que es como estaba antes.
 *
 * # Lo puesto se marca con un GRIS, no con un chulito
 *
 * La fila de la etapa en la que está la conversación lleva un fondo gris suave y
 * nada más. Lo que decide cómo se ve una fila —su sangrado, su redondeo, el
 * nombre en mayúscula y ese gris— vive en `lib/filas-de-los-menus.ts`, al lado
 * de lo que usa el menú de Etiquetas: son dos componentes que no se parecen por
 * debajo (aquel es un `Command` de cmdk) y abiertos uno tras otro tienen que
 * leerse como la misma pantalla.
 */
export function SelectorDeEtapaDelEmbudo({
    sessionId,
    etapaInicial,
    onEtapaCambiada,
}: {
    sessionId: number;
    /** La etapa que ya trae la bandeja, para pintar el icono sin abrir nada. */
    etapaInicial?: EtapaDeLaFila | null;
    /** Para que la pastilla de la fila cambie al momento y no en 60 s. */
    onEtapaCambiada?: (etapa: EtapaDeLaFila) => void;
}) {
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
        const posicion = datos.etapas.findIndex((e) => e.id === etapaId);
        const etapa = posicion >= 0 ? datos.etapas[posicion] : null;
        const nombre = etapa?.nombre ?? '';
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
        // Y la pastilla de la FILA se pinta al momento, que es la regla de
        // siempre: sin esto la lista se quedaría con la etapa de antes hasta la
        // vuelta del reloj de sesiones (60 s), y eso se lee como que el cambio
        // no se guardó. El color se resuelve aquí con la misma función que el
        // servidor, para que las dos pinten el mismo.
        if (etapa) {
            onEtapaCambiada?.({
                id: etapa.id,
                nombre: etapa.nombre,
                color: elColorDeLaEtapa(etapa, posicion),
            });
        }
        toast.success(`Movida a «${nombre}».`);
        setAbierto(false);
    };

    // El color de una etapa depende de su POSICIÓN cuando no tiene uno elegido
    // (`elColorDeLaEtapa`), así que se busca el índice y no la fila suelta.
    const etapas = datos?.etapas ?? [];
    const posicionActual = etapas.findIndex((e) => e.id === datos?.etapaId);
    const actual = posicionActual >= 0 ? etapas[posicionActual] : null;

    /*
     * Qué etapa pinta el icono: la leída si ya se abrió el menú, y si no la que
     * bajó con la bandeja. En ese orden y no al revés: una vez abierto, lo que
     * manda es lo que acaba de contestar el servidor —ahí está también el
     * movimiento que se acaba de hacer—, y `etapaInicial` puede ser de hace
     * hasta un minuto.
     */
    const laQueSePinta = actual
        ? { nombre: actual.nombre, color: elColorDeLaEtapa(actual, posicionActual) }
        : etapaInicial
          ? {
                nombre: etapaInicial.nombre,
                color: etapaInicial.color,
            }
          : null;

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
                    type="button"
                    variant="ghost"
                    size="icon"
                    role="combobox"
                    aria-expanded={abierto}
                    aria-label="Etapa del embudo"
                    /* El nombre ENTERO, sin recortar: es lo que sustituye al
                       rótulo que este botón ya no lleva. */
                    title={laQueSePinta ? `Etapa · ${laQueSePinta.nombre}` : 'Etapa del embudo'}
                    className={cn(
                        'w-7 shrink-0 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground',
                        CONTROL_DE_ICONO,
                    )}
                >
                    {/* El color del icono ES el dato: dice en qué etapa está sin
                        gastar ancho. Sin etapa conocida se queda neutro, que es
                        lo mismo que dice el globo. */}
                    <ListOrdered
                        className={cn(
                            GLIFO_DE_CONTROL,
                            'shrink-0',
                            !laQueSePinta && 'text-muted-foreground',
                        )}
                        /* Con el color libre no hay clase de Tailwind que valga:
                           se pinta con `style`, y el tono sale de la misma
                           función que lo pinta en el tablero y en la fila. */
                        style={laQueSePinta ? { color: laQueSePinta.color } : undefined}
                    />
                </Button>
            </PopoverTrigger>

            {/* Como todo menú de la conversación: al filo derecho del área de
                conversación y a la misma altura que los demás de la fila. */}
            <PopoverContent
                {...panel.props}
                className={cn('w-60 space-y-2', RELLENO_DEL_MENU, PANEL_QUE_SE_DESPLAZA)}
            >
                <p className={ROTULO_DEL_MENU}>
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
                        {/* `listbox` con sus `option`: quitado el chulito, lo
                            puesto lo dice el fondo —y para un lector de pantalla,
                            `aria-selected`, que es lo único que le queda—. */}
                        <div
                            role="listbox"
                            aria-label="Etapas del embudo"
                            className="max-h-64 space-y-0.5 overflow-auto"
                        >
                            {datos.etapas.map((etapa, i) => {
                                const color = elColorDeLaEtapa(etapa, i);
                                const puesta = etapa.id === datos.etapaId;
                                return (
                                    <button
                                        key={etapa.id}
                                        type="button"
                                        role="option"
                                        aria-selected={puesta}
                                        // Un asesor VE la etapa de una conversación
                                        // que no lleva y no la cambia: el motivo va
                                        // escrito abajo, que es lo que un botón
                                        // apagado no dice.
                                        disabled={!datos.puedeMover || moviendo}
                                        onClick={() => void mover(etapa.id)}
                                        className={cn(
                                            'flex w-full items-center gap-2 text-left',
                                            FILA_DEL_MENU,
                                            datos.puedeMover && !moviendo
                                                ? 'cursor-pointer hover:bg-muted'
                                                : 'cursor-default',
                                            // El gris suave ES la marca. Va DESPUÉS
                                            // del `hover`, que es el mismo gris: así
                                            // apuntar a la fila puesta no le cambia
                                            // nada.
                                            puesta && FILA_PUESTA,
                                        )}
                                    >
                                        {/* La MISMA marca que abre una fila del
                                            menú de Etiquetas: escrita una vez, o
                                            los dos menús acaban con dos puntos de
                                            tamaños distintos y los nombres sin
                                            alinear. */}
                                        <span
                                            className={MARCA_DE_LA_FILA}
                                            style={{ backgroundColor: color }}
                                        />
                                        {/* En mayúscula se recorta antes, así que el
                                            nombre entero se lee en el globo. */}
                                        <span className={NOMBRE_EN_LA_FILA} title={etapa.nombre}>
                                            {etapa.nombre}
                                        </span>
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
