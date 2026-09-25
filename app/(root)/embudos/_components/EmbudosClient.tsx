'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import {
    ArrowDown,
    ArrowUp,
    Building2,
    Check,
    ChevronDown,
    Filter,
    Kanban,
    ListOrdered,
    Lock,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    Settings2,
    Star,
    Trash2,
    UserCog,
    Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AccionesMasivas } from '@/components/shared/AccionesMasivas';
import { BarraDeAcciones, BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import { cn } from '@/lib/utils';
import {
    COLORES_DE_ETAPA,
    TOPE_DE_ETAPAS,
    TOPE_DE_NOMBRE,
    elColorDeLaEtapa,
    elEmbudoPorDefecto,
    puedeMoverLaTarjeta,
    type Embudo,
    type Etapa,
} from '@/lib/embudos';
import {
    SIN_ASIGNAR,
    TODOS_LOS_ASESORES,
    type CuentaDelTablero,
} from '@/lib/embudos-de-la-cuenta';
import type { KanbanCard } from '@/actions/crm-kanban-actions';
import type { PersonaDelEquipo, TableroDeEmbudo, TarjetaDeEmbudo } from '@/lib/tablero-de-embudo.server';
import { huboCambioDeEtapa } from '@/lib/etapa-desde-el-chat';
import {
    asignarEmbudosAction,
    borrarEmbudoAction,
    crearEmbudoAction,
    guardarEtapasAction,
    moverTarjetaAction,
    renombrarEmbudoAction,
    tableroDelEmbudoAction,
    usarPorDefectoAction,
} from '@/actions/embudos-actions';
import { KanbanCardItem } from '../../crm/kanban/_components/KanbanBoard';

/**
 * El tablero de Embudos.
 *
 * Quien manda (dueño o administrador) elige embudo, crea, renombra, borra,
 * edita etapas y asigna asesores. Un asesor ve SU embudo, con solo sus
 * conversaciones, y lo único que hace es mover sus tarjetas de etapa.
 *
 * Esta pantalla no decide nada de eso: pinta lo que le devuelve el servidor
 * (`manda`, los embudos que alcanza, las tarjetas) y cada acción lo vuelve a
 * comprobar. Esconder un botón aquí evita el clic, no la petición.
 */

type Respuesta<T = undefined> = { success: boolean; message: string; data?: T };

/**
 * Ninguna llamada a una acción puede dejar un botón colgado: una acción puede
 * REVENTAR, y entonces la línea que apaga el «Guardando…» no llega a correr.
 */
async function pedir<T>(hacer: () => Promise<Respuesta<T>>): Promise<Respuesta<T>> {
    try {
        return await hacer();
    } catch (error) {
        console.error('[embudos] la acción no llegó al servidor', error);
        return { success: false, message: 'No se pudo completar. Revisa la conexión.' };
    }
}

const SIN_EMBUDO = '__sin_embudo__';

function iniciales(nombre: string): string {
    return nombre
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('');
}

/** La tarjeta del tablero ES la del Kanban del CRM: aquí solo se traduce el dato. */
function comoTarjetaDelKanban(t: TarjetaDeEmbudo): KanbanCard {
    return {
        id: t.id,
        pushName: t.pushName,
        remoteJid: t.remoteJid,
        leadStatus: null,
        leadStatusReason: null,
        leadStatusUpdatedAt: t.actualizadoEn,
        tags: t.tags,
        pendingFollowUps: t.pendingFollowUps,
        leadScore: t.leadScore,
        leadScoreReason: null,
        leadScoredAt: null,
        assignedAdvisorId: t.asesorId,
        cuentaId: '',
    };
}

function PieDelAsesor({ asesorId, nombres }: { asesorId: string | null; nombres: Record<string, string> }) {
    if (!asesorId) {
        return (
            <span className="inline-flex h-4 items-center rounded-full border border-rose-300 bg-rose-50 px-1.5 text-[10px] font-medium text-rose-600">
                Sin asignar
            </span>
        );
    }
    const nombre = nombres[asesorId] ?? 'Otro asesor';
    return (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[8px] font-semibold text-foreground">
                {iniciales(nombre)}
            </span>
            <span className="truncate">{nombre}</span>
        </div>
    );
}

function TarjetaArrastrable({
    tarjeta,
    puedeMover,
    pie,
}: {
    tarjeta: TarjetaDeEmbudo;
    puedeMover: boolean;
    pie?: React.ReactNode;
}) {
    // Solo el ID viaja en el arrastre: ver «Lo único que viaja en el arrastre
    // es el ID» en CLAUDE.md. Nada de `data` colgado.
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: String(tarjeta.id),
        disabled: !puedeMover,
    });
    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={cn(puedeMover ? 'cursor-grab active:cursor-grabbing' : 'cursor-default', isDragging && 'opacity-40')}
        >
            <KanbanCardItem card={comoTarjetaDelKanban(tarjeta)} pie={pie} />
        </div>
    );
}

