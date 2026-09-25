'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
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
    Check,
    ChevronDown,
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
    type Etapa,
} from '@/lib/embudos';
import type { KanbanCard } from '@/actions/crm-kanban-actions';
import type { TableroDeEmbudo, TarjetaDeEmbudo } from '@/lib/tablero-de-embudo.server';
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
    manda,
    onEditar,
    children,
}: {
    etapa: Etapa;
    posicion: number;
    tarjetas: TarjetaDeEmbudo[];
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
                    <Badge className="border-0 bg-white/20 text-xs font-medium text-white">{tarjetas.length}</Badge>
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

    const recargar = useCallback(async (pedido?: string | null) => {
        setCargando(true);
        const r = await pedir(() => tableroDelEmbudoAction(pedido ?? null));
        setCargando(false);
        if (!r.success || !r.data) {
            toast.error(r.message);
            return;
        }
        setTablero(r.data);
        // El embudo abierto queda en la dirección, para volver a él al recargar.
        try {
            const url = new URL(window.location.href);
            if (r.data.embudoId && r.data.manda) url.searchParams.set('embudo', r.data.embudoId);
            else url.searchParams.delete('embudo');
            window.history.replaceState(null, '', url.toString());
        } catch {
            // Sin dirección que tocar no pasa nada: el tablero ya está pintado.
        }
    }, []);

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
        const r = await pedir(() => crearEmbudoAction(nombre));
        setGuardando(false);
        if (!r.success || !r.data) return toast.error(r.message);
        setCrearAbierto(false);
        setNombre('');
        toast.success('Embudo creado. Ajusta sus etapas.');
        await recargar(r.data.id);
        abrirEtapasDe(r.data.id);
    };

    const renombrar = async () => {
        if (!actual) return;
        setGuardando(true);
        const r = await pedir(() => renombrarEmbudoAction(actual.id, nombre));
        setGuardando(false);
        if (!r.success) return toast.error(r.message);
        setRenombrarAbierto(false);
        toast.success(r.message);
        await recargar(actual.id);
    };

    const borrar = async () => {
        if (!actual) return;
        setGuardando(true);
        const r = await pedir(() => borrarEmbudoAction(actual.id));
        setGuardando(false);
        setBorrarAbierto(false);
        if (!r.success) return toast.error(r.message);
        toast.success(r.message);
        await recargar(null);
    };

    const marcarPorDefecto = async () => {
        if (!actual) return;
        const r = await pedir(() => usarPorDefectoAction(actual.id));
        if (!r.success) return toast.error(r.message);
        toast.success(r.message);
        await recargar(actual.id);
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
            void pedir(() => tableroDelEmbudoAction(id)).then((r) => {
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
            ),
        );
        setGuardando(false);
        if (!r.success) return toast.error(r.message);
        setEtapasAbierto(false);
        toast.success(r.message);
        await recargar(destino);
    };

    // ─── Asesores ───────────────────────────────────────────────────────────
    const abrirAsesores = () => {
        setBorradorAsesores({ ...tablero.asignaciones });
        setAsesoresAbierto(true);
    };

    const guardarAsesores = async () => {
        setGuardando(true);
        const pares = tablero.equipo.map((p) => ({ personaId: p.id, embudoId: borradorAsesores[p.id] ?? null }));
        const r = await pedir(() => asignarEmbudosAction(pares));
        setGuardando(false);
        if (!r.success) return toast.error(r.message);
        setAsesoresAbierto(false);
        toast.success(r.message);
        await recargar(embudoId);
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
                        <DropdownMenuItem key={e.id} onSelect={() => void recargar(e.id)} className="gap-2">
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
                filtros={selector}
                secundarias={
                    <>
                        <span className="flex items-center gap-1 whitespace-nowrap text-sm text-muted-foreground" title="Conversaciones en este embudo">
                            <Users className="h-3.5 w-3.5" />
                            <span className="font-medium text-foreground">
                                {busqueda.trim() ? `${visibles.length}/${tablero.total}` : tablero.total}
                            </span>
                        </span>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            onClick={() => void recargar(embudoId)}
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

            {recortadas && (
                <p className="text-xs text-muted-foreground">
                    Se muestran las {tarjetas.length} conversaciones más recientes de {tablero.total}. Usa el buscador para encontrar las demás.
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
