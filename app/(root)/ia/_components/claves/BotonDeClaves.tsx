'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, KeyRound, MessageSquare, Mic, Phone, Video } from 'lucide-react';
import { FaFacebook, FaInstagram, FaTelegramPlane, FaWhatsapp } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getTrainingChannel } from '@/lib/channel-training';
import { leerLasClavesDelCanalAction } from '@/actions/claves-por-canal-actions';
import {
    SECCIONES_DE_CLAVES,
    elEstadoDelBoton,
    lasSeccionesDelCanal,
    type EstadoDeLaClave,
    type EstadoDeSeccion,
    type SeccionDeClaves,
} from '@/lib/claves-por-canal';
import { VentanaDeLaSeccion } from './VentanasDeCadaClave';

const ICONOS: Record<SeccionDeClaves, React.ComponentType<{ className?: string }>> = {
    mensajeria: MessageSquare,
    voz: Mic,
    llamadas: Phone,
    videollamadas: Video,
    'linea-whatsapp-api': FaWhatsapp,
    'linea-telegram': FaTelegramPlane,
    'linea-facebook': FaFacebook,
    'linea-instagram': FaInstagram,
};

const CHIP: Record<EstadoDeLaClave, { texto: string; clase: string }> = {
    lista: {
        texto: 'Configurada',
        clase: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
    },
    pendiente: {
        texto: 'Pendiente',
        clase: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400',
    },
    apagada: {
        texto: 'Apagada',
        clase: 'border-border bg-muted text-muted-foreground',
    },
};

/**
 * «Claves»: a la vista, antes de «Guardar», en cada canal del Agente IA.
 *
 * Sigue la lógica de colores de «Guardar»: en ámbar con un punto cuando falta
 * alguna clave (como el verde de «hay cambios sin guardar»), en gris cuando
 * todo está puesto (como «Guardado»). Sigue pulsable en los dos.
 *
 * Con una sola sección (Llamadas, Videollamadas) abre directamente su ventana;
 * con varias, una ventana con una tarjeta por sección y su estado.
 */
export function BotonDeClaves({ canal, userId }: { canal: string; userId: string }) {
    const secciones = lasSeccionesDelCanal(canal);
    const [estados, setEstados] = useState<EstadoDeSeccion[] | null>(null);
    const [fallo, setFallo] = useState<string | null>(null);
    const [abierta, setAbierta] = useState(false);
    const [seccion, setSeccion] = useState<SeccionDeClaves | null>(null);

    const recargar = useCallback(async () => {
        try {
            const res = await leerLasClavesDelCanalAction(userId, canal);
            if (res.success) {
                setEstados(res.data ?? []);
                setFallo(null);
            } else {
                console.warn('[claves] no se pudo comprobar el estado de las claves', { canal, motivo: res.message });
                setFallo(res.message);
            }
        } catch (error) {
            console.warn('[claves] no se pudo comprobar el estado de las claves', { canal, error: String(error) });
            setFallo('No se pudo comprobar el estado de las claves.');
        }
    }, [userId, canal]);

    useEffect(() => {
        void recargar();
    }, [recargar]);

    if (!secciones.length) return null;

    const general = estados ? elEstadoDelBoton(estados) : null;
    const pendiente = general === 'pendiente';
    const etiqueta = fallo
        ? 'Claves: no se pudo comprobar su estado'
        : general === null
            ? 'Claves'
            : pendiente
                ? 'Claves: falta configurar alguna'
                : 'Claves: todas configuradas';
    const nombreDelCanal = getTrainingChannel(canal)?.label ?? canal;
    const estadoDe = (s: SeccionDeClaves) => estados?.find((e) => e.seccion === s);

    const abrir = () => {
        if (secciones.length === 1) setSeccion(secciones[0]);
        else setAbierta(true);
    };

    return (
        <>
            <div aria-live="polite" aria-atomic="true" className="sr-only">
                {etiqueta}
            </div>
            <TooltipProvider>
                <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            onClick={abrir}
                            aria-label={etiqueta}
                            data-claves-del-canal={canal}
                            data-estado={fallo ? 'fallo' : general ?? 'cargando'}
                            className={cn(
                                'relative h-9 gap-0 px-2 sm:gap-2 sm:px-3',
                                pendiente || fallo
                                    ? 'border border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900'
                                    : 'border border-border bg-muted text-muted-foreground hover:bg-muted/80',
                            )}
                        >
                            <KeyRound className="h-4 w-4" />
                            <span className="hidden sm:inline">Claves</span>
                            {(pendiente || fallo) && (
                                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background" />
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{fallo ?? etiqueta}</TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <Dialog open={abierta} onOpenChange={setAbierta}>
                <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <KeyRound className="h-4 w-4 text-primary" />
                            Claves de {nombreDelCanal}
                        </DialogTitle>
                        <DialogDescription>
                            Cada sección guarda sus propias claves para esta cuenta. Se enseñan enmascaradas.
                        </DialogDescription>
                    </DialogHeader>
                    {fallo && (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                            <span className="text-destructive">{fallo}</span>
                            <Button type="button" size="sm" variant="outline" onClick={() => void recargar()}>
                                Reintentar
                            </Button>
                        </div>
                    )}
                    <div className="grid gap-3">
                        {secciones.map((s) => {
                            const def = SECCIONES_DE_CLAVES[s];
                            const e = estadoDe(s);
                            const Icono = ICONOS[s];
                            const chip = e ? CHIP[e.estado] : null;
                            return (
                                <button
                                    key={s}
                                    type="button"
                                    data-seccion-de-claves={s}
                                    onClick={() => setSeccion(s)}
                                    className={cn(
                                        'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60',
                                        e?.estado === 'pendiente' ? 'border-amber-300 dark:border-amber-700' : 'border-border',
                                    )}
                                >
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                        <Icono className="h-4 w-4 text-primary" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-semibold">{def.titulo}</p>
                                            {chip && (
                                                <span className={cn('shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium', chip.clase)}>
                                                    {chip.texto}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">{def.descripcion}</p>
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                            {def.proveedores.map((p) => (
                                                <span
                                                    key={p.id}
                                                    className={cn(
                                                        'rounded border px-1.5 py-0.5 text-[10px]',
                                                        p.disponible ? 'border-border text-foreground' : 'border-dashed text-muted-foreground',
                                                    )}
                                                >
                                                    {p.nombre}
                                                    {!p.disponible && ' · próximamente'}
                                                </span>
                                            ))}
                                        </div>
                                        {e && <p className="mt-1.5 truncate text-xs text-muted-foreground">{e.detalle}</p>}
                                    </div>
                                    <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
                                </button>
                            );
                        })}
                    </div>
                </DialogContent>
            </Dialog>

            <VentanaDeLaSeccion
                seccion={seccion}
                userId={userId}
                estado={seccion ? estadoDe(seccion) : undefined}
                onOpenChange={(open) => {
                    if (!open) setSeccion(null);
                }}
                onGuardado={() => void recargar()}
            />
        </>
    );
}