function Columna({
    etapa,
    posicion,
    tarjetas,
    total,
    buscando,
    manda,
    onEditar,
    children,
}: {
    etapa: Etapa;
    posicion: number;
    tarjetas: TarjetaDeEmbudo[];
    /** El total DE VERDAD de la etapa: un `COUNT`, no las tarjetas cargadas. */
    total: number;
    buscando: boolean;
    manda: boolean;
    onEditar: () => void;
    children: React.ReactNode;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
    const color = elColorDeLaEtapa(etapa.color, posicion);
    return (
        <div
            className="flex h-full w-[260px] min-w-[260px] shrink-0 flex-col overflow-hidden rounded-xl border-2 shadow-sm"
            style={{ borderColor: color.borde + '52', backgroundColor: color.borde + '0A' }}
        >
            <div className={cn('flex shrink-0 items-center justify-between px-3 py-2', color.cabecera)}>
                <span className="truncate text-sm font-semibold uppercase text-white" title={etapa.nombre}>
                    {etapa.nombre}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                    {/* El número es el `COUNT` de la etapa, no `tarjetas.length`:
                        el tablero trae como mucho `TOPE_DE_TARJETAS`, así que
                        contar lo cargado da «cuántas de las primeras 500
                        cayeron aquí». Buscando sí se cuenta lo que casa, que es
                        lo que hay delante. */}
                    <Badge
                        className="border-0 bg-white/20 text-xs font-medium text-white"
                        title={
                            buscando
                                ? `${tarjetas.length} de ${total} coinciden con la búsqueda`
                                : `${total} ${total === 1 ? 'conversación' : 'conversaciones'} en esta etapa`
                        }
                    >
                        {buscando ? `${tarjetas.length}/${total}` : total}
                    </Badge>
                    {manda && (
                        <button
                            type="button"
                            onClick={onEditar}
                            className="rounded p-0.5 transition-colors hover:bg-white/20"
                            title="Editar etapas"
                            aria-label="Editar etapas"
                        >
                            <Settings2 className="h-3.5 w-3.5 text-white/80" />
                        </button>
                    )}
                </div>
            </div>
            <div
                ref={setNodeRef}
                className={cn(
                    'min-h-0 flex-1 space-y-2 overflow-y-auto p-2 transition-colors',
                    isOver && 'bg-primary/5 ring-2 ring-inset ring-primary/30',
                )}
            >
                {children}
                {tarjetas.length === 0 && (
                    <div className="flex h-20 items-center justify-center text-xs text-muted-foreground/40">
                        Sin conversaciones
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * El selector de CUENTA: una, y solo una.
 *
 * No reutiliza `components/shared/SelectorDeCuentas.tsx` a propósito, y el
 * motivo no es estético: aquel es de casillas porque su encargo es **marcar
 * varias y consolidarlas**, y aquí consolidar es imposible —las columnas de un
 * tablero son las etapas de un embudo, y un embudo es de una cuenta—. Darle una
 * prop para elegir «una o varias» sería un componente cuya documentación se
 * contradice a sí misma. Lo que sí se comparte es lo que importa: **quién puede
 * elegir qué**, que lo decide el servidor (`resolverLaCuentaDelTablero`) con la
 * misma regla de alcance hacia abajo del CRM.
 *
 * Lleva buscador a partir de unas cuantas cuentas: la cartera de una cuenta de
 * la casa o de un reseller grande son decenas, y una lista así no se recorre
 * con los ojos.
 */
const CUENTAS_PARA_BUSCAR = 8;

function SelectorDeLaCuenta({
    cuentas,
    elegida,
    recortadas,
    onElegir,
}: {
    cuentas: CuentaDelTablero[];
    elegida: string;
    recortadas: boolean;
    onElegir: (id: string) => void;
}) {
    const [abierto, setAbierto] = useState(false);
    const [filtro, setFiltro] = useState('');

    const conBuscador = cuentas.length >= CUENTAS_PARA_BUSCAR;
    const visibles = useMemo(() => {
        const q = filtro.trim().toLowerCase();
        if (!q) return cuentas;
        return cuentas.filter((c) => c.nombre.toLowerCase().includes(q));
    }, [cuentas, filtro]);

    const actual = cuentas.find((c) => c.id === elegida);
    const esOtra = Boolean(actual) && !actual!.esLaPropia;

    return (
        <DropdownMenu
            open={abierto}
            onOpenChange={(v) => {
                setAbierto(v);
                if (!v) setFiltro('');
            }}
        >
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    // Azul cuando se está mirando otra cuenta: lo que se crea y
                    // lo que se mueve es de ella, y eso tiene que notarse.
                    className={cn('h-10 max-w-[16rem] shrink-0 justify-start gap-2', esOtra && 'border-blue-500 text-blue-600')}
                    title={esOtra ? `Estás viendo el tablero de ${actual?.nombre}` : undefined}
                >
                    <Building2 className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{actual?.nombre ?? 'Cuenta'}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            {/* La lista crece con la cartera, así que lleva su propio scroll
                acotado al hueco de VERDAD y no a `vh`: con el botón abajo, un
                `70vh` a secas abre un menú que se sale por arriba. */}
            <DropdownMenuContent
                align="start"
                className="w-72 overflow-y-auto"
                style={{ maxHeight: 'min(70vh, var(--radix-dropdown-menu-content-available-height))' }}
            >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Cuentas que administras
                </DropdownMenuLabel>
                {conBuscador && (
                    <div className="px-2 pb-1.5">
                        <Input
                            value={filtro}
                            onChange={(e) => setFiltro(e.target.value)}
                            placeholder="Buscar cuenta…"
                            className="h-8"
                            aria-label="Buscar cuenta"
                            // Radix devuelve el foco al disparador con cada
                            // tecla si no se le dice que esto no es un atajo.
                            onKeyDown={(e) => e.stopPropagation()}
                        />
                    </div>
                )}
                {visibles.map((c) => (
                    <DropdownMenuItem key={c.id} onSelect={() => onElegir(c.id)} className="gap-2">
                        <span className="flex h-4 w-4 items-center justify-center">
                            {c.id === elegida && <Check className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate" title={c.nombre}>
                            {c.nombre}
                        </span>
                        {c.esLaPropia && (
                            <span className="shrink-0 text-[10px] uppercase text-muted-foreground">la tuya</span>
                        )}
                    </DropdownMenuItem>
                ))}
                {visibles.length === 0 && (
                    <p className="px-2 py-3 text-center text-xs text-muted-foreground">Ninguna coincide.</p>
                )}
                {recortadas && (
                    <>
                        <DropdownMenuSeparator />
                        <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                            Se muestran las primeras {cuentas.length}. Entra a la cuenta para ver su tablero si no
                            está en la lista.
                        </p>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/**
 * El filtro de ASESOR. «Todos» es el estado de partida, no una opción más.
 *
 * Y la parte que hay que conocer antes de tocarlo: **elegir a un asesor puede
 * cambiar de embudo**. Si el suyo es otro, el tablero se va a SU embudo, porque
 * es el único donde sus tarjetas tienen posición y donde moverlas vale
 * (`moverTarjetaAction` deduce el embudo de la conversación). Por eso cada
 * nombre lleva al lado el embudo al que llevaría, cuando no es el abierto: sin
 * eso, el tablero cambiaría de columnas sin que nadie entienda por qué.
 */
function FiltroDeAsesores({
    equipo,
    asignaciones,
    embudos,
    embudoId,
    elegido,
    nombres,
    onElegir,
}: {
    equipo: PersonaDelEquipo[];
    asignaciones: Record<string, string>;
    embudos: Embudo[];
    embudoId: string | null;
    elegido: string | null;
    nombres: Record<string, string>;
    onElegir: (valor: string) => void;
}) {
    const porDefecto = elEmbudoPorDefecto(embudos);
    const nombreDelEmbudo = (id: string | null) => embudos.find((e) => e.id === id)?.nombre ?? null;

    const rotulo = !elegido
        ? 'Todos los asesores'
        : elegido === SIN_ASIGNAR
          ? 'Sin asesor'
          : (nombres[elegido] ?? 'Asesor');

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className={cn('h-10 max-w-[14rem] shrink-0 justify-start gap-2', elegido && 'border-blue-500 text-blue-600')}
                >
                    <Filter className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{rotulo}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                className="w-72 overflow-y-auto"
                style={{ maxHeight: 'min(70vh, var(--radix-dropdown-menu-content-available-height))' }}
            >
                <DropdownMenuLabel className="text-xs text-muted-foreground">Ver en el tablero</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => onElegir(TODOS_LOS_ASESORES)} className="gap-2">
                    <span className="flex h-4 w-4 items-center justify-center">
                        {!elegido && <Check className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">Todos los asesores</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onElegir(SIN_ASIGNAR)} className="gap-2">
                    <span className="flex h-4 w-4 items-center justify-center">
                        {elegido === SIN_ASIGNAR && <Check className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">Sin asesor asignado</span>
                    {porDefecto && (
                        <span className="shrink-0 text-[10px] uppercase text-muted-foreground" title="Las conversaciones sin asesor caen en el embudo por defecto">
                            {porDefecto.nombre}
                        </span>
                    )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {equipo.map((p) => {
                    const suyo = asignaciones[p.id];
                    const irA = nombreDelEmbudo(suyo && embudos.some((e) => e.id === suyo) ? suyo : (porDefecto?.id ?? null));
                    const cambiaDeEmbudo = (suyo && embudos.some((e) => e.id === suyo) ? suyo : porDefecto?.id) !== embudoId;
                    return (
                        <DropdownMenuItem key={p.id} onSelect={() => onElegir(p.id)} className="gap-2">
                            <span className="flex h-4 w-4 items-center justify-center">
                                {elegido === p.id && <Check className="h-4 w-4" />}
                            </span>
                            <span className="min-w-0 flex-1 truncate" title={p.nombre}>
                                {p.nombre}
                            </span>
                            {cambiaDeEmbudo && irA && (
                                <span
                                    className="shrink-0 text-[10px] uppercase text-muted-foreground"
                                    title={`Su embudo es «${irA}»: el tablero cambiará a ese`}
                                >
                                    → {irA}
                                </span>
                            )}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

type BorradorDeEtapa = { clave: string; id: string | null; nombre: string; color: number | null };

let contadorDeClaves = 0;
const nuevaClave = () => `n${++contadorDeClaves}`;

export function EmbudosClient({ inicial }: { inicial: TableroDeEmbudo }) {
    const [tablero, setTablero] = useState<TableroDeEmbudo>(inicial);
    const [cargando, setCargando] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const [arrastrada, setArrastrada] = useState<TarjetaDeEmbudo | null>(null);
    const moviendo = useRef(false);

    // Diálogos y paneles
    const [crearAbierto, setCrearAbierto] = useState(false);
    const [renombrarAbierto, setRenombrarAbierto] = useState(false);
    const [borrarAbierto, setBorrarAbierto] = useState(false);
    const [nombre, setNombre] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [etapasAbierto, setEtapasAbierto] = useState(false);
    const [borradorEtapas, setBorradorEtapas] = useState<BorradorDeEtapa[]>([]);
    const [asesoresAbierto, setAsesoresAbierto] = useState(false);
    const [borradorAsesores, setBorradorAsesores] = useState<Record<string, string>>({});

    const { manda, embudos, embudoId, etapas, tarjetas, nombres, personaId } = tablero;
    const actual = embudos.find((e) => e.id === embudoId) ?? null;
    const porDefecto = elEmbudoPorDefecto(embudos);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

    /*
     * Dónde está puesto el tablero: la cuenta, el embudo y el asesor.
     *
     * Va en un `ref` y no en las dependencias de `recargar` para que esa función
     * no cambie de identidad: la usa un efecto, y un `useCallback` que se rehace
     * en cada pintado lo volvería a disparar. Se actualiza donde de verdad
     * cambia —al volver del servidor—, que es lo único que decide de verdad
     * dónde está puesto.
     */
    const puesto = useRef({ cuenta: inicial.cuentaId, embudo: inicial.embudoId, asesor: inicial.asesor });

    const recargar = useCallback(
        async (opciones?: { embudo?: string | null; cuenta?: string; asesor?: string | null }) => {
            const cuenta = opciones?.cuenta ?? puesto.current.cuenta;
            // Cambiar de CUENTA no arrastra el embudo ni el asesor de la
            // anterior: son ids de otra cuenta, así que el servidor los
            // descartaría y el tablero abriría en su embudo por defecto de
            // todas formas. Mandarlos sería pedir algo que no existe.
            const cambiaDeCuenta = cuenta !== puesto.current.cuenta;
            const embudo = cambiaDeCuenta
                ? null
                : opciones && 'embudo' in opciones
                  ? (opciones.embudo ?? null)
                  : puesto.current.embudo;
            const asesor = cambiaDeCuenta
                ? null
                : opciones && 'asesor' in opciones
                  ? (opciones.asesor ?? null)
                  : puesto.current.asesor;

            setCargando(true);
            const r = await pedir(() => tableroDelEmbudoAction(embudo, cuenta, asesor));
            setCargando(false);
            if (!r.success || !r.data) {
                toast.error(r.message);
                return;
            }
            setTablero(r.data);
            puesto.current = { cuenta: r.data.cuentaId, embudo: r.data.embudoId, asesor: r.data.asesor };
            // Las tres coordenadas quedan en la dirección, para volver a ellas
            // al recargar y para poder guardar el enlace. **Lo que se escribe es
            // solo lo que no es el estado de siempre**: la URL limpia es la
            // cuenta propia, todos los asesores y el embudo por defecto, o sea
            // la que ya funcionaba antes de que esto existiera.
            try {
                const url = new URL(window.location.href);
                const poner = (clave: string, valor: string | null) => {
                    if (valor) url.searchParams.set(clave, valor);
                    else url.searchParams.delete(clave);
                };
                poner('embudo', r.data.manda ? r.data.embudoId : null);
                poner('cuenta', r.data.esOtraCuenta ? r.data.cuentaId : null);
                poner('asesor', r.data.asesor);
                window.history.replaceState(null, '', url.toString());
            } catch {
                // Sin dirección que tocar no pasa nada: el tablero ya está pintado.
            }
        },
        // Sin dependencias a propósito: dónde está puesto el tablero se lee del
        // `ref`, así que esta función no cambia de identidad y el efecto que la
        // usa no se vuelve a disparar en cada pintado.
        [],
    );

    /*
     * Si se movió una etapa desde la cabecera del chat, el tablero se pide otra
     * vez al montarse.
     *
     * El dato ya está en `embudo_posiciones` —lo escribió la misma acción—, así
     * que esto no lo va a buscar a ningún sitio nuevo: lo que tapa es el caché
     * del enrutador de Next, que guarda una página dinámica 30 s en el
     * navegador y puede pintar la foto de antes al volver de Chats. El porqué
     * de no cerrarlo con `revalidatePath` está en `lib/etapa-desde-el-chat.ts`.
     *
     * **Sin marca no se pide nada**: abrir el tablero sin haber tocado nada
     * —que es el caso normal— no paga ni una consulta. Y la marca se borra al
     * leerla, así que esto corre una sola vez por cambio.
     */
    useEffect(() => {
        if (huboCambioDeEtapa()) void recargar({ embudo: inicial.embudoId });
    }, [recargar, inicial.embudoId]);

    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return tarjetas;
        return tarjetas.filter((t) => `${t.pushName} ${t.remoteJid}`.toLowerCase().includes(q));
    }, [busqueda, tarjetas]);

    const deLaEtapa = useCallback(
        (etapaIdPedida: string) => visibles.filter((t) => t.etapaId === etapaIdPedida),
        [visibles],
    );

    // ─── Arrastre ──────────────────────────────────────────────────────────
    const alEmpezar = (e: DragStartEvent) => {
        setArrastrada(tarjetas.find((t) => String(t.id) === String(e.active.id)) ?? null);
    };

    const alSoltar = async (e: DragEndEvent) => {
        setArrastrada(null);
        const { active, over } = e;
        if (!over || moviendo.current) return;
        // Se compara como TEXTO en los dos lados: el id de la tarjeta es un
        // número y `active.id` llega como cadena.
        const tarjeta = tarjetas.find((t) => String(t.id) === String(active.id));
        if (!tarjeta) {
            console.warn('[embudos] se soltó una tarjeta que no está en la lista', { id: active.id });
            return;
        }
        const destino = String(over.id);
        if (destino === tarjeta.etapaId || !etapas.some((x) => x.id === destino)) return;

        const origen = tarjeta.etapaId;
        const poner = (etapa: string) =>
            setTablero((t) => ({
                ...t,
                tarjetas: t.tarjetas.map((x) => (x.id === tarjeta.id ? { ...x, etapaId: etapa } : x)),
            }));
        poner(destino);
        moviendo.current = true;
        const r = await pedir(() => moverTarjetaAction(tarjeta.id, destino));
        moviendo.current = false;
        if (!r.success) {
            poner(origen);
            toast.error(r.message);
        }
    };

    // ─── Crear / renombrar / borrar / por defecto ──────────────────────────
    const crear = async () => {
        setGuardando(true);
        const r = await pedir(() => crearEmbudoAction(nombre, tablero.cuentaId));
        setGuardando(false);
        if (!r.success || !r.data) return toast.error(r.message);
        setCrearAbierto(false);
        setNombre('');
        toast.success('Embudo creado. Ajusta sus etapas.');
        await recargar({ embudo: r.data.id });
        abrirEtapasDe(r.data.id);
    };

    const renombrar = async () => {
        if (!actual) return;
        setGuardando(true);
        const r = await pedir(() => renombrarEmbudoAction(actual.id, nombre, tablero.cuentaId));
        setGuardando(false);
        if (!r.success) return toast.error(r.message);
        setRenombrarAbierto(false);
        toast.success(r.message);
        await recargar({ embudo: actual.id });
    };

    const borrar = async () => {
        if (!actual) return;
        setGuardando(true);
        const r = await pedir(() => borrarEmbudoAction(actual.id, tablero.cuentaId));
        setGuardando(false);
        setBorrarAbierto(false);
        if (!r.success) return toast.error(r.message);
        toast.success(r.message);
        await recargar({ embudo: null });
    };

    const marcarPorDefecto = async () => {
        if (!actual) return;
        const r = await pedir(() => usarPorDefectoAction(actual.id, tablero.cuentaId));
        if (!r.success) return toast.error(r.message);
        toast.success(r.message);
        await recargar({ embudo: actual.id });
    };

    // ─── Etapas ─────────────────────────────────────────────────────────────
    // Se abre con las etapas del embudo que se pide: al crear uno nuevo, el
    // tablero todavía no las tiene en el estado de este pintado.
    const abrirEtapasDe = (id?: string, conUnaNueva = false) => {
        const fuente = id && id !== embudoId ? null : etapas;
        const lista: BorradorDeEtapa[] = (fuente ?? []).map((e) => ({
            clave: e.id,
            id: e.id,
            nombre: e.nombre,
            color: e.color,
        }));
        if (conUnaNueva) lista.push({ clave: nuevaClave(), id: null, nombre: '', color: null });
        setBorradorEtapas(lista);
        setEtapasAbierto(true);
        if (fuente === null && id) {
            // Embudo recién creado: se piden sus etapas y se rellenan.
            void pedir(() => tableroDelEmbudoAction(id, tablero.cuentaId, tablero.asesor)).then((r) => {
                if (r.success && r.data) {
                    setBorradorEtapas(
                        r.data.etapas.map((e) => ({ clave: e.id, id: e.id, nombre: e.nombre, color: e.color })),
                    );
                }
            });
        }
    };

    const cambiarEtapa = (clave: string, cambio: Partial<BorradorDeEtapa>) =>
        setBorradorEtapas((l) => l.map((e) => (e.clave === clave ? { ...e, ...cambio } : e)));
    const moverEtapa = (i: number, hacia: -1 | 1) =>
        setBorradorEtapas((l) => {
            const j = i + hacia;
            if (j < 0 || j >= l.length) return l;
            const copia = [...l];
            [copia[i], copia[j]] = [copia[j], copia[i]];
            return copia;
        });

    const guardarEtapas = async () => {
        const destino = embudoId;
        if (!destino) return;
        setGuardando(true);
        const r = await pedir(() =>
            guardarEtapasAction(
                destino,
                borradorEtapas.map((e) => ({ id: e.id, nombre: e.nombre, color: e.color })),
                tablero.cuentaId,
            ),
        );
        setGuardando(false);
        if (!r.success) return toast.error(r.message);
        setEtapasAbierto(false);
        toast.success(r.message);
        await recargar({ embudo: destino });
    };

    // ─── Asesores ───────────────────────────────────────────────────────────
    const abrirAsesores = () => {
        setBorradorAsesores({ ...tablero.asignaciones });
        setAsesoresAbierto(true);
    };

    const guardarAsesores = async () => {
        setGuardando(true);
        const pares = tablero.equipo.map((p) => ({ personaId: p.id, embudoId: borradorAsesores[p.id] ?? null }));
        const r = await pedir(() => asignarEmbudosAction(pares, tablero.cuentaId));
        setGuardando(false);
        if (!r.success) return toast.error(r.message);
        setAsesoresAbierto(false);
        toast.success(r.message);
        await recargar({ embudo: embudoId });
    };

    // ─── Barra ──────────────────────────────────────────────────────────────
    const selector = !actual ? null : manda ? (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 max-w-[16rem] shrink-0 justify-start gap-2">
                    <Kanban className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">Embudo: {actual.nombre}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 overflow-y-auto">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Embudos de la cuenta</DropdownMenuLabel>
                {embudos.map((e) => {
                    const cuantos = Object.values(tablero.asignaciones).filter((x) => x === e.id).length;
                    return (
                        <DropdownMenuItem key={e.id} onSelect={() => void recargar({ embudo: e.id })} className="gap-2">
                            <span className="flex h-4 w-4 items-center justify-center">
                                {e.id === embudoId && <Check className="h-4 w-4" />}
                            </span>
                            <span className="min-w-0 flex-1 truncate" title={e.nombre}>
                                {e.nombre}
                            </span>
                            <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                                {porDefecto?.id === e.id ? 'por defecto · ' : ''}
                                {cuantos} {cuantos === 1 ? 'asesor' : 'asesores'}
                            </span>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    ) : (
        <span
            className="inline-flex h-10 items-center gap-2 rounded-md border border-input bg-muted/40 px-4 text-sm font-medium text-muted-foreground"
            title="Te lo asignó el dueño de la cuenta o un administrador"
        >
            <Kanban className="h-4 w-4" />
            Embudo: <span className="text-foreground">{actual.nombre}</span>
            <Lock className="h-3.5 w-3.5" />
        </span>
    );

    const acciones = manda ? (
        <AccionesMasivas
            seleccionados={[]}
            queSon="embudos"
            puedeEliminar={false}
            extras={[
                ...(actual
                    ? [
                          { clave: 'etapas', etiqueta: 'Editar etapas', icono: <ListOrdered className="h-4 w-4" />, onSelect: () => abrirEtapasDe(), sinSeleccion: true },
                      ]
                    : []),
                { clave: 'asesores', etiqueta: 'Asignar asesores', icono: <UserCog className="h-4 w-4" />, onSelect: abrirAsesores, sinSeleccion: true },
                ...(actual
                    ? [
                          {
                              clave: 'renombrar',
                              etiqueta: 'Renombrar embudo',
                              icono: <Pencil className="h-4 w-4" />,
                              onSelect: () => {
                                  setNombre(actual.nombre);
                                  setRenombrarAbierto(true);
                              },
                              sinSeleccion: true,
                          },
                          ...(porDefecto?.id !== actual.id
                              ? [{ clave: 'defecto', etiqueta: 'Usar por defecto', icono: <Star className="h-4 w-4" />, onSelect: () => void marcarPorDefecto(), sinSeleccion: true }]
                              : []),
                          { clave: 'borrar', etiqueta: 'Eliminar embudo', icono: <Trash2 className="h-4 w-4" />, onSelect: () => setBorrarAbierto(true), destructiva: true, sinSeleccion: true },
                      ]
                    : []),
            ]}
        />
    ) : null;

    const recortadas = tablero.total > tarjetas.length;

    /*
     * Los tres mandos van juntos en `filtros`, que es el carril que se desplaza
     * de `BarraDeAcciones`: son lo que acota qué se está mirando —la cuenta, el
     * embudo y el asesor—, y el buscador y el `⋯` se quedan fijos en sus huecos.
     */
    const filtros = (
        <>
            {tablero.puedeElegirCuenta && (
                <SelectorDeLaCuenta
                    cuentas={tablero.cuentas}
                    elegida={tablero.cuentaId}
                    recortadas={tablero.cuentasRecortadas}
                    onElegir={(id) => {
                        if (id === tablero.cuentaId) return;
                        void recargar({ cuenta: id });
                    }}
                />
            )}
            {selector}
            {manda && embudoId && tablero.equipo.length > 0 && (
                <FiltroDeAsesores
                    equipo={tablero.equipo}
                    asignaciones={tablero.asignaciones}
                    embudos={embudos}
                    embudoId={embudoId}
                    elegido={tablero.asesor}
                    nombres={nombres}
                    onElegir={(valor) => void recargar({ asesor: valor })}
                />
            )}
        </>
    );

    // ─── Pintado ────────────────────────────────────────────────────────────
    return (
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 p-2 sm:p-3">
            <BarraDeAcciones
                buscador={
                    <div className="relative w-56 sm:w-72">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar…"
                            className="h-10 pl-8"
                            aria-label="Buscar conversación"
                        />
                    </div>
                }
                filtros={filtros}
                secundarias={
                    <>
                        <span
                            className="flex items-center gap-1 whitespace-nowrap text-sm text-muted-foreground"
                            title={
                                tablero.asesor
                                    ? 'Conversaciones de este asesor en este embudo'
                                    : 'Conversaciones en este embudo'
                            }
                        >
                            <Users className="h-3.5 w-3.5" />
                            <span className="font-medium text-foreground">
                                {busqueda.trim() ? `${visibles.length}/${tablero.total}` : tablero.total}
                            </span>
                        </span>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            onClick={() => void recargar({})}
                            title="Actualizar"
                            aria-label="Actualizar"
                            disabled={cargando}
                        >
                            <RefreshCw className={cn('h-4 w-4', cargando && 'animate-spin')} />
                        </Button>
                    </>
                }
                crear={manda ? <BotonDeCrear onClick={() => { setNombre(''); setCrearAbierto(true); }}>Nuevo</BotonDeCrear> : undefined}
                acciones={acciones}
            />

            {/* Mirando otra cuenta, lo que se crea y lo que se mueve es de
                ella. Sin decirlo, se edita el embudo del cliente creyendo estar
                en el propio. */}
            {tablero.esOtraCuenta && (
                <p className="flex items-center gap-1.5 text-xs text-blue-600">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    Estás viendo el tablero de <span className="font-medium">{tablero.cuentaNombre}</span>. Lo que
                    crees o muevas aquí es de esa cuenta.
                </p>
            )}

            {recortadas && (
                <p className="text-xs text-muted-foreground">
                    Se muestran las {tarjetas.length} conversaciones más recientes de {tablero.total}. Los números de
                    cada columna son el total de verdad; usa el buscador para encontrar las demás.
                </p>
            )}

            {!embudoId ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Kanban className="h-6 w-6 text-muted-foreground" />
                    </div>
                    {manda ? (
                        <>
                            <p className="text-sm font-semibold">Aún no hay embudos en esta cuenta</p>
                            <p className="max-w-sm text-xs text-muted-foreground">
                                Crea el primero con «Nuevo». Las conversaciones sin asesor caerán en él.
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-sm font-semibold">Aún no tienes un embudo asignado</p>
                            <p className="max-w-sm text-xs text-muted-foreground">
                                Cuando el dueño de la cuenta o un administrador te asigne uno, aquí verás tus conversaciones por etapas.
                            </p>
                        </>
                    )}
                </div>
            ) : (
                <DndContext sensors={sensors} onDragStart={alEmpezar} onDragEnd={(e) => void alSoltar(e)}>
                    <div className="min-h-0 w-full flex-1 overflow-x-auto pb-3">
                        <div className="flex h-full gap-3" style={{ width: 'max-content', minWidth: '100%' }}>
                            {etapas.map((etapa, i) => {
                                const suyas = deLaEtapa(etapa.id);
                                return (
                                    <Columna
                                        key={etapa.id}
                                        etapa={etapa}
                                        posicion={i}
                                        tarjetas={suyas}
                                        total={tablero.totales[etapa.id] ?? suyas.length}
                                        buscando={Boolean(busqueda.trim())}
                                        manda={manda}
                                        onEditar={() => abrirEtapasDe()}
                                    >
                                        {suyas.map((t) => (
                                            <TarjetaArrastrable
                                                key={t.id}
                                                tarjeta={t}
                                                puedeMover={puedeMoverLaTarjeta({ manda, personaId }, t.asesorId)}
                                                pie={manda ? <PieDelAsesor asesorId={t.asesorId} nombres={nombres} /> : undefined}
                                            />
                                        ))}
                                    </Columna>
                                );
                            })}
                            {manda && (
                                <button
                                    type="button"
                                    onClick={() => abrirEtapasDe(undefined, true)}
                                    className="flex h-full w-[200px] min-w-[200px] shrink-0 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                >
                                    <Plus className="h-4 w-4" />
                                    Nueva etapa
                                </button>
                            )}
                        </div>
                    </div>
                    <DragOverlay>
                        {arrastrada && (
                            <div className="w-[244px] rotate-2 shadow-2xl">
                                <KanbanCardItem card={comoTarjetaDelKanban(arrastrada)} isDragging />
                            </div>
                        )}
                    </DragOverlay>
                </DndContext>
            )}

            {/* ─── Crear embudo ─── */}
            <Dialog open={crearAbierto} onOpenChange={(v) => !guardando && setCrearAbierto(v)}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Nuevo embudo</DialogTitle>
                    </DialogHeader>
                    <Input
                        autoFocus
                        value={nombre}
                        maxLength={TOPE_DE_NOMBRE}
                        onChange={(e) => setNombre(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && nombre.trim() && void crear()}
                        placeholder="Nombre del embudo"
                        aria-label="Nombre del embudo"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCrearAbierto(false)} disabled={guardando}>
                            Cancelar
                        </Button>
                        <Button onClick={() => void crear()} disabled={guardando || !nombre.trim()}>
                            {guardando ? 'Creando…' : 'Crear'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Renombrar ─── */}
            <Dialog open={renombrarAbierto} onOpenChange={(v) => !guardando && setRenombrarAbierto(v)}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Renombrar embudo</DialogTitle>
                    </DialogHeader>
                    <Input
                        autoFocus
                        value={nombre}
                        maxLength={TOPE_DE_NOMBRE}
                        onChange={(e) => setNombre(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && nombre.trim() && void renombrar()}
                        aria-label="Nombre del embudo"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenombrarAbierto(false)} disabled={guardando}>
                            Cancelar
                        </Button>
                        <Button variant="save" onClick={() => void renombrar()} disabled={guardando || !nombre.trim()}>
                            {guardando ? 'Guardando…' : 'Guardar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Borrar ─── */}
            <AlertDialog open={borrarAbierto} onOpenChange={(v) => !guardando && setBorrarAbierto(v)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar el embudo «{actual?.nombre}»?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se borran sus etapas y las posiciones de las tarjetas. Las conversaciones NO se borran: las de
                            sus asesores pasan al embudo por defecto. No se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={guardando}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(e) => {
                                e.preventDefault();
                                void borrar();
                            }}
                            disabled={guardando}
                        >
                            {guardando ? 'Eliminando…' : 'Eliminar'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ─── Editar etapas ─── */}
            <Sheet open={etapasAbierto} onOpenChange={(v) => !guardando && setEtapasAbierto(v)}>
                <SheetContent side="right" className="flex w-[22rem] max-w-full flex-col gap-4 sm:max-w-[22rem]">
                    <SheetHeader>
                        <SheetTitle>Etapas del embudo</SheetTitle>
                        <p className="text-xs text-muted-foreground">
                            {actual ? `«${actual.nombre}». ` : ''}El color nace por posición y se puede cambiar.
                        </p>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                        {borradorEtapas.map((e, i) => {
                            const color = elColorDeLaEtapa(e.color, i);
                            return (
                                <div key={e.clave} className="space-y-2 rounded-md border border-border bg-background p-2">
                                    <div className="flex items-center gap-1.5">
                                        <div className="flex flex-col">
                                            <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30" disabled={i === 0} onClick={() => moverEtapa(i, -1)} aria-label="Subir etapa" title="Subir">
                                                <ArrowUp className="h-3 w-3" />
                                            </button>
                                            <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30" disabled={i === borradorEtapas.length - 1} onClick={() => moverEtapa(i, 1)} aria-label="Bajar etapa" title="Bajar">
                                                <ArrowDown className="h-3 w-3" />
                                            </button>
                                        </div>
                                        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', color.punto)} />
                                        <Input
                                            value={e.nombre}
                                            maxLength={TOPE_DE_NOMBRE}
                                            onChange={(ev) => cambiarEtapa(e.clave, { nombre: ev.target.value })}
                                            placeholder="Nombre de la etapa"
                                            className="h-8 min-w-0 flex-1"
                                            aria-label={`Nombre de la etapa ${i + 1}`}
                                        />
                                        <button
                                            type="button"
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"
                                            onClick={() => setBorradorEtapas((l) => l.filter((x) => x.clave !== e.clave))}
                                            disabled={borradorEtapas.length <= 1}
                                            title={borradorEtapas.length <= 1 ? 'Un embudo necesita al menos una etapa' : 'Eliminar etapa'}
                                            aria-label="Eliminar etapa"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-1.5 pl-6">
                                        <span className="mr-1 text-[11px] text-muted-foreground">Color</span>
                                        {COLORES_DE_ETAPA.map((c, k) => (
                                            <button
                                                key={k}
                                                type="button"
                                                onClick={() => cambiarEtapa(e.clave, { color: k })}
                                                title={c.nombre}
                                                aria-label={`Color ${c.nombre}`}
                                                aria-pressed={color === c}
                                                className={cn('h-5 w-5 rounded-full', c.punto, color === c && 'ring-2 ring-ring ring-offset-2')}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                        <button
                            type="button"
                            disabled={borradorEtapas.length >= TOPE_DE_ETAPAS}
                            onClick={() => setBorradorEtapas((l) => [...l, { clave: nuevaClave(), id: null, nombre: '', color: null }])}
                            className="flex h-10 w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
                        >
                            <Plus className="h-4 w-4" />
                            Nueva etapa
                        </button>
                        <p className="text-[11px] text-muted-foreground">
                            Al eliminar una etapa, sus conversaciones pasan a la primera.
                        </p>
                    </div>
                    <SheetFooter>
                        <Button variant="outline" onClick={() => setEtapasAbierto(false)} disabled={guardando}>
                            Cancelar
                        </Button>
                        <Button variant="save" onClick={() => void guardarEtapas()} disabled={guardando}>
                            {guardando ? 'Guardando…' : 'Guardar'}
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>

            {/* ─── Asignar asesores ─── */}
            <Sheet open={asesoresAbierto} onOpenChange={(v) => !guardando && setAsesoresAbierto(v)}>
                <SheetContent side="right" className="flex w-[22rem] max-w-full flex-col gap-4 sm:max-w-[22rem]">
                    <SheetHeader>
                        <SheetTitle>Asesores y su embudo</SheetTitle>
                        <p className="text-xs text-muted-foreground">
                            Cada asesor ve solo el embudo que tenga aquí, con sus conversaciones. Sin embudo, sus
                            conversaciones caen en el embudo por defecto{porDefecto ? ` («${porDefecto.nombre}»)` : ''}.
                        </p>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                        {tablero.equipo.length === 0 && (
                            <p className="text-sm text-muted-foreground">Esta cuenta todavía no tiene equipo.</p>
                        )}
                        {tablero.equipo.map((p) => (
                            <div key={p.id} className="flex items-center gap-2 rounded-md border border-border bg-background p-2">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                                    {iniciales(p.nombre)}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm" title={p.nombre}>
                                        {p.nombre}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {p.rol === 'dueno' ? 'Dueño' : p.rol === 'administrador' ? 'Administrador' : 'Asesor'}
                                    </p>
                                </div>
                                <Select
                                    value={borradorAsesores[p.id] ?? SIN_EMBUDO}
                                    onValueChange={(v) =>
                                        setBorradorAsesores((m) => {
                                            const copia = { ...m };
                                            if (v === SIN_EMBUDO) delete copia[p.id];
                                            else copia[p.id] = v;
                                            return copia;
                                        })
                                    }
                                >
                                    <SelectTrigger className="h-8 w-36 shrink-0" aria-label={`Embudo de ${p.nombre}`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {embudos.map((e) => (
                                            <SelectItem key={e.id} value={e.id}>
                                                {e.nombre}
                                            </SelectItem>
                                        ))}
                                        <SelectItem value={SIN_EMBUDO}>Sin embudo</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        ))}
                    </div>
                    <SheetFooter>
                        <Button variant="outline" onClick={() => setAsesoresAbierto(false)} disabled={guardando}>
                            Cancelar
                        </Button>
                        <Button variant="save" onClick={() => void guardarAsesores()} disabled={guardando}>
                            {guardando ? 'Guardando…' : 'Guardar'}
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </div>
    );
}
